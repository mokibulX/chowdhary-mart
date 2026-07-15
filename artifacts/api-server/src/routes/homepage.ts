import { Router } from "express";
import { getHomepageSections } from "../lib/homepage";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    const sections = await getHomepageSections(Number.isFinite(zoneId) ? zoneId : undefined);
    res.json({ sections });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
