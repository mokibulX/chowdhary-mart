import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 90;
const buckets = new Map<string, { count: number; resetAt: number }>();
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OSRM_BASE = "https://router.project-osrm.org";
const OSM_TILE_MAX_ZOOM = 19;

function env(name: string) {
  return process.env[name] || process.env[`VITE_${name}`] || "";
}

function keyFor(name: "MAPS_API_KEY" | "ROUTES_API_KEY" | "GEOCODING_API_KEY" | "PLACES_API_KEY") {
  return env(name)
    || env("MAPS_API_KEY")
    || env("MAPS_BROWSER_API_KEY")
    || env("GOOGLE_MAPS_API_KEY")
    || env("VITE_MAPS_API_KEY")
    || env("VITE_GOOGLE_MAPS_API_KEY")
    || "";
}

function publicMapsKey() {
  return env("MAPS_BROWSER_API_KEY")
    || env("VITE_MAPS_API_KEY")
    || env("VITE_GOOGLE_MAPS_API_KEY")
    || env("MAPS_API_KEY")
    || env("GOOGLE_MAPS_API_KEY")
    || "";
}

function mapsRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = String(req.ip || req.headers["x-forwarded-for"] || "local");
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT) {
    res.status(429).json({ error: "Too many map requests. Please wait a minute and try again." });
    return;
  }
  next();
}

function googleProblem(feature: string, data: any) {
  const status = String(data?.status || "FAILED");
  const detail = String(data?.error_message || "").trim();
  if (status === "REQUEST_DENIED") {
    return `${feature} is not allowed for this Google API key. Enable the API in Google Cloud and check API restrictions.`;
  }
  if (status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") {
    return `${feature} quota or billing limit has been reached.`;
  }
  if (status === "INVALID_REQUEST") {
    return `${feature} request is invalid.`;
  }
  return detail || `${feature} request failed with status ${status}.`;
}

function isGoogleSuccess(data: any) {
  return data?.status === "OK" || data?.status === "ZERO_RESULTS";
}

function component(longName: string | undefined, shortName: string | undefined, types: string[]) {
  if (!longName) return null;
  return {
    long_name: longName,
    short_name: shortName || longName,
    types,
  };
}

function osmAddressComponents(address: any = {}) {
  return [
    component(address.house_number, address.house_number, ["street_number"]),
    component(address.road || address.pedestrian || address.footway, address.road || address.pedestrian || address.footway, ["route"]),
    component(address.suburb || address.neighbourhood || address.quarter, address.suburb || address.neighbourhood || address.quarter, ["sublocality"]),
    component(address.city || address.town || address.village || address.municipality, address.city || address.town || address.village || address.municipality, ["locality"]),
    component(address.county || address.state_district || address.district, address.county || address.state_district || address.district, ["administrative_area_level_2"]),
    component(address.state, address.state, ["administrative_area_level_1"]),
    component(address.postcode, address.postcode, ["postal_code"]),
    component(address.country, address.country_code?.toUpperCase?.(), ["country"]),
  ].filter(Boolean);
}

function osmToGoogleResult(item: any) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  return {
    formatted_address: item?.display_name || [lat, lng].filter(Number.isFinite).join(", "),
    place_id: `osm:${item?.osm_type || "place"}:${item?.osm_id || `${lat},${lng}`}`,
    types: [item?.category, item?.type].filter(Boolean),
    geometry: {
      location: { lat, lng },
      location_type: "APPROXIMATE",
    },
    address_components: osmAddressComponents(item?.address),
    name: item?.name || item?.address?.amenity || item?.address?.shop || item?.address?.road,
  };
}

async function fetchOsmJson<T = any>(path: string, params: URLSearchParams): Promise<T> {
  params.set("format", "jsonv2");
  params.set("addressdetails", "1");
  const response = await fetch(`${NOMINATIM_BASE}${path}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ChowdharyMart/1.0 location fallback",
    },
  });
  if (!response.ok) throw new Error(`OpenStreetMap request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function fallbackGeocode(req: Request, googleError?: string) {
  if (req.query.latlng) {
    const [lat, lon] = String(req.query.latlng).split(",").map((value) => value.trim());
    const item = await fetchOsmJson<any>("/reverse", new URLSearchParams({ lat, lon, zoom: "18" }));
    return {
      status: "OK",
      provider: "openstreetmap",
      fallback: Boolean(googleError),
      fallbackReason: googleError,
      results: [osmToGoogleResult(item)],
    };
  }

  const address = String(req.query.address ?? "").trim();
  const items = await fetchOsmJson<any[]>("/search", new URLSearchParams({
    q: address,
    countrycodes: "in",
    limit: "8",
  }));
  return {
    status: items?.length ? "OK" : "ZERO_RESULTS",
    provider: "openstreetmap",
    fallback: Boolean(googleError),
    fallbackReason: googleError,
    results: Array.isArray(items) ? items.map(osmToGoogleResult) : [],
  };
}

async function fallbackPlaces(input: string, googleError?: string) {
  const items = await fetchOsmJson<any[]>("/search", new URLSearchParams({
    q: input,
    countrycodes: "in",
    limit: "8",
  }));
  const predictions = Array.isArray(items)
    ? items.map((item: any) => ({
        description: item.display_name,
        place_id: `osm:${item.osm_type || "place"}:${item.osm_id}`,
        structured_formatting: {
          main_text: item.name || item.address?.road || item.address?.suburb || item.display_name?.split(",")?.[0] || input,
          secondary_text: item.display_name,
        },
        terms: String(item.display_name || "").split(",").map((value) => ({ value: value.trim() })),
        types: [item.category, item.type].filter(Boolean),
      }))
    : [];
  return {
    status: predictions.length ? "OK" : "ZERO_RESULTS",
    provider: "openstreetmap",
    fallback: Boolean(googleError),
    fallbackReason: googleError,
    predictions,
  };
}

function parseLatLng(value: string) {
  const [latText, lngText] = value.split(",").map((item) => item.trim());
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error("Invalid route coordinate.");
  }
  return { lat, lng };
}

function distanceText(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function durationText(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

async function fallbackDirections(origin: string, destination: string, googleError?: string) {
  const start = parseLatLng(origin);
  const end = parseLatLng(destination);
  const response = await fetch(
    `${OSRM_BASE}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`OSRM route request failed: ${response.status}`);
  const data = await response.json() as any;
  const route = data?.routes?.[0];
  const coordinates = route?.geometry?.coordinates ?? [];
  const path = Array.isArray(coordinates)
    ? coordinates.map(([lng, lat]: [number, number]) => ({ lat: Number(lat), lng: Number(lng) })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];
  const distance = Number(route?.distance ?? 0);
  const duration = Number(route?.duration ?? 0);
  return {
    status: path.length ? "OK" : "ZERO_RESULTS",
    provider: "osrm",
    fallback: Boolean(googleError),
    fallbackReason: googleError,
    routes: path.length ? [{
      path,
      geometry: route?.geometry,
      legs: [{
        distance: { value: Math.round(distance), text: distanceText(distance) },
        duration: { value: Math.round(duration), text: durationText(duration) },
        start_location: start,
        end_location: end,
      }],
      summary: "Road route",
    }] : [],
  };
}

router.get("/config", mapsRateLimit, (_req, res) => {
  const key = publicMapsKey();
  res.json({
    googleMapsEnabled: Boolean(key),
    browserKey: key || null,
    hasRoutesApi: Boolean(keyFor("ROUTES_API_KEY")),
    hasGeocodingApi: Boolean(keyFor("GEOCODING_API_KEY")),
    hasPlacesApi: Boolean(keyFor("PLACES_API_KEY")),
    mapStyleId: env("MAP_STYLE_ID") || null,
  });
});

router.get("/tile", mapsRateLimit, async (req, res) => {
  try {
    const requestedZ = Number(req.query.z);
    const requestedX = Number(req.query.x);
    const requestedY = Number(req.query.y);
    if (!Number.isInteger(requestedZ) || !Number.isInteger(requestedX) || !Number.isInteger(requestedY)) {
      res.status(400).json({ error: "Invalid map tile coordinate." });
      return;
    }

    const z = Math.max(0, Math.min(OSM_TILE_MAX_ZOOM, requestedZ));
    const max = 2 ** z;
    if (requestedY < 0 || requestedY >= max) {
      res.status(404).end();
      return;
    }
    const x = ((requestedX % max) + max) % max;
    const url = `https://tile.openstreetmap.org/${z}/${x}/${requestedY}.png`;
    const response = await fetch(url, {
      headers: {
        Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "ChowdharyMart/1.0 map tile proxy",
      },
    });

    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).end();
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.send(buffer);
  } catch (err) {
    req.log.error(err);
    res.status(502).end();
  }
});

router.get("/tile/:z/:x/:y", mapsRateLimit, async (req, res) => {
  try {
    const requestedZ = Number(req.params.z);
    const requestedX = Number(req.params.x);
    const requestedY = Number(req.params.y);
    if (!Number.isInteger(requestedZ) || !Number.isInteger(requestedX) || !Number.isInteger(requestedY)) {
      res.status(400).json({ error: "Invalid map tile coordinate." });
      return;
    }

    const z = Math.max(0, Math.min(OSM_TILE_MAX_ZOOM, requestedZ));
    const max = 2 ** z;
    if (requestedY < 0 || requestedY >= max) {
      res.status(404).end();
      return;
    }
    const x = ((requestedX % max) + max) % max;
    const url = `https://tile.openstreetmap.org/${z}/${x}/${requestedY}.png`;
    const response = await fetch(url, {
      headers: {
        Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "ChowdharyMart/1.0 map tile proxy",
      },
    });

    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).end();
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.send(buffer);
  } catch (err) {
    req.log.error(err);
    res.status(502).end();
  }
});

router.get("/places/autocomplete", mapsRateLimit, async (req, res) => {
  const input = String(req.query.input ?? "").trim();
  try {
    if (input.length < 2) {
      res.json({ predictions: [], status: "ZERO_RESULTS" });
      return;
    }

    const key = keyFor("PLACES_API_KEY");
    if (key) {
      const params = new URLSearchParams({
        input,
        key,
        components: String(req.query.components ?? "country:in"),
      });
      if (req.query.location) params.set("location", String(req.query.location));
      if (req.query.radius) params.set("radius", String(req.query.radius));

      const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
      const data = await response.json() as any;
      if (response.ok && isGoogleSuccess(data)) {
        res.json({ ...data, provider: "google" });
        return;
      }
      const fallback = await fallbackPlaces(input, googleProblem("Google Places", data));
      res.json(fallback);
      return;
    }

    res.json(await fallbackPlaces(input, "Google Places API key is not configured."));
  } catch (err) {
    req.log.error(err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Map place search failed" });
  }
});

router.get("/geocode", mapsRateLimit, async (req, res) => {
  try {
    if (!req.query.address && !req.query.latlng) {
      res.status(400).json({ error: "address or latlng is required" });
      return;
    }

    const key = keyFor("GEOCODING_API_KEY");
    if (key) {
      const params = new URLSearchParams({ key });
      if (req.query.address) params.set("address", String(req.query.address));
      if (req.query.latlng) params.set("latlng", String(req.query.latlng));
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
      const data = await response.json() as any;
      if (response.ok && isGoogleSuccess(data)) {
        res.json({ ...data, provider: "google" });
        return;
      }
      res.json(await fallbackGeocode(req, googleProblem("Google Geocoding", data)));
      return;
    }

    res.json(await fallbackGeocode(req, "Google Geocoding API key is not configured."));
  } catch (err) {
    req.log.error(err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Google/OpenStreetMap geocoding request failed" });
  }
});

router.get("/directions", requireAuth, async (req, res) => {
  try {
    const origin = String(req.query.origin ?? "");
    const destination = String(req.query.destination ?? "");
    if (!origin || !destination) {
      res.status(400).json({ error: "origin and destination are required" });
      return;
    }

    const key = keyFor("ROUTES_API_KEY");
    if (!key) {
      res.json(await fallbackDirections(origin, destination, "Google Directions API key is not configured."));
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
    const data = await response.json() as any;
    if (!response.ok || !isGoogleSuccess(data)) {
      res.json(await fallbackDirections(origin, destination, googleProblem("Google Directions", data)));
      return;
    }
    res.json({ ...data, provider: "google" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Google Directions request failed" });
  }
});

export default router;
