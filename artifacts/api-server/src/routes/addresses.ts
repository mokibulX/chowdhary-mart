import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, addressesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

let addressLocationColumnsReady = false;
async function ensureAddressLocationColumns() {
  if (addressLocationColumnsReady) return;
  await db.execute(sql`alter table addresses add column if not exists district varchar(120)`);
  addressLocationColumnsReady = true;
}

router.use(requireAuth);

// GET /api/addresses
router.get("/", async (req: AuthRequest, res) => {
  try {
    await ensureAddressLocationColumns();
    const addresses = await db.select().from(addressesTable)
      .where(eq(addressesTable.userId, req.user!.userId));
    res.json(addresses);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/addresses
router.post("/", async (req: AuthRequest, res) => {
  try {
    await ensureAddressLocationColumns();
    const { label, name, phone, line1, line2, city, district, state, pincode, lat, lng, isDefault } = req.body;
    const userId = req.user!.userId;

    if (isDefault) {
      // Unset existing defaults
      await db.update(addressesTable)
        .set({ isDefault: false })
        .where(eq(addressesTable.userId, userId));
    }

    const [address] = await db.insert(addressesTable).values({
      userId,
      label: label || "Home",
      name,
      phone,
      line1,
      line2,
      city,
      district: district || null,
      state,
      pincode,
      lat,
      lng,
      isDefault: isDefault ?? false,
    }).returning();

    res.status(201).json(address);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/addresses/:addressId
router.patch("/:addressId", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.addressId);
    const userId = req.user!.userId;
    await ensureAddressLocationColumns();
    const { label, name, phone, line1, line2, city, district, state, pincode, lat, lng, isDefault } = req.body;

    if (isDefault) {
      await db.update(addressesTable)
        .set({ isDefault: false })
        .where(eq(addressesTable.userId, userId));
    }

    const [address] = await db.update(addressesTable)
      .set({ label, name, phone, line1, line2, city, district: district || null, state, pincode, lat, lng, isDefault })
      .where(and(eq(addressesTable.id, id), eq(addressesTable.userId, userId)))
      .returning();

    if (!address) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.json(address);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/addresses/:addressId
router.delete("/:addressId", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.addressId);
    await db.delete(addressesTable)
      .where(and(eq(addressesTable.id, id), eq(addressesTable.userId, req.user!.userId)));
    res.json({ message: "Address deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
