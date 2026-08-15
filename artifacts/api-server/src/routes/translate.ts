import { Router } from "express";

const router = Router();
const cache = new Map<string, string>();
const supportedLanguages = new Set([
  "as", "bn", "brx", "doi", "gu", "hi", "kn", "ks", "kok", "mai", "ml", "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur",
]);

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function translateWithCloud(texts: string[], target: string) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: texts, source: "en", target, format: "text" }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return (data?.data?.translations ?? []).map((item: any) => String(item?.translatedText ?? ""));
}

async function translatePublic(text: string, target: string) {
  const params = new URLSearchParams({ client: "gtx", sl: "en", tl: target, dt: "t", q: text });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
    headers: { "user-agent": "ChowdharyMart/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return text;
  const data = await response.json() as any;
  return Array.isArray(data?.[0]) ? data[0].map((part: any[]) => String(part?.[0] ?? "")).join("") || text : text;
}

async function translatePublicBatch(texts: string[], target: string) {
  const translated: string[] = [];
  const separator = " ⟪CM_SPLIT⟫ ";
  for (let index = 0; index < texts.length; index += 20) {
    const group = texts.slice(index, index + 20);
    const combined = await translatePublic(group.join(separator), target).catch(() => group.join(separator));
    const parts = combined.split(/\s*⟪CM_SPLIT⟫\s*/);
    if (parts.length === group.length) translated.push(...parts);
    else translated.push(...await Promise.all(group.map((text) => translatePublic(text, target).catch(() => text))));
  }
  return translated;
}

router.post("/translate", async (req, res) => {
  const target = cleanText(req.body?.target).toLowerCase();
  const texts = Array.isArray(req.body?.texts)
    ? [...new Set(req.body.texts.map(cleanText).filter(Boolean))].slice(0, 60) as string[]
    : [];
  if (!supportedLanguages.has(target) || !texts.length) {
    res.status(400).json({ error: "A supported Indian language and text list are required." });
    return;
  }

  const result: Record<string, string> = {};
  const missing = texts.filter((text) => {
    const saved = cache.get(`${target}:${text}`);
    if (saved) result[text] = saved;
    return !saved;
  });

  try {
    const cloud = missing.length ? await translateWithCloud(missing, target) : [];
    if (cloud?.length === missing.length) {
      missing.forEach((text, index) => { result[text] = cloud[index] || text; });
    } else {
      const translated = await translatePublicBatch(missing, target);
      missing.forEach((text, index) => { result[text] = translated[index] || text; });
    }
  } catch {
    missing.forEach((text) => { result[text] = text; });
  }

  Object.entries(result).forEach(([text, translated]) => {
    if (translated && translated !== text) cache.set(`${target}:${text}`, translated);
  });
  res.json({ target, translations: result });
});

export default router;
