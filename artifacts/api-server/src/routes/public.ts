import { Router } from "express";
import { getEligibleRegistrationZones, publicZone, validateZoneSelection } from "../lib/zones";

const router = Router();

router.get("/service-zones", async (req, res) => {
  try {
    const type = req.query.type === "rider" ? "rider" : "seller";
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const zones = await getEligibleRegistrationZones(type, lat, lng);
    res.json({ items: zones.map(publicZone) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load service zones" });
  }
});

router.get("/service-zones/:zoneId/validate", async (req, res) => {
  try {
    const type = req.query.type === "rider" ? "rider" : "seller";
    const result = await validateZoneSelection(type, req.params.zoneId, req.query.lat, req.query.lng);
    if (!result.ok) {
      res.status(400).json({ serviceable: false, error: result.error });
      return;
    }
    res.json({ serviceable: true, zone: publicZone({ ...result.zone, insideServiceZone: true, distanceKm: 0 }) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not validate service zone" });
  }
});

export default router;
