import { Router } from "express";
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

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
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

    if (!name || !password) {
      res.status(400).json({ error: "Name and password are required" });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: "Email or phone is required" });
      return;
    }

    const userRole = resolvePublicRole(role);
    if (!userRole || blockedPublicRoles.has(normalizeRole(role))) {
      res.status(403).json({ error: "This account type cannot be created from the public application." });
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

    const passwordHash = await hashPassword(password);
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

    const [user] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(usersTable).values({
        name: name.trim(),
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
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
        await tx.insert(deliveryPartnersTable).values({
          userId: created.id,
          currentZoneId: zoneValidation?.ok ? zoneValidation.zone.id : null,
          vehicleType: normalizeVehicleType(req.body.vehicleType),
          vehicleNumber: cleanText(req.body.vehicleNumber) ?? null,
          currentLat: req.body.currentLatitude !== undefined || req.body.lat !== undefined ? safeCoordinate(req.body.currentLatitude ?? req.body.lat) : null,
          currentLng: req.body.currentLongitude !== undefined || req.body.lng !== undefined ? safeCoordinate(req.body.currentLongitude ?? req.body.lng) : null,
          isOnline: false,
          isVerified: testMode.enabled && testMode.allowDemoApproval,
          rating: "0.00",
        });
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
    res.status(500).json({ error: "Internal server error" });
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
    const otpOk = await verifyOtp({ target: phone, channel: "sms", purpose: "delivery_register", otp });
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
      currentZoneId: deliveryPartner?.currentZoneId ?? store?.zoneId ?? null,
      storeId: store?.id ?? null,
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
