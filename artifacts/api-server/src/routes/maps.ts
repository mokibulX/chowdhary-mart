import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

function keyFor(name: "MAPS_API_KEY" | "ROUTES_API_KEY" | "GEOCODING_API_KEY" | "PLACES_API_KEY") {
  return process.env[name] || process.env.MAPS_API_KEY || "";
}

function publicMapsKey() {
  return process.env.MAPS_BROWSER_API_KEY || process.env.MAPS_API_KEY || "";
}

router.get("/config", requireAuth, (_req, res) => {
  res.json({
    googleMapsEnabled: Boolean(publicMapsKey()),
    hasRoutesApi: Boolean(keyFor("ROUTES_API_KEY")),
    hasGeocodingApi: Boolean(keyFor("GEOCODING_API_KEY")),
    hasPlacesApi: Boolean(keyFor("PLACES_API_KEY")),
    mapStyleId: process.env.MAP_STYLE_ID || null,
  });
});

router.get("/places/autocomplete", requireAuth, async (req, res) => {
  try {
    const input = String(req.query.input ?? "").trim();
    if (input.length < 2) { res.json({ predictions: [] }); return; }
    const key = keyFor("PLACES_API_KEY");
    if (!key) { res.status(503).json({ error: "PLACES_API_KEY is not configured" }); return; }

    const params = new URLSearchParams({
      input,
      key,
      components: String(req.query.components ?? "country:in"),
    });
    if (req.query.location) params.set("location", String(req.query.location));
    if (req.query.radius) params.set("radius", String(req.query.radius));

    const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Google Places request failed" });
  }
});

router.get("/geocode", requireAuth, async (req, res) => {
  try {
    const key = keyFor("GEOCODING_API_KEY");
    if (!key) { res.status(503).json({ error: "GEOCODING_API_KEY is not configured" }); return; }
    const params = new URLSearchParams({ key });
    if (req.query.address) params.set("address", String(req.query.address));
    if (req.query.latlng) params.set("latlng", String(req.query.latlng));
    if (!params.has("address") && !params.has("latlng")) {
      res.status(400).json({ error: "address or latlng is required" });
      return;
    }
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Google Geocoding request failed" });
  }
});

router.get("/directions", requireAuth, async (req, res) => {
  try {
    const key = keyFor("ROUTES_API_KEY");
    if (!key) { res.status(503).json({ error: "ROUTES_API_KEY is not configured" }); return; }
    const origin = String(req.query.origin ?? "");
    const destination = String(req.query.destination ?? "");
    if (!origin || !destination) {
      res.status(400).json({ error: "origin and destination are required" });
      return;
    }

    const params = new URLSearchParams({
      origin,
      destination,
      key,
      mode: String(req.query.mode ?? "driving"),
      departure_time: String(req.query.departure_time ?? "now"),
      traffic_model: String(req.query.traffic_model ?? "best_guess"),
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Google Directions request failed" });
  }
});

export default router;
