import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { signToken, hashPassword, comparePassword, generateReferralCode } from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();
const DEMO_OTP = "123456";

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

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, role = "customer" } = req.body as {
      name: string;
      email?: string;
      phone?: string;
      password: string;
      role?: string;
    };

    if (!name || !password) {
      res.status(400).json({ error: "Name and password are required" });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: "Email or phone is required" });
      return;
    }

    // Check existing
    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const existing = await db.select().from(usersTable).where(or(...conditions)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "User with this email or phone already exists" });
      return;
    }

    const allowedRoles = ["customer", "vendor", "delivery_partner"];
    const userRole = allowedRoles.includes(role) ? (role as "customer" | "vendor" | "delivery_partner") : "customer";

    const passwordHash = await hashPassword(password);
    const referralCode = generateReferralCode();

    const [user] = await db.insert(usersTable).values({
      name,
      email: email ?? null,
      phone: phone ?? null,
      passwordHash,
      role: userRole,
      referralCode,
    }).returning();

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
    const { email, phone, password } = req.body as { email?: string; phone?: string; password: string };

    if (!password || (!email && !phone)) {
      res.status(400).json({ error: "Credentials required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [user] = await db.select().from(usersTable).where(or(...conditions)).limit(1);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: "Account is disabled" });
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
    const { email, phone, otp } = req.body as { email?: string; phone?: string; otp?: string };

    if (otp !== DEMO_OTP || (!email && !phone)) {
      res.status(400).json({ error: "Valid email/phone and OTP are required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [user] = await db.select().from(usersTable).where(or(...conditions)).limit(1);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Account not found or disabled" });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.json({ token, user: publicAuthUser(user) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, phone, otp, password } = req.body as { email?: string; phone?: string; otp?: string; password?: string };

    if (otp !== DEMO_OTP || !password || password.length < 6 || (!email && !phone)) {
      res.status(400).json({ error: "Valid OTP, new password and email/phone are required" });
      return;
    }

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const [existing] = await db.select().from(usersTable).where(or(...conditions)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [user] = await db.update(usersTable)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning();

    res.json({ message: "Password updated successfully", user: publicAuthUser(user) });
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
