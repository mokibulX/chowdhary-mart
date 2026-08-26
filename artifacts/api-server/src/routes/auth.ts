import { Router, type Request } from "express";
import { randomBytes } from "node:crypto";
import { storePrivateDocument } from "./uploads";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { deliveryPartnersTable, storesTable, usersTable, sellerZoneAssignmentsTable, riderZoneAssignmentsTable } from "@workspace/db";
import { signToken, hashPassword, comparePassword, generateReferralCode } from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { testMode } from "../lib/test-mode";
import { validateZoneSelection } from "../lib/zones";
import { requestOtp, resolveOtpChannel, verifyOtp } from "../lib/otp-service";

const router = Router();
const publicRoles = ["customer", "vendor", "delivery_partner"] as const;
type PublicRole = (typeof publicRoles)[number];
const publicRoleSet = new Set<string>(publicRoles);
const blockedPublicRoles = new Set(["admin", "super_admin", "platform_admin", "city_admin", "zone_admin", "support_admin", "finance_admin", "content_admin"]);
const genericAuthMessage = "Invalid credentials or account unavailable.";
const genericForgotMessage = "If an eligible account exists, recovery instructions have been sent.";
const maxAccountsPerPhone = Number(process.env.MAX_ACCOUNTS_PER_PHONE ?? 3);
let deliveryReviewColumnsReady: Promise<void> | null = null;

const BANK_PREFIXES: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  BKID: "Bank of India",
  CBIN: "Central Bank of India",
  IOBA: "Indian Overseas Bank",
  YESB: "Yes Bank",
  KKBK: "Kotak Mahindra Bank",
  INDB: "IndusInd Bank",
  IDFB: "IDFC First Bank",
  FDRL: "Federal Bank",
  MAHB: "Bank of Maharashtra",
  SYNB: "Canara Bank",
  UCBA: "UCO Bank",
};

function ensureDeliveryReviewColumns() {
  deliveryReviewColumnsReady ??= (async () => {
    await db.execute(sql`alter table delivery_partners add column if not exists delivery_status varchar(30) not null default 'pending'`);
    await db.execute(sql`alter table delivery_partners add column if not exists account_holder_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_account_number text`);
    await db.execute(sql`alter table delivery_partners add column if not exists ifsc varchar(11)`);
    await db.execute(sql`alter table delivery_partners add column if not exists branch_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists upi_id text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_verification_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists document_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists selfie_verification_status varchar(40) not null default 'manual_review_required'`);
    await db.execute(sql`alter table delivery_partners add column if not exists face_match_status varchar(40) not null default 'manual_review_required'`);
    await db.execute(sql`alter table delivery_partners add column if not exists profile_selfie text`);
    await db.execute(sql`alter table delivery_partners add column if not exists live_selfie text`);
    await db.execute(sql`alter table delivery_partners add column if not exists aadhaar_last4 varchar(4)`);
    await db.execute(sql`alter table delivery_partners add column if not exists pan_number varchar(10)`);
    await db.execute(sql`alter table delivery_partners add column if not exists emergency_phone varchar(20)`);
    await db.execute(sql`alter table delivery_partners add column if not exists full_address text`);
    await db.execute(sql`alter table delivery_partners add column if not exists city varchar(120)`);
    await db.execute(sql`alter table delivery_partners add column if not exists pincode varchar(12)`);
    await db.execute(sql`alter table delivery_partners add column if not exists address_proof_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists vehicle_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists number_plate_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists license_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists license_back_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_back_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_proof_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists aadhaar_document text`);
    await db.execute(sql`alter table delivery_partners add column if not exists pan_document text`);
  })();
  return deliveryReviewColumnsReady;
}

function publicAuthUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    walletBalance: user.walletBalance,
    loyaltyPoints: user.loyaltyPoints,
    referralCode: user.referralCode,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function cleanPhone(value: unknown) {
  const text = String(value ?? "").replace(/\D/g, "");
  return text ? text : undefined;
}

async function storeOptionalPrivateDocument(req: Request, value: unknown, folder: string, ownerUserId: number) {
  const reference = cleanText(value);
  if (!reference) return null;
  if (!reference.startsWith("data:")) {
    throw new Error("Document upload is invalid. Please select the document again.");
  }
  return (await storePrivateDocument(req, reference, folder, ownerUserId)).url;
}

async function lookupIfsc(ifsc: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as { BANK?: string; BRANCH?: string; IFSC?: string };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateBankDetails(body: Record<string, unknown>) {
  const account = cleanPhone(body.bankAccountNumber);
  const confirm = cleanPhone(body.confirmBankAccountNumber);
  const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
  const branch = cleanText(body.branchName);
  const bankName = String(body.bankName ?? "").trim();
  const upiId = String(body.upiId ?? "").trim();

  if (upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(upiId)) {
    throw new Error("Enter a valid UPI ID.");
  }
  if (!upiId && !account) throw new Error("UPI ID or bank account is required.");
  if (!account) return;
  if (!/^\d{9,18}$/.test(account)) throw new Error("Bank account number must be 9 to 18 digits.");
  if (account !== confirm) throw new Error("Bank account number does not match.");
  if (/^(\d)\1+$/.test(account) || "01234567890123456789".includes(account) || "98765432109876543210".includes(account)) {
    throw new Error("Enter a real bank account number, not repeated or sequence digits.");
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error("Enter a valid 11 character IFSC code, example SBIN0001234.");
  const bank = BANK_PREFIXES[ifsc.slice(0, 4)];
  if (!bank) throw new Error("This IFSC bank code is not recognised. Check IFSC from cheque/passbook.");
  const normalizedBankName = bankName.toLowerCase();
  if (bankName.length < 3 || (!bank.toLowerCase().includes(normalizedBankName) && !normalizedBankName.includes(bank.toLowerCase().split(" ")[0]))) {
    throw new Error(`Bank name must match IFSC bank: ${bank}.`);
  }
  if (!branch || branch.length < 3 || /^(test|demo|na|n\/a|none|null)$/i.test(branch)) {
    throw new Error("Enter the real branch name from cheque/passbook.");
  }
  const liveIfsc = await lookupIfsc(ifsc);
  if (liveIfsc) {
    const liveBank = String(liveIfsc.BANK ?? "").toLowerCase();
    const liveBranch = String(liveIfsc.BRANCH ?? "").toLowerCase();
    if (liveBank && !liveBank.includes(normalizedBankName) && !normalizedBankName.includes(liveBank.split(" ")[0])) {
      throw new Error(`Bank name does not match IFSC record: ${liveIfsc.BANK}.`);
    }
    const typedBranch = branch.toLowerCase();
    if (liveBranch && !liveBranch.includes(typedBranch) && !typedBranch.includes(liveBranch.split(" ")[0])) {
      throw new Error(`Branch does not match IFSC record: ${liveIfsc.BRANCH}.`);
    }
  }
}

function normalizeRole(value: unknown) {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "seller") return "vendor";
  if (role === "rider" || role === "delivery") return "delivery_partner";
  return role;
}

function resolvePublicRole(value: unknown): PublicRole | null {
  const role = normalizeRole(value || "customer");
  return publicRoleSet.has(role) ? (role as PublicRole) : null;
}

function safeCoordinate(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const vehicleTypes = ["bike", "bicycle", "scooter", "car"] as const;
type VehicleType = (typeof vehicleTypes)[number];

function normalizeVehicleType(value: unknown): VehicleType {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (text.includes("bicycle") || text.includes("cycle")) return "bicycle";
  if (text.includes("scooter")) return "scooter";
  if (text.includes("car")) return "car";
  return "bike";
}

router.get("/test-mode", (_req, res) => {
  res.json({
    enabled: testMode.enabled,
    demoOtpEnabled: testMode.allowDemoOtp,
    demoOtpCode: testMode.allowDemoOtp ? testMode.demoOtpCode : undefined,
    requireRealGps: testMode.requireRealGps,
    allowFakeGps: testMode.allowFakeGps,
    maxAccuracyMeters: testMode.maxAccuracyMeters,
  });
});

router.post("/otp/send", async (req, res) => {
  try {
    const email = cleanText(req.body.email)?.toLowerCase();
    const phone = cleanPhone(req.body.phone);
    const purpose = String(req.body.purpose ?? "login") as "login" | "register" | "forgot" | "delivery_register";
    if (!["login", "register", "forgot", "delivery_register"].includes(purpose)) {
      res.status(400).json({ error: "Invalid OTP purpose" });
      return;
    }
    const target = resolveOtpChannel({ email, phone });
    const result = await requestOtp({ ...target, purpose });
    res.json({ message: "OTP sent", ...result });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "OTP send failed" });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, password, role = "customer" } = req.body as {
      name: string;
      email?: string;
      phone?: string;
      password: string;
      role?: string;
    };
    const email = cleanText(req.body.email)?.toLowerCase();
    const phone = cleanPhone(req.body.phone);

    if (!email && !phone) {
      res.status(400).json({ error: "Email or phone is required" });
      return;
    }

    const userRole = resolvePublicRole(role);
    if (!userRole || blockedPublicRoles.has(normalizeRole(role))) {
      res.status(403).json({ error: "This account type cannot be created from the public application." });
      return;
    }
    if (!name || (userRole !== "delivery_partner" && !password)) {
      res.status(400).json({ error: userRole === "delivery_partner" ? "Name is required" : "Name and password are required" });
      return;
    }

    const otp = cleanText(req.body.otp);
    const otpTarget = resolveOtpChannel({ email, phone });
    const otpPurpose = userRole === "delivery_partner" ? "delivery_register" : "register";
    const otpOk = await verifyOtp({ ...otpTarget, purpose: otpPurpose, otp });
    if (!otpOk) {
      res.status(400).json({ error: "Valid OTP is required" });
      return;
    }

    if (email) {
      const existingEmail = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (existingEmail.length > 0) {
        res.status(400).json({ error: "User with this email already exists" });
        return;
      }
    }
    if (phone) {
      const [[phoneCount], existingSameRole] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.phone, phone)),
        db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(maxAccountsPerPhone + 1),
      ]);
      if (Number(phoneCount?.count ?? 0) >= maxAccountsPerPhone) {
        res.status(400).json({ error: `Maximum ${maxAccountsPerPhone} accounts are allowed with one mobile number` });
        return;
      }
      if (existingSameRole.some((item) => item.role === userRole)) {
        res.status(400).json({ error: "This mobile number already has this account type" });
        return;
      }
    }

    const passwordHash = await hashPassword(password || randomBytes(32).toString("base64url"));
    const referralCode = generateReferralCode();
    const zoneValidation = userRole === "vendor"
      ? await validateZoneSelection("seller", req.body.selectedZoneId ?? req.body.zoneId, req.body.shopLatitude ?? req.body.lat, req.body.shopLongitude ?? req.body.lng)
      : userRole === "delivery_partner"
        ? await validateZoneSelection("rider", req.body.selectedZoneId ?? req.body.zoneId, req.body.currentLatitude ?? req.body.lat, req.body.currentLongitude ?? req.body.lng)
        : null;
    if (zoneValidation && !zoneValidation.ok) {
      res.status(400).json({ error: zoneValidation.error });
      return;
    }
    if (userRole === "vendor" && (!cleanText(req.body.avatarUrl) || !cleanText(req.body.bannerUrl))) {
      res.status(400).json({ error: "Seller photo and shop front photo are required" });
      return;
    }
    if (userRole === "delivery_partner") {
      await ensureDeliveryReviewColumns();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required for delivery partner registration.");
      if (!/^\d{10}$/.test(phone ?? "")) throw new Error("A valid 10 digit mobile number is required.");
      if (!/^[A-Za-z .]{2,}$/.test(String(name ?? "").trim())) throw new Error("Valid full name is required.");
      const requiredDocuments = [
        ["aadhaarDocument", req.body.aadhaarDocument ?? req.body.identityFrontImage, "Aadhaar document"],
        ["panDocument", req.body.panDocument, "PAN document"],
        ["profilePhoto", req.body.profilePhoto ?? req.body.profileSelfie ?? req.body.selfieUrl, "Profile photo"],
        ["liveSelfie", req.body.liveSelfie, "Live selfie"],
      ] as const;
      for (const [, value, label] of requiredDocuments) {
        if (!String(value ?? "").startsWith("data:")) throw new Error(`${label} is required.`);
      }
    }

    const [user] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(usersTable).values({
        name: name.trim(),
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
        avatarUrl: cleanText(req.body.avatarUrl) ?? null,
        role: userRole,
        referralCode,
        isVerified: true,
        walletBalance: userRole === "vendor" && testMode.enabled ? "5000.00" : userRole === "delivery_partner" && testMode.enabled ? "1500.00" : "0.00",
      }).returning();

      if (userRole === "vendor") {
        const shopName = cleanText(req.body.shopName) ?? `${created.name}'s Store`;
        const shopAddress = cleanText(req.body.shopAddress) ?? cleanText(req.body.address) ?? "Shop address pending";
        const [store] = await tx.insert(storesTable).values({
          userId: created.id,
          zoneId: zoneValidation?.ok ? zoneValidation.zone.id : null,
          name: shopName,
          description: cleanText(req.body.businessType) ?? "Seller registration pending admin approval",
          logoUrl: cleanText(req.body.logoUrl) ?? null,
          bannerUrl: cleanText(req.body.bannerUrl) ?? null,
          lat: safeCoordinate(req.body.shopLatitude ?? req.body.lat),
          lng: safeCoordinate(req.body.shopLongitude ?? req.body.lng),
          address: shopAddress,
          city: cleanText(req.body.city) ?? null,
          pincode: cleanText(req.body.pincode) ?? null,
          phone: phone ?? null,
          radiusKm: 5,
          deliveryFee: "40",
          freeDeliveryAbove: "299",
          estimatedDeliveryMins: 40,
          isOpen: false,
          isVerified: testMode.enabled && testMode.allowDemoApproval,
          isActive: true,
          gstin: cleanText(req.body.gstNumber) ?? null,
          commissionPercent: "8",
        }).returning();
        if (zoneValidation?.ok) {
          await tx.insert(sellerZoneAssignmentsTable).values({
            sellerId: created.id,
            shopId: store.id,
            zoneId: zoneValidation.zone.id,
            assignmentType: "primary",
            status: store.isVerified ? "approved" : "pending",
            assignedByAdminId: null,
          });
        }
      }

      if (userRole === "delivery_partner") {
        const [partner] = await tx.insert(deliveryPartnersTable).values({
          userId: created.id,
          currentZoneId: zoneValidation?.ok ? zoneValidation.zone.id : null,
          vehicleType: normalizeVehicleType(req.body.vehicleType),
          vehicleNumber: cleanText(req.body.vehicleNumber) ?? null,
          currentLat: req.body.currentLatitude !== undefined || req.body.lat !== undefined ? safeCoordinate(req.body.currentLatitude ?? req.body.lat) : null,
          currentLng: req.body.currentLongitude !== undefined || req.body.lng !== undefined ? safeCoordinate(req.body.currentLongitude ?? req.body.lng) : null,
          isOnline: false,
          isVerified: testMode.enabled && testMode.allowDemoApproval,
          rating: "0.00",
        }).returning();
        const account = cleanPhone(req.body.bankAccountNumber);
        const privateFolder = `delivery-documents`;
        const [aadhaarDocument, panDocument, profilePhoto, liveSelfie, addressProof, vehicleFront, numberPlate, licenseFront, licenseBack, identityBack, bankProof] = await Promise.all([
          storeOptionalPrivateDocument(req, req.body.aadhaarDocument ?? req.body.identityFrontImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.panDocument, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.profilePhoto ?? req.body.profileSelfie ?? req.body.selfieUrl, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.liveSelfie, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.addressProofImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.vehicleFrontImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.numberPlateImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.licenseFrontImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.licenseBackImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.identityBackImage, privateFolder, created.id),
          storeOptionalPrivateDocument(req, req.body.bankProofImage, privateFolder, created.id),
        ]);
        await tx.execute(sql`
          update delivery_partners set
            delivery_status = ${testMode.enabled && testMode.allowDemoApproval ? "approved" : "pending"},
            account_holder_name = ${cleanText(req.body.accountHolderName) ?? created.name},
            bank_name = ${cleanText(req.body.bankName) ?? null},
            bank_account_number = ${account ?? null},
            ifsc = ${cleanText(req.body.ifsc)?.toUpperCase() ?? null},
            branch_name = ${cleanText(req.body.branchName) ?? null},
            upi_id = ${cleanText(req.body.upiId) ?? null},
            bank_verification_status = ${account ? "pending_review" : "upi_only"},
            identity_status = 'pending_review',
            document_status = 'pending_review',
            selfie_verification_status = 'manual_review_required',
            face_match_status = 'manual_review_required',
            profile_selfie = ${profilePhoto},
            live_selfie = ${liveSelfie},
            aadhaar_last4 = ${cleanPhone(req.body.aadhaarNumber)?.slice(-4) ?? null},
            pan_number = ${cleanText(req.body.panNumber)?.toUpperCase() ?? null},
            emergency_phone = ${cleanPhone(req.body.emergencyPhone) ?? null},
            full_address = ${cleanText(req.body.fullAddress) ?? null},
            city = ${cleanText(req.body.city) ?? null},
            pincode = ${cleanText(req.body.pincode) ?? null},
            address_proof_image = ${addressProof},
            vehicle_front_image = ${vehicleFront},
            number_plate_image = ${numberPlate},
            license_front_image = ${licenseFront},
            license_back_image = ${licenseBack},
            identity_front_image = ${aadhaarDocument},
            identity_back_image = ${identityBack ?? panDocument},
            bank_proof_image = ${bankProof}
            ,aadhaar_document = ${aadhaarDocument}
            ,pan_document = ${panDocument}
          where id = ${partner.id}
        `);
        if (zoneValidation?.ok) {
          await tx.insert(riderZoneAssignmentsTable).values({
            riderId: created.id,
            zoneId: zoneValidation.zone.id,
            isPrimary: true,
            status: testMode.enabled && testMode.allowDemoApproval ? "approved" : "pending",
            assignedByAdminId: null,
          });
        }
      }

      return [created];
    });

    const token = signToken({ userId: user.id, role: user.role });

    res.status(201).json({
      token,
      user: publicAuthUser(user),
    });
  } catch (err) {
    req.log.error(err);
    const message = err instanceof Error ? err.message : "Could not complete registration";
    res.status(400).json({ error: message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body as { email?: string; phone?: string; password: string };
    const email = cleanText(req.body.email)?.toLowerCase();
    const phone = cleanPhone(req.body.phone);
    const roleHint = normalizeRole(req.body.roleHint || req.body.requestedRole);

    if (!password || (!email && !phone)) {
      res.status(400).json({ error: "Credentials required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [user] = await db.select().from(usersTable).where(or(...conditions)).limit(1);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }
    if (roleHint && roleHint !== user.role) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role });

    res.json({
      token,
      user: publicAuthUser(user),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/otp-login
router.post("/otp-login", async (req, res) => {
  try {
    const { otp } = req.body as { email?: string; phone?: string; otp?: string };
    const email = cleanText(req.body.email)?.toLowerCase();
    const phone = cleanPhone(req.body.phone);
    const roleHint = normalizeRole(req.body.roleHint || req.body.requestedRole);

    if (!email && !phone) {
      res.status(400).json({ error: "Valid email/phone and OTP are required" });
      return;
    }
    const otpTarget = resolveOtpChannel({ email, phone });
    const otpOk = await verifyOtp({ ...otpTarget, purpose: "login", otp });
    if (!otpOk) {
      res.status(400).json({ error: "Valid email/phone and OTP are required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [user] = await db.select().from(usersTable).where(or(...conditions)).limit(1);
    if (!user || !user.isActive) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }
    if (roleHint && roleHint !== user.role) {
      res.status(401).json({ error: genericAuthMessage });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.json({ token, user: publicAuthUser(user), verificationMode: testMode.allowDemoOtp ? "DEMO" : "REAL" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/delivery-otp/send", async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) {
      res.status(400).json({ error: "Valid mobile number is required" });
      return;
    }
    const result = await requestOtp({ target: phone, channel: "sms", purpose: "delivery_register" });
    res.json({ message: "OTP sent", ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "OTP send failed" });
  }
});

router.post("/delivery-otp/verify", async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? "").replace(/\D/g, "");
    const otp = String(req.body?.otp ?? "");
    // The final registration request consumes the OTP. This preliminary check must
    // leave it usable, otherwise a successfully verified rider cannot submit.
    const otpOk = await verifyOtp({ target: phone, channel: "sms", purpose: "delivery_register", otp, consume: false });
    if (!/^\d{10}$/.test(phone) || !otpOk) {
      res.status(400).json({ error: "Invalid mobile number or OTP" });
      return;
    }
    res.json({
      verified: true,
      verificationMode: testMode.allowDemoOtp ? "DEMO" : "REAL",
      phone,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "OTP verification failed" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const email = cleanText(req.body.email)?.toLowerCase();
    const phone = cleanPhone(req.body.phone);
    const { otp, password } = req.body as { otp?: string; password?: string };

    if (!email && !phone) {
      res.status(400).json({ error: "Valid OTP, new password and email/phone are required" });
      return;
    }
    const otpTarget = resolveOtpChannel({ email, phone });
    const otpOk = await verifyOtp({ ...otpTarget, purpose: "forgot", otp });
    if (!otpOk || !password || password.length < 6 || (!email && !phone)) {
      res.status(400).json({ error: "Valid OTP, new password and email/phone are required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [existing] = await db.select().from(usersTable).where(or(...conditions)).limit(1);
    if (!existing) {
      res.json({ message: genericForgotMessage });
      return;
    }

    const [user] = await db.update(usersTable)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning();

    res.json({ message: genericForgotMessage, user: publicAuthUser(user) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureDeliveryReviewColumns();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [deliveryPartner] = user.role === "delivery_partner"
      ? await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, user.id)).limit(1)
      : [null];
    const [store] = user.role === "vendor"
      ? await db.select().from(storesTable).where(eq(storesTable.userId, user.id)).limit(1)
      : [null];
    const deliveryStatusRows = user.role === "delivery_partner"
      ? await db.execute(sql`select delivery_status as "deliveryStatus" from delivery_partners where user_id = ${user.id} limit 1`)
      : null;
    const deliveryReviewStatus = deliveryStatusRows ? (((deliveryStatusRows as any).rows ?? deliveryStatusRows)?.[0]?.deliveryStatus ?? null) : null;
    res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      walletBalance: user.walletBalance,
      loyaltyPoints: user.loyaltyPoints,
      referralCode: user.referralCode,
      isVerified: user.isVerified,
      isOnline: deliveryPartner?.isOnline ?? false,
      deliveryPartnerId: deliveryPartner?.id ?? null,
      deliveryPartnerVerified: deliveryPartner?.isVerified ?? false,
      deliveryStatus: deliveryPartner ? (deliveryReviewStatus ?? (deliveryPartner.isVerified ? "approved" : "pending")) : null,
      currentZoneId: deliveryPartner?.currentZoneId ?? store?.zoneId ?? null,
      storeId: store?.id ?? null,
      vendorStatus: store ? (store.isVerified && store.isActive ? "approved" : !store.isActive ? "rejected" : "pending") : (user.role === "vendor" ? "pending" : null),
      storeIsOpen: store?.isOpen ?? null,
      storeIsActive: store?.isActive ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/auth/me
router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, avatarUrl, phone } = req.body as { name?: string; avatarUrl?: string; phone?: string };

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name) updates.name = name;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (phone) updates.phone = phone;

    const [user] = await db.update(usersTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId))
      .returning();

    res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      walletBalance: user.walletBalance,
      loyaltyPoints: user.loyaltyPoints,
      referralCode: user.referralCode,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
