import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { db, storesTable, bannersTable } from "@workspace/db";
import { getActiveDeliveryZones, isInsideZone } from "../lib/zones";

const router = Router();

// GET /api/stores
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.max(0.5, Math.min(25, Number(req.query.radiusKm ?? req.query.distance ?? 5) || 5));
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    let eligibleZones: any[] = [];
    const conditions = [
      eq(storesTable.isActive, true),
      eq(storesTable.isOpen, true),
    ];
    if (hasLocation) {
      conditions.push(sql`
        (
          2 * 6371 * asin(
            sqrt(
              power(sin((radians(${storesTable.lat}) - radians(${lat})) / 2), 2) +
              cos(radians(${lat})) * cos(radians(${storesTable.lat})) *
              power(sin((radians(${storesTable.lng}) - radians(${lng})) / 2), 2)
            )
          )
        ) <= coalesce(${storesTable.radiusKm}, ${radiusKm})
      `);
      const zones = await getActiveDeliveryZones(lat, lng);
      eligibleZones = zones.filter((zone) => zone.insideServiceZone);
      const ids = eligibleZones.map((zone) => zone.id);
      conditions.push(ids.length ? inArray(storesTable.zoneId, ids) : sql`false`);
    }
    const stores = await db.select().from(storesTable)
      .where(and(...conditions))
      .orderBy(desc(storesTable.rating))
      .limit(limit);
    res.json(hasLocation
      ? stores.filter((store) => {
          const zone = eligibleZones.find((item) => item.id === store.zoneId);
          return Boolean(zone && isInsideZone(zone, Number(store.lat), Number(store.lng)));
        })
      : stores);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stores/:storeId
router.get("/:storeId", async (req, res) => {
  try {
    const id = Number(req.params.storeId);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id)).limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/banners (mounted via admin router — also export here for direct use)
export async function getBanners() {
  return db.select().from(bannersTable).where(eq(bannersTable.isActive, true));
}

export default router;
