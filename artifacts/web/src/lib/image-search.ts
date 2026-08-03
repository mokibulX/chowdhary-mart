import { resolveRuntimeApiUrl } from "@/lib/mobile-runtime";

export type VisualSearchPayload = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  keywordHint?: string;
  colorHint?: string;
  averageColor?: string;
  fileHash?: string;
  dataUrl?: string;
};

export type VisualSearchResponse = {
  matchType: "same" | "similar" | "none";
  query: string;
  message: string;
  exactProduct?: { id: number; name: string };
  items: Array<{ id: number; name: string }>;
};

export type VisualSearchLocation = {
  lat?: number;
  lng?: number;
  radiusKm?: number | string;
};

const IMAGE_KEYWORDS: Array<[RegExp, string]> = [
  [/(tomato|tamatar|টমেটো|टमाटर)/i, "tomato"],
  [/(potato|aloo|alu|আলু|आलू)/i, "potato"],
  [/(onion|peyaj|piyaz|পেঁয়াজ|प्याज)/i, "onion"],
  [/(banana|kela|কলা|केला)/i, "banana"],
  [/(milk|dudh|দুধ|दूध|amul)/i, "milk"],
  [/(rice|chal|চাল|चावल|masoori)/i, "rice"],
  [/(shoe|chappal|chapal|sandal|slipper|চপ্পল|जूता)/i, "chappal"],
  [/(shirt|tshirt|t-shirt|kurti|dress|fashion|kapor|kapda|কাপড়|कपड़ा)/i, "shirt"],
  [/(jacket|denim|jeans)/i, "jacket"],
  [/(phone|mobile|iphone|android|মোবাইল)/i, "mobile"],
  [/(headphone|earphone|airpod|earbud|buds)/i, "headphones"],
  [/(watch|smartwatch)/i, "smart watch"],
  [/(bag|backpack)/i, "bag"],
];

export function inferImageSearchKeyword(file: File) {
  const haystack = `${file.name} ${file.type}`.toLowerCase();
  return IMAGE_KEYWORDS.find(([pattern]) => pattern.test(haystack))?.[1] || "";
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function resolveColorHint(red: number, green: number, blue: number) {
  if (red > 145 && green < 120 && blue < 120) return "tomato";
  if (red > 160 && green > 130 && blue < 95) return "banana";
  if (green > 120 && red < 130) return "vegetable";
  if (red > 130 && green > 95 && blue < 90) return "potato";
  if (blue > 115 && red < 120) return "denim";
  if (red < 75 && green < 75 && blue < 75) return "black footwear";
  return "";
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

async function sha256File(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function buildVisualSearchPayload(file: File): Promise<VisualSearchPayload> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const fileHash = await sha256File(file).catch(() => "");
  const image = await loadImage(originalDataUrl);
  const canvas = document.createElement("canvas");
  const maxSize = 96;
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      keywordHint: inferImageSearchKeyword(file),
      fileHash,
    };
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3] ?? 255;
    if (alpha < 20) continue;
    red += pixels[index] ?? 0;
    green += pixels[index + 1] ?? 0;
    blue += pixels[index + 2] ?? 0;
    count += 1;
  }
  const avgRed = count ? Math.round(red / count) : 0;
  const avgGreen = count ? Math.round(green / count) : 0;
  const avgBlue = count ? Math.round(blue / count) : 0;
  const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.58);
  return {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    keywordHint: inferImageSearchKeyword(file),
    colorHint: resolveColorHint(avgRed, avgGreen, avgBlue),
    averageColor: rgbToHex(avgRed, avgGreen, avgBlue),
    fileHash,
    dataUrl: compressedDataUrl,
  };
}

export async function searchProductByImage(file: File, location: VisualSearchLocation = {}) {
  const payload = await buildVisualSearchPayload(file);
  const response = await fetch(resolveRuntimeApiUrl("/api/search/image"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      lat: location.lat,
      lng: location.lng,
      radiusKm: location.radiusKm ?? 5,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Image search failed. Please try another product photo.");
  }
  return data as VisualSearchResponse;
}
