export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 *
 * NOTE: This function should never be used in web applications where session
 * token cookies are automatically associated with API calls by the browser.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  // Only prepend to relative paths (starting with /)
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

type MockRecord = Record<string, any>;

const MOCK_STORAGE_KEY = "local-commerce-hub.mock.v3";

function getAdminCredentials() {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    email: env.VITE_DEMO_ADMIN_EMAIL || "admin.demo@chowdharymart.test",
    password: env.VITE_DEMO_ADMIN_PASSWORD || "Demo@Admin123",
  };
}

function demoAccountsEnabled() {
  const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  const flag = env.VITE_ENABLE_DEMO_ACCOUNTS ?? env.ENABLE_DEMO_ACCOUNTS;
  if (flag !== undefined) return String(flag).toLowerCase() === "true";
  return false;
}

function mockApiEnabled() {
  const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  const flag = env.VITE_ENABLE_MOCK_API ?? env.ENABLE_MOCK_API;
  if (flag !== undefined) return String(flag).toLowerCase() === "true";
  return demoAccountsEnabled();
}

function demoPasswords() {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    customer: env.VITE_DEMO_CUSTOMER_PASSWORD || env.DEMO_CUSTOMER_PASSWORD || "Demo@Customer123",
    seller: env.VITE_DEMO_SELLER_PASSWORD || env.DEMO_SELLER_PASSWORD || "Demo@Seller123",
    rider: env.VITE_DEMO_RIDER_PASSWORD || env.DEMO_RIDER_PASSWORD || "Demo@Rider123",
    admin: env.VITE_DEMO_ADMIN_PASSWORD || env.DEMO_ADMIN_PASSWORD || "Demo@Admin123",
  };
}

function demoEmails() {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    customer: env.VITE_DEMO_CUSTOMER_EMAIL || env.DEMO_CUSTOMER_EMAIL || "customer.demo@chowdharymart.test",
    seller: env.VITE_DEMO_SELLER_EMAIL || env.DEMO_SELLER_EMAIL || "seller.demo@chowdharymart.test",
    rider: env.VITE_DEMO_RIDER_EMAIL || env.DEMO_RIDER_EMAIL || "rider.demo@chowdharymart.test",
    admin: env.VITE_DEMO_ADMIN_EMAIL || env.DEMO_ADMIN_EMAIL || "admin.demo@chowdharymart.test",
  };
}

const DEMO_RIDER_PHOTO =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=240&q=80";

const seedProducts = [
  ["Samsung Galaxy M35 5G", 1, 1, 14999, 21999, "128 GB", "unit", "https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=700&q=80"],
  ["boAt Airdopes 141 ANC", 1, 1, 1299, 4490, "42 hr", "playback", "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=700&q=80"],
  ["HP 15s Ryzen Laptop", 1, 1, 39990, 52990, "8 GB", "RAM", "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=80"],
  ["Apple iPhone 15", 1, 1, 65999, 79900, "128 GB", "unit", "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=700&q=80"],
  ["Sony WH-CH720N Headphones", 1, 1, 7990, 14990, "ANC", "unit", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80"],
  ["Amul Taaza Milk", 2, 2, 28, 30, "500", "ml", "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=700&q=80"],
  ["Fresh Tomato", 2, 2, 36, 48, "1", "kg", "https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=700&q=80"],
  ["India Gate Basmati Rice", 2, 2, 349, 425, "5", "kg", "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=700&q=80"],
  ["Aashirvaad Atta", 2, 2, 279, 340, "5", "kg", "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=700&q=80"],
  ["Fortune Sunflower Oil", 2, 2, 145, 180, "1", "L", "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=80"],
  ["Nike Running Shoes", 3, 3, 2599, 4995, "UK 8", "pair", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80"],
  ["Roadster Denim Jacket", 3, 3, 1199, 2999, "M", "size", "https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=700&q=80"],
  ["Men Cotton T-Shirt", 3, 3, 399, 999, "L", "size", "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80"],
  ["Women Kurta Set", 3, 3, 899, 2199, "M", "size", "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=700&q=80"],
  ["Prestige Mixer Grinder", 4, 4, 2299, 3895, "750", "W", "https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=700&q=80"],
  ["Milton Water Bottle", 4, 4, 299, 499, "1", "L", "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=700&q=80"],
  ["Wakefit Memory Foam Pillow", 4, 4, 599, 1199, "1", "pc", "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=700&q=80"],
  ["LED Study Lamp", 4, 4, 699, 1499, "12", "W", "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=700&q=80"],
  ["Mamaearth Onion Shampoo", 5, 5, 329, 399, "250", "ml", "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&w=700&q=80"],
  ["Lakme Matte Lipstick", 5, 5, 249, 499, "4.2", "g", "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=700&q=80"],
  ["Maybelline Fit Me Foundation", 5, 5, 429, 649, "30", "ml", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80"],
  ["Nivea Body Lotion", 5, 5, 225, 349, "400", "ml", "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=80"],
  ["Tata Tea Gold", 6, 2, 245, 310, "1", "kg", "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=700&q=80"],
  ["Cadbury Celebration Pack", 7, 2, 199, 250, "180", "g", "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=700&q=80"],
  ["Cricket Tennis Ball Pack", 8, 4, 299, 499, "6", "pcs", "https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=700&q=80"],
  ["Classmate Notebook Combo", 9, 4, 169, 240, "6", "pcs", "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=700&q=80"],
  ["Pedigree Adult Dog Food", 10, 2, 549, 699, "3", "kg", "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=700&q=80"],
  ["Surf Excel Detergent Powder", 2, 2, 189, 240, "1", "kg", "https://images.unsplash.com/photo-1626806819282-2c1dc01a5e0c?auto=format&fit=crop&w=700&q=80"],
  ["Vim Dishwash Gel", 2, 2, 115, 145, "500", "ml", "https://images.unsplash.com/photo-1583947581924-a6d184c1ec73?auto=format&fit=crop&w=700&q=80"],
  ["Harpic Toilet Cleaner", 2, 2, 98, 125, "500", "ml", "https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=700&q=80"],
  ["Dettol Liquid Handwash", 2, 2, 89, 110, "200", "ml", "https://images.unsplash.com/photo-1584305574647-0cc949a2bb9f?auto=format&fit=crop&w=700&q=80"],
  ["Colgate Strong Teeth Toothpaste", 2, 2, 92, 120, "200", "g", "https://images.unsplash.com/photo-1556228724-4d0b6d54133b?auto=format&fit=crop&w=700&q=80"],
  ["Dove Bathing Soap Pack", 2, 2, 165, 210, "3", "pcs", "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=700&q=80"],
  ["Whisper Ultra Sanitary Pads", 2, 2, 249, 299, "30", "pcs", "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&w=700&q=80"],
  ["Pampers Baby Diapers", 2, 2, 599, 749, "42", "pcs", "https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=700&q=80"],
  ["Tata Salt", 2, 2, 24, 30, "1", "kg", "https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?auto=format&fit=crop&w=700&q=80"],
  ["Sugar", 2, 2, 52, 60, "1", "kg", "https://images.unsplash.com/photo-1582049169044-2a4f9e3b87fb?auto=format&fit=crop&w=700&q=80"],
  ["Masoor Dal", 2, 2, 135, 165, "1", "kg", "https://images.unsplash.com/photo-1612257999756-2e8ea30a9a8b?auto=format&fit=crop&w=700&q=80"],
  ["Maggi 2-Minute Noodles", 7, 2, 96, 112, "8", "pack", "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=700&q=80"],
  ["Britannia Bread", 2, 2, 45, 50, "400", "g", "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80"],
  ["Eggs Pack", 2, 2, 72, 84, "12", "pcs", "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=700&q=80"],
  ["Fresh Potato", 2, 2, 28, 36, "1", "kg", "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=80"],
  ["Fresh Onion", 2, 2, 32, 42, "1", "kg", "https://images.unsplash.com/photo-1580201092675-a0a6a6cafbb1?auto=format&fit=crop&w=700&q=80"],
  ["Fresh Banana", 2, 2, 48, 60, "1", "dozen", "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=700&q=80"],
  ["Parle-G Biscuits", 7, 2, 45, 55, "400", "g", "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=700&q=80"],
  ["Bisleri Mineral Water", 2, 2, 20, 25, "1", "L", "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=700&q=80"],
  ["Eveready AA Battery Pack", 4, 4, 95, 120, "4", "pcs", "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=700&q=80"],
];

function defaultSizesForProduct(categoryId: number, name = "") {
  if (categoryId !== 3) return [];
  const lower = name.toLowerCase();
  if (lower.includes("shoe")) return ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"];
  if (lower.includes("denim") || lower.includes("jean")) return ["S", "M", "L", "XL", "XXL"];
  if (lower.includes("kurta")) return ["S", "M", "L", "XL", "XXL", "Free Size"];
  return ["S", "M", "L", "XL", "XXL"];
}

function defaultColorsForProduct(categoryId: number, name = "") {
  const lower = name.toLowerCase();
  if (categoryId === 3 || lower.includes("shoe") || lower.includes("chappal") || lower.includes("sandal")) {
    return ["Black", "Brown", "Navy"];
  }
  if (categoryId === 1 || lower.includes("phone") || lower.includes("watch") || lower.includes("headphone")) {
    return ["Black", "Blue", "Silver"];
  }
  if (categoryId === 4 || lower.includes("chair") || lower.includes("sofa") || lower.includes("lamp")) {
    return ["Black", "White", "Brown"];
  }
  return [];
}

function normalizeOptionList(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(source.map((item) => String(item).trim()).filter(Boolean)));
}

function productImageSet(image: string) {
  if (!image) return [];
  return [
    image,
    image.replace("w=700", "w=760").replace("q=80", "q=85"),
    image.replace("w=700", "w=620"),
  ];
}

const chappalProductImages = [
  "https://images.unsplash.com/photo-1603487742131-4160ec999306?auto=format&fit=crop&w=760&q=85",
  "https://images.unsplash.com/photo-1603487742131-4160ec999306?auto=format&fit=crop&w=620&q=80",
  "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?auto=format&fit=crop&w=760&q=85",
  "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=760&q=85",
];

function chappalSellerUser() {
  return makeUser({
    id: 5,
    email: "chappal.seller@local.test",
    phone: "9876500005",
    name: "Chappal Demo Seller",
    role: "vendor",
    password: "seller@123",
    walletBalance: "1500.00",
    vendorStatus: "approved",
  });
}

function chappalStore() {
  return {
    id: 6,
    ownerId: 5,
    name: "Chowdhary Footwear Hub",
    address: "New Market Footwear Lane",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700087",
    logoUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    rating: "4.6",
    ratingCount: 128,
    estimatedDeliveryMins: 40,
    deliveryFee: "29.00",
    freeDeliveryAbove: "499.00",
    minOrderValue: "99.00",
    isOpen: true,
    isVerified: true,
    approvalStatus: "approved",
    businessType: "Footwear seller",
    category: "Fashion",
    lat: 22.5618,
    lng: 88.3514,
    pickupAddress: "Chowdhary Footwear Hub, New Market Footwear Lane, Kolkata",
    createdAt: mockNow(),
  };
}

function chappalProduct(id = 49) {
  return {
    id,
    name: "Daily Comfort Chappal",
    categoryId: 3,
    storeId: 6,
    price: "349.00",
    mrp: "699.00",
    discountPercent: 50,
    images: chappalProductImages,
    weight: "UK 8",
    unit: "pair",
    description: "Soft sole daily wear chappal with anti-slip grip, multiple sizes and 40 minute local delivery target.",
    sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
    colors: ["Black", "Brown", "Navy"],
    returnWindow: "Damaged items only",
    warranty: "7 days seller assurance",
    paymentOptions: "Cash on Delivery, UPI",
    deliveryNote: "40 minute local target",
    specifications: {
      Sizes: "UK 5, UK 6, UK 7, UK 8, UK 9, UK 10",
      Colors: "Black, Brown, Navy",
      Material: "Soft EVA sole",
      Grip: "Anti-slip",
      Return: "Damaged items only",
      Warranty: "7 days seller assurance",
      Payment: "Cash on Delivery, UPI",
      Delivery: "40 minute local target",
    },
    rating: "4.5",
    reviewCount: 86,
    stock: 42,
    stockQty: 42,
    isAvailable: true,
    isFeatured: true,
    createdAt: mockNow(),
  };
}

function ensureChappalDemoData(state: MockRecord) {
  const deletedStores = state.deletedSeedStores ?? [];
  const deletedProducts = state.deletedSeedProducts ?? [];
  const chappalStoreDeleted = deletedStores.some((item: unknown) => Number(item) === 6 || String(item).toLowerCase() === "chowdhary footwear hub");
  const chappalProductDeleted = deletedProducts.some((item: unknown) => Number(item) === 49 || String(item).toLowerCase() === "daily comfort chappal");
  if (chappalStoreDeleted && chappalProductDeleted) return;
  if (!state.users.some((item: MockRecord) => item.email === "chappal.seller@local.test")) {
    state.users.push(chappalSellerUser());
  } else {
    const seller = state.users.find((item: MockRecord) => item.email === "chappal.seller@local.test");
    Object.assign(seller, { role: "vendor", vendorStatus: "approved", isActive: true });
  }

  if (!chappalStoreDeleted && !state.stores.some((item: MockRecord) => item.id === 6 || item.ownerId === 5)) {
    state.stores.push(chappalStore());
  } else if (!chappalStoreDeleted) {
    const store = state.stores.find((item: MockRecord) => item.id === 6 || item.ownerId === 5);
    Object.assign(store, { ...chappalStore(), ...store, id: store.id ?? 6, ownerId: 5, isOpen: store.isOpen !== false, approvalStatus: "approved", isVerified: true });
  }

  if (!chappalProductDeleted && !state.products.some((item: MockRecord) => String(item.name).toLowerCase() === "daily comfort chappal")) {
    const id = Math.max(49, Number(state.nextIds?.product ?? 49));
    state.products.push(chappalProduct(id));
    state.nextIds.product = Math.max(id + 1, Number(state.nextIds.product ?? 0));
  } else if (!chappalProductDeleted) {
    const product = state.products.find((item: MockRecord) => String(item.name).toLowerCase() === "daily comfort chappal");
    Object.assign(product, { ...chappalProduct(product.id), id: product.id });
  }

  state.storeApplications = state.storeApplications ?? [];
  if (!state.storeApplications.some((item: MockRecord) => item.userId === 5 || item.shopName === "Chowdhary Footwear Hub")) {
    state.storeApplications.unshift({
      id: Math.max(1, Number(state.nextIds?.storeApplication ?? 1)),
      userId: 5,
      ownerName: "Chappal Demo Seller",
      ownerEmail: "chappal.seller@local.test",
      ownerPhone: "9876500005",
      shopName: "Chowdhary Footwear Hub",
      businessType: "Footwear seller",
      category: "Fashion",
      gstNumber: "",
      panNumber: "ABCDE1234F",
      address: "New Market Footwear Lane",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700087",
      pickupAddress: "Chowdhary Footwear Hub, New Market Footwear Lane, Kolkata",
      upiId: "chappal@upi",
      status: "approved",
      submittedAt: mockNow(),
      reviewedAt: mockNow(),
    });
    state.nextIds.storeApplication = Math.max(Number(state.nextIds.storeApplication ?? 1), Math.max(...state.storeApplications.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  }
}

function ensureChappalDemoOrder(state: MockRecord) {
  const product = state.products.find((item: MockRecord) => String(item.name).toLowerCase() === "daily comfort chappal");
  const store = state.stores.find((item: MockRecord) => item.id === Number(product?.storeId));
  const customer = state.users.find((item: MockRecord) => item.id === 1);
  const partner = state.users.find((item: MockRecord) => item.id === 4);
  if (!product || !store || !customer || !partner) return;

  state.addresses = state.addresses ?? {};
  const customerAddresses = state.addresses["1"] ?? [];
  let address = customerAddresses[0];
  if (!address) {
    address = { id: state.nextIds.address++, userId: 1, name: customer.name, phone: customer.phone, label: "Home", line1: "Current delivery location", line2: "Demo live GPS point", city: "Kolkata", state: "West Bengal", pincode: "700156", isDefault: true };
    customerAddresses.push(address);
    state.addresses["1"] = customerAddresses;
  }
  Object.assign(address, {
    lat: Number(address.lat ?? 22.5892),
    lng: Number(address.lng ?? 88.4082),
    locationAccuracy: Number(address.locationAccuracy ?? 18),
    locationCapturedAt: address.locationCapturedAt ?? mockNow(),
    photoUrl: address.photoUrl ?? "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
  });

  const existingDemoOrder = state.orders.find((order: MockRecord) => order.orderNumber === "CHAPPAL-DEMO");
  if (existingDemoOrder) {
    existingDemoOrder.tracking = existingDemoOrder.tracking ?? {};
    existingDemoOrder.tracking.pickupOtp = existingDemoOrder.tracking.pickupOtp ?? generateOrderOtp(existingDemoOrder.id, 431);
    existingDemoOrder.tracking.deliveryOtp = existingDemoOrder.tracking.deliveryOtp ?? generateOrderOtp(existingDemoOrder.id, 0);
    existingDemoOrder.deliveryPartnerId = existingDemoOrder.deliveryPartnerId ?? 4;
    const payout = deliveryFeeForOrder(existingDemoOrder);
    existingDemoOrder.deliveryDistanceKm = existingDemoOrder.deliveryDistanceKm ?? payout.km;
    existingDemoOrder.deliveryPartnerEarning = existingDemoOrder.deliveryPartnerEarning ?? payout.earning.toFixed(2);
    return;
  }

  const orderId = state.nextIds.order++;
  const subtotal = Number(product.price);
  const deliveryFee = subtotal < Number(store.freeDeliveryAbove ?? 499) ? Number(store.deliveryFee ?? 29) : 0;
  const order: MockRecord = {
    id: orderId,
    orderNumber: "CHAPPAL-DEMO",
    userId: 1,
    storeId: store.id,
    store,
    addressId: address.id,
    address,
    addressSnapshot: address,
    items: [{ id: state.nextIds.cartItem++, productId: product.id, name: product.name, imageUrl: product.images?.[0], price: product.price, mrp: product.mrp, qty: 1, selectedSize: "UK 8", selectedColor: "Black", total: subtotal.toFixed(2) }],
    status: "packed",
    paymentMethod: "cod",
    paymentStatus: "pending",
    subtotal: subtotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    couponCode: null,
    couponDiscount: "0.00",
    walletUsed: "0.00",
    total: (subtotal + deliveryFee).toFixed(2),
    loyaltyPointsEarned: Math.floor(subtotal / 10),
    estimatedDeliveryMins: 40,
    deliveryPartnerId: 4,
    deliveryDistanceKm: deliveryFeeForOrder({ store, addressSnapshot: address, tracking: {} }).km,
    deliveryPartnerEarning: deliveryFeeForOrder({ store, addressSnapshot: address, tracking: {} }).earning.toFixed(2),
    createdAt: mockNow(),
    tracking: {
      orderId: 0,
      status: "packed",
      estimatedMins: 40,
      etaStartedAt: mockNow(),
      pickupOtp: generateOrderOtp(orderId, 431),
      deliveryOtp: generateOrderOtp(orderId, 0),
      deliveryPartner: {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        vehicleType: partner.vehicleType ?? "Bike",
        vehicleNumber: partner.vehicleNumber ?? "WB 01 CM 4040",
        rating: "4.8",
        photoUrl: partner.avatarUrl ?? null,
        location: { lat: Number(store.lat) + 0.006, lng: Number(store.lng) + 0.004, updatedAt: mockNow() },
      },
      partnerLocation: { lat: Number(store.lat) + 0.006, lng: Number(store.lng) + 0.004, updatedAt: mockNow() },
      timeline: [
        { status: "packed", message: "Delivery partner accepted. 40 minute ETA started.", updatedAt: mockNow() },
        { status: "confirmed", message: "Seller accepted the order. Waiting for delivery partner.", updatedAt: mockNow() },
        { status: "pending", message: "Order placed", updatedAt: mockNow() },
      ],
    },
  };
  order.tracking.orderId = order.id;
  state.orders.unshift(order);
  state.notifications["1"] = [{ id: Date.now(), title: "Chappal demo order live", body: "Seller and delivery partner accepted. Live tracking is ready.", isRead: false, createdAt: mockNow() }, ...(state.notifications["1"] ?? [])];
}

function alomSellerUser() {
  return makeUser({
    id: 6,
    email: "alom.grocery@local.test",
    phone: "9876500006",
    name: "Alom Grocery Owner",
    role: "vendor",
    password: "alom@123",
    walletBalance: "800.00",
    vendorStatus: "approved",
  });
}

function alomStore() {
  return {
    id: 7,
    ownerId: 6,
    name: "Alom Grocery",
    address: "Alom Para Vegetable Market",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700156",
    logoUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=85",
    bannerUrl: "https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=1200&q=85",
    rating: "4.7",
    ratingCount: 64,
    estimatedDeliveryMins: 40,
    deliveryFee: "35.00",
    freeDeliveryAbove: "399.00",
    minOrderValue: "99.00",
    isOpen: true,
    isVerified: true,
    approvalStatus: "approved",
    businessType: "Grocery and vegetables",
    category: "Grocery",
    lat: 22.5726,
    lng: 88.3639,
    pickupAddress: "Alom Grocery, Alom Para Vegetable Market, Kolkata",
    createdAt: mockNow(),
  };
}

const alomVegetables = [
  ["Alom Fresh Tomato", "1", "kg", "48.00", "60.00", "https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=700&q=85"],
  ["Alom Fresh Potato", "1", "kg", "32.00", "42.00", "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=85"],
  ["Alom Green Spinach", "250", "g", "28.00", "36.00", "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=700&q=85"],
];

function alomProduct(id: number, item: string[]) {
  const [name, weight, unit, price, mrp, image] = item;
  return {
    id,
    name,
    categoryId: 2,
    storeId: 7,
    price,
    mrp,
    discountPercent: Math.round(((Number(mrp) - Number(price)) / Number(mrp)) * 100),
    images: productImageSet(image),
    weight,
    unit,
    description: `${name} from Alom Grocery with fresh local stock and 40 minute delivery target.`,
    sizes: [],
    colors: [],
    returnWindow: "Damaged items only",
    warranty: "Freshness assured",
    paymentOptions: "Cash on Delivery, UPI",
    deliveryNote: "40 minute local target",
    specifications: { Freshness: "Same day stock", Return: "Damaged items only", Warranty: "Freshness assured", Payment: "Cash on Delivery, UPI", Delivery: "40 minute local target" },
    rating: "4.6",
    reviewCount: 18,
    stock: 80,
    stockQty: 80,
    isAvailable: true,
    isFeatured: true,
    createdAt: mockNow(),
  };
}

function ensureAlomDemoData(state: MockRecord) {
  const deletedStores = state.deletedSeedStores ?? [];
  const deletedProducts = state.deletedSeedProducts ?? [];
  const alomStoreDeleted = deletedStores.some((item: unknown) => Number(item) === 7 || String(item).toLowerCase() === "alom grocery");
  if (!state.users.some((item: MockRecord) => item.id === 6 || item.email === "alom.grocery@local.test")) {
    state.users.push(alomSellerUser());
  } else {
    const seller = state.users.find((item: MockRecord) => item.id === 6 || item.email === "alom.grocery@local.test");
    Object.assign(seller, { ...alomSellerUser(), ...seller, id: seller.id ?? 6, role: "vendor", vendorStatus: "approved", isActive: true });
  }

  if (!alomStoreDeleted && !state.stores.some((item: MockRecord) => item.id === 7 || item.ownerId === 6)) {
    state.stores.push(alomStore());
  } else if (!alomStoreDeleted) {
    const store = state.stores.find((item: MockRecord) => item.id === 7 || item.ownerId === 6);
    Object.assign(store, { ...alomStore(), ...store, id: store.id ?? 7, ownerId: 6, isOpen: store.isOpen !== false, approvalStatus: "approved", isVerified: true });
  }

  alomVegetables.forEach((veg, index) => {
    if (deletedProducts.some((item: unknown) => String(item).toLowerCase() === String(veg[0]).toLowerCase())) return;
    const exists = state.products.find((item: MockRecord) => String(item.name).toLowerCase() === String(veg[0]).toLowerCase());
    if (!exists) {
      const id = Math.max(60 + index, Number(state.nextIds?.product ?? 60) + index);
      state.products.push(alomProduct(id, veg));
      state.nextIds.product = Math.max(Number(state.nextIds.product ?? 0), id + 1);
    } else {
      Object.assign(exists, { ...alomProduct(exists.id, veg), id: exists.id });
    }
  });

  if (!state.storeApplications.some((item: MockRecord) => item.userId === 6 || item.shopName === "Alom Grocery")) {
    state.storeApplications.unshift({
      id: Math.max(1, Number(state.nextIds?.storeApplication ?? 1)),
      userId: 6,
      ownerName: "Alom Grocery Owner",
      ownerEmail: "alom.grocery@local.test",
      ownerPhone: "9876500006",
      shopName: "Alom Grocery",
      businessType: "Grocery and vegetables",
      category: "Grocery",
      gstNumber: "",
      panNumber: "ALOMG1234F",
      address: "Alom Para Vegetable Market",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700156",
      pickupAddress: "Alom Grocery, Alom Para Vegetable Market, Kolkata",
      upiId: "alomgrocery@upi",
      status: "approved",
      submittedAt: mockNow(),
      reviewedAt: mockNow(),
    });
    state.nextIds.storeApplication = Math.max(Number(state.nextIds.storeApplication ?? 1), Math.max(...state.storeApplications.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  }
}

function ensureAlomDemoOrder(state: MockRecord) {
  const store = state.stores.find((item: MockRecord) => item.id === 7 || item.name === "Alom Grocery");
  const partner = state.users.find((item: MockRecord) => item.id === 4);
  const customer = state.users.find((item: MockRecord) => item.id === 1);
  const products = state.products.filter((item: MockRecord) => item.storeId === 7).slice(0, 3);
  if (!store || !partner || !customer || products.length < 3) return;

  state.addresses = state.addresses ?? {};
  const address = {
    id: 4001,
    userId: 1,
    name: customer.name,
    phone: customer.phone,
    label: "Alom demo 4km location",
    line1: "Customer live GPS point",
    line2: "Approx 4 km from Alom Grocery",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700156",
    lat: Number(store.lat) + 0.036,
    lng: Number(store.lng),
    locationAccuracy: 12,
    locationCapturedAt: mockNow(),
    isDefault: false,
    photoUrl: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80",
  };
  const customerAddresses = state.addresses["1"] ?? [];
  if (!customerAddresses.some((item: MockRecord) => item.id === address.id)) customerAddresses.push(address);
  state.addresses["1"] = customerAddresses;

  const existing = state.orders.find((order: MockRecord) => order.orderNumber === "ALOM-VEG-DEMO");
  if (existing) {
    existing.status = existing.status ?? "picked_up";
    existing.deliveryPartnerId = existing.deliveryPartnerId ?? 4;
    existing.tracking = existing.tracking ?? {};
    existing.tracking.pickupOtp = existing.tracking.pickupOtp ?? generateOrderOtp(existing.id, 431);
    existing.tracking.deliveryOtp = existing.tracking.deliveryOtp ?? generateOrderOtp(existing.id, 0);
    return;
  }

  const orderId = state.nextIds.order++;
  const subtotal = products.reduce((sum: number, product: MockRecord) => sum + Number(product.price), 0);
  const deliveryFee = Number(store.deliveryFee ?? 35);
  const pickupOtp = generateOrderOtp(orderId, 431);
  const deliveryOtp = generateOrderOtp(orderId, 0);
  const order: MockRecord = {
    id: orderId,
    orderNumber: "ALOM-VEG-DEMO",
    userId: 1,
    storeId: store.id,
    store,
    addressId: address.id,
    address,
    addressSnapshot: address,
    items: products.map((product: MockRecord) => ({ id: state.nextIds.cartItem++, productId: product.id, name: product.name, imageUrl: product.images?.[0], price: product.price, mrp: product.mrp, qty: 1, total: Number(product.price).toFixed(2) })),
    status: "picked_up",
    paymentMethod: "cod",
    paymentStatus: "pending",
    subtotal: subtotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    couponCode: null,
    couponDiscount: "0.00",
    walletUsed: "0.00",
    total: (subtotal + deliveryFee).toFixed(2),
    loyaltyPointsEarned: Math.floor(subtotal / 10),
    estimatedDeliveryMins: 40,
    deliveryPartnerId: 4,
    createdAt: mockNow(),
    tracking: {
      orderId: 0,
      status: "picked_up",
      estimatedMins: 35,
      etaStartedAt: mockNow(),
      pickupOtp,
      pickupVerifiedAt: mockNow(),
      deliveryOtp,
      deliveryPartner: {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        vehicleType: partner.vehicleType ?? "Bike",
        vehicleNumber: partner.vehicleNumber ?? "WB 01 CM 4040",
        rating: "4.8",
        photoUrl: partner.avatarUrl ?? null,
        location: { lat: Number(store.lat) + 0.012, lng: Number(store.lng) + 0.006, updatedAt: mockNow() },
      },
      partnerLocation: { lat: Number(store.lat) + 0.012, lng: Number(store.lng) + 0.006, updatedAt: mockNow() },
      timeline: [
        { status: "picked_up", message: "Delivery partner picked up vegetables from Alom Grocery. Delivery OTP required at customer.", updatedAt: mockNow() },
        { status: "packed", message: "Delivery partner accepted the order.", updatedAt: mockNow() },
        { status: "confirmed", message: "Alom Grocery accepted the order.", updatedAt: mockNow() },
        { status: "pending", message: "Customer placed vegetable order.", updatedAt: mockNow() },
      ],
    },
  };
  order.tracking.orderId = order.id;
  const payout = deliveryFeeForOrder(order);
  order.deliveryDistanceKm = payout.km;
  order.deliveryPartnerEarning = Math.max(deliveryFee, payout.earning).toFixed(2);
  state.orders.unshift(order);
  state.notifications["1"] = [{ id: Date.now() + 10, title: "Alom Grocery order picked up", body: `Order #${order.orderNumber} is on delivery. OTP: ${deliveryOtp}`, isRead: false, createdAt: mockNow() }, ...(state.notifications["1"] ?? [])];
}

function mockNow() {
  return new Date().toISOString();
}

function generateOrderOtp(seed: number, offset = 0) {
  return String(1000 + ((Number(seed) + offset) % 9000)).padStart(4, "0");
}

function addWalletTransaction(state: MockRecord, userId: number, amount: number, description: string, referenceId: string, type: "credit" | "debit" = "credit") {
  const user = state.users.find((item: MockRecord) => item.id === userId);
  if (!user || !Number.isFinite(amount) || amount <= 0) return null;
  const signedAmount = type === "credit" ? amount : -amount;
  const nextBalance = Math.max(0, Number(user.walletBalance ?? 0) + signedAmount);
  user.walletBalance = nextBalance.toFixed(2);
  state.walletTransactions = state.walletTransactions ?? {};
  const key = String(userId);
  state.walletTransactions[key] = state.walletTransactions[key] ?? [];
  const tx = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    userId,
    type,
    amount: amount.toFixed(2),
    balance: nextBalance.toFixed(2),
    description,
    referenceId,
    referenceType: "order",
    createdAt: mockNow(),
  };
  state.walletTransactions[key].unshift(tx);
  return tx;
}

function adminUserId(state: MockRecord) {
  return Number(state.users.find((item: MockRecord) => item.role === "admin")?.id ?? 3);
}

function payoutSettings(state: MockRecord) {
  state.payoutSettings = {
    adminCommissionPercent: Number(state.payoutSettings?.adminCommissionPercent ?? 8),
    sellerPayoutCycle: state.payoutSettings?.sellerPayoutCycle ?? "weekly",
    deliveryPayoutCycle: state.payoutSettings?.deliveryPayoutCycle ?? "weekly",
    deliveryPayoutMode: state.payoutSettings?.deliveryPayoutMode ?? "delivery_fee_or_minimum",
  };
  return state.payoutSettings;
}

function createWalletTransfer(state: MockRecord, userId: number, amount: number, destination: MockRecord, description: string, referenceId: string) {
  const user = state.users.find((item: MockRecord) => item.id === userId);
  if (!user) return null;
  if (!Number.isFinite(amount) || amount < 10) return null;
  if (Number(user.walletBalance ?? 0) < amount) return null;
  return addWalletTransaction(
    state,
    userId,
    amount,
    `${description} to ${destination.method === "bank" ? `bank ${destination.accountNumber ?? ""}` : `UPI ${destination.upiId ?? ""}`}`,
    referenceId,
    "debit",
  );
}

function deliveryFeeForOrder(order: MockRecord) {
  const locations = mockOrderLocations(order);
  const km = mockDistanceKm(locations.storeLocation.lat, locations.storeLocation.lng, locations.customerLocation.lat, locations.customerLocation.lng);
  const earning = Math.max(25, Math.round(20 + km * 8));
  return { km: Number(km.toFixed(1)), earning };
}

function settleOrderWallets(state: MockRecord, order: MockRecord) {
  if (order.walletSettledAt) return;
  const settings = payoutSettings(state);
  const storeOwnerId = order.store?.ownerId ?? state.stores.find((store: MockRecord) => store.id === order.storeId)?.ownerId;
  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.couponDiscount ?? 0) + Number(order.walletUsed ?? 0);
  const productNet = Math.max(0, subtotal - discount);
  const adminCommission = Number((productNet * Number(settings.adminCommissionPercent ?? 8) / 100).toFixed(2));
  const sellerAmount = Math.max(0, productNet - adminCommission);
  const adminId = adminUserId(state);
  if (order.paymentMethod === "upi") {
    addWalletTransaction(state, adminId, sellerAmount, `Seller payout released #${order.orderNumber}`, order.orderNumber, "debit");
  } else {
    addWalletTransaction(state, adminId, adminCommission, `Admin commission due #${order.orderNumber}`, order.orderNumber);
  }
  if (storeOwnerId && !order.sellerPaidAt) {
    addWalletTransaction(state, Number(storeOwnerId), sellerAmount, `Seller product payout #${order.orderNumber} (${settings.sellerPayoutCycle})`, order.orderNumber);
    order.sellerPaidAt = mockNow();
  }
  if (order.deliveryPartnerId) {
    const { km, earning } = deliveryFeeForOrder(order);
    const deliveryPayout = Math.max(Number(order.deliveryFee ?? 0), earning);
    order.deliveryDistanceKm = km;
    order.deliveryPartnerEarning = deliveryPayout.toFixed(2);
    if (order.paymentMethod === "upi") {
      addWalletTransaction(state, adminId, deliveryPayout, `Delivery payout released #${order.orderNumber}`, order.orderNumber, "debit");
    }
    addWalletTransaction(state, Number(order.deliveryPartnerId), deliveryPayout, `Delivery payout #${order.orderNumber} (${km} km, ${settings.deliveryPayoutCycle})`, order.orderNumber);
  }
  order.adminCommission = adminCommission.toFixed(2);
  order.sellerPayout = sellerAmount.toFixed(2);
  order.walletSettledAt = mockNow();
}

function makeUser(overrides: MockRecord = {}) {
  const base = {
    id: overrides.id ?? Date.now(),
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    name: overrides.name ?? "Demo Customer",
    avatarUrl: overrides.avatarUrl ?? null,
    role: overrides.role ?? "customer",
    walletBalance: overrides.walletBalance ?? "750.00",
    loyaltyPoints: overrides.loyaltyPoints ?? 320,
    referralCode: overrides.referralCode ?? "LOCAL500",
    isVerified: true,
    isActive: true,
    password: overrides.password ?? "123456",
    createdAt: overrides.createdAt ?? mockNow(),
  };
  return { ...base, ...overrides };
}

function ensureOfficialDemoAccounts(state: MockRecord) {
  const emails = demoEmails();
  if (!demoAccountsEnabled()) {
    const disabledEmails = new Set(Object.values(emails));
    state.users = (state.users ?? []).map((user: MockRecord) => disabledEmails.has(user.email) ? { ...user, isActive: false, disabledReason: "Demo accounts disabled in production" } : user);
    return;
  }
  const passwords = demoPasswords();
  const upsertUser = (email: string, payload: MockRecord) => {
    const existing = state.users.find((item: MockRecord) => item.email === email || item.phone === payload.phone);
    if (existing) {
      if (existing.role === "admin" && !existing.isDemoAccount) return existing;
      Object.assign(existing, payload, { isDemoAccount: true, isActive: true, isVerified: true });
      return existing;
    }
    const user = makeUser({ id: state.nextIds.user++, email, ...payload, isDemoAccount: true, isActive: true, isVerified: true });
    state.users.push(user);
    return user;
  };

  const customer = upsertUser(emails.customer, {
    name: "Demo Customer",
    phone: "9000000001",
    role: "customer",
    password: passwords.customer,
    walletBalance: "500.00",
  });
  state.addresses[String(customer.id)] = state.addresses[String(customer.id)]?.length
    ? state.addresses[String(customer.id)]
    : [{
        id: state.nextIds.address++,
        userId: customer.id,
        name: "Demo Customer",
        phone: customer.phone,
        label: "Demo Home",
        line1: "Action Area I, New Town",
        line2: "Near community market",
        city: "Kolkata",
        state: "West Bengal",
        pincode: "700156",
        lat: 22.6006,
        lng: 88.3949,
        isDefault: true,
        isDemoAccount: true,
      }];

  const seller = upsertUser(emails.seller, {
    name: "Demo Seller",
    phone: "9000000002",
    role: "vendor",
    password: passwords.seller,
    vendorStatus: "approved",
    mobileVerified: true,
    walletBalance: "2400.00",
  });
  let demoStore = state.stores.find((item: MockRecord) => item.ownerId === seller.id && item.isDemoAccount);
  if (!demoStore) {
    demoStore = {
      id: state.nextIds.store++,
      ownerId: seller.id,
      name: "Demo Grocery Store",
      address: "New Town Demo Market",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700156",
      lat: 22.5996,
      lng: 88.3912,
      logoUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80",
      rating: "4.8",
      estimatedDeliveryMins: 40,
      deliveryFee: "29.00",
      freeDeliveryAbove: "299.00",
      isOpen: true,
      isActive: true,
      isDemoAccount: true,
      thermalPrintEnabled: true,
    };
    state.stores.push(demoStore);
  } else {
    Object.assign(demoStore, { isOpen: true, isActive: true, isDemoAccount: true, thermalPrintEnabled: true });
  }
  const demoNames = ["Demo Tomato", "Demo Potato", "Demo Onion", "Demo Basmati Rice", "Demo Mustard Oil", "Demo Atta", "Demo Milk", "Demo Eggs"];
  demoNames.forEach((name, index) => {
    if (state.products.some((item: MockRecord) => item.name === name && item.storeId === demoStore.id)) return;
    const baseImage = seedProducts[6 + (index % 4)]?.[7] ?? seedProducts[5][7];
    state.products.push({
      id: state.nextIds.product++,
      name,
      categoryId: 2,
      storeId: demoStore.id,
      price: String(28 + index * 12),
      mrp: String(36 + index * 16),
      discountPercent: 18,
      images: productImageSet(String(baseImage)),
      weight: index < 3 ? "1" : index === 6 ? "500" : "1",
      unit: index === 6 ? "ml" : index === 7 ? "dozen" : "kg",
      rating: "4.6",
      reviewCount: 20 + index,
      stock: 30,
      stockQty: 30,
      isAvailable: true,
      isDemoAccount: true,
      createdAt: mockNow(),
    });
  });

  const rider = upsertUser(emails.rider, {
    name: "Demo Rider",
    phone: "9000000003",
    role: "delivery_partner",
    password: passwords.rider,
    deliveryStatus: "approved",
    deliveryStatusLabel: "activated",
    mobileVerified: true,
    documentStatus: "approved",
    vehicleStatus: "approved",
    bankVerificationStatus: "approved",
    selfieVerificationStatus: "verified",
    faceMatchStatus: "verified",
    activationStatus: "activated",
    vehicleType: "Bike",
    vehicleNumber: "WB 20 DM 3003",
    rating: "4.9",
    walletBalance: "850.00",
    isOnline: false,
    publicProfilePhotoUrl: DEMO_RIDER_PHOTO,
    avatarUrl: DEMO_RIDER_PHOTO,
    profilePhotoStorageKey: "demo://rider/profile-photo",
    selfieVerifications: [{
      id: Date.now() + 3003,
      verificationType: "REGISTRATION",
      verificationStatus: "verified",
      faceMatchStatus: "verified",
      livenessStatus: "completed",
      capturedAt: mockNow(),
    }],
  });
  state.walletTransactions[String(rider.id)] = state.walletTransactions[String(rider.id)]?.length
    ? state.walletTransactions[String(rider.id)]
    : [{ id: Date.now() + 31, type: "credit", amount: "850.00", balance: "850.00", description: "Demo completed delivery earnings", createdAt: mockNow(), isDemoAccount: true }];

  upsertUser(emails.admin, {
    name: "Demo Admin",
    phone: "9000000004",
    role: "admin",
    password: passwords.admin,
    emailVerified: true,
    adminScope: "demo_data",
    walletBalance: "0.00",
  });
}

function initialMockState() {
  const categories = [
    { id: 1, name: "Mobiles & Electronics", iconEmoji: "M", colorClass: "bg-blue-50", imageUrl: null },
    { id: 2, name: "Grocery", iconEmoji: "G", colorClass: "bg-green-50", imageUrl: null },
    { id: 3, name: "Fashion", iconEmoji: "F", colorClass: "bg-pink-50", imageUrl: null },
    { id: 4, name: "Home & Kitchen", iconEmoji: "H", colorClass: "bg-amber-50", imageUrl: null },
    { id: 5, name: "Beauty", iconEmoji: "B", colorClass: "bg-rose-50", imageUrl: null },
    { id: 6, name: "Tea & Beverages", iconEmoji: "T", colorClass: "bg-orange-50", imageUrl: null },
    { id: 7, name: "Snacks & Chocolates", iconEmoji: "S", colorClass: "bg-yellow-50", imageUrl: null },
    { id: 8, name: "Sports", iconEmoji: "P", colorClass: "bg-cyan-50", imageUrl: null },
    { id: 9, name: "Books & Stationery", iconEmoji: "N", colorClass: "bg-violet-50", imageUrl: null },
    { id: 10, name: "Pet Supplies", iconEmoji: "D", colorClass: "bg-lime-50", imageUrl: null },
  ];
  const stores = [
    { id: 1, name: "Local Digital Hub", address: "Salt Lake Sector V", logoUrl: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=400&q=80", rating: "4.6", estimatedDeliveryMins: 40, deliveryFee: "39.00", freeDeliveryAbove: "999.00", isOpen: true, ownerId: 2 },
    { id: 2, name: "Chowdhary Mart Fresh", address: "New Town Market", logoUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", rating: "4.8", estimatedDeliveryMins: 40, deliveryFee: "29.00", freeDeliveryAbove: "299.00", isOpen: true, ownerId: 2 },
    { id: 3, name: "Style Street", address: "City Centre", logoUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80", rating: "4.4", estimatedDeliveryMins: 40, deliveryFee: "49.00", freeDeliveryAbove: "799.00", isOpen: true, ownerId: 2 },
    { id: 4, name: "Home Needs Bazaar", address: "Biswa Bangla Gate", logoUrl: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=400&q=80", rating: "4.5", estimatedDeliveryMins: 40, deliveryFee: "45.00", freeDeliveryAbove: "699.00", isOpen: true, ownerId: 2 },
    { id: 5, name: "Glow Beauty Store", address: "Park Street", logoUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=400&q=80", rating: "4.7", estimatedDeliveryMins: 40, deliveryFee: "35.00", freeDeliveryAbove: "499.00", isOpen: true, ownerId: 2 },
  ];
  const products = seedProducts.map((item, index) => {
    const [name, categoryId, storeId, price, mrp, weight, unit, image] = item as any[];
    const sizes = defaultSizesForProduct(Number(categoryId), String(name));
    const colors = defaultColorsForProduct(Number(categoryId), String(name));
    return {
      id: index + 1,
      name,
      categoryId,
      storeId,
      price: Number(price).toFixed(2),
      mrp: Number(mrp).toFixed(2),
      discountPercent: Math.round(((Number(mrp) - Number(price)) / Number(mrp)) * 100),
      images: productImageSet(image),
      weight,
      unit,
      description: `${name} with 40 minute local delivery target, damaged-item return support, verified seller support and assured quality.`,
      sizes,
      colors,
      returnWindow: "Damaged items only",
      warranty: "Assured",
      paymentOptions: "Cash on Delivery, UPI",
      deliveryNote: "40 minute local target",
      specifications: { Warranty: "Assured", Delivery: "40 minute local target", Return: "Damaged items only", Payment: "Cash on Delivery, UPI", ...(sizes.length ? { Sizes: sizes.join(", ") } : {}), ...(colors.length ? { Colors: colors.join(", ") } : {}) },
      rating: (4.2 + (index % 6) / 10).toFixed(1),
      reviewCount: 25 + index * 7,
      stock: 20 + (index % 8) * 6,
      stockQty: 20 + (index % 8) * 6,
      isAvailable: true,
      isFeatured: index < 8,
      createdAt: mockNow(),
    };
  });
  const customer = makeUser({ id: 1, email: "customer@local.test", phone: "9876543210", name: "Demo Customer", role: "customer", password: "123456" });
  const vendor = makeUser({ id: 2, email: "vendor@local.test", phone: "9876500002", name: "Demo Vendor", role: "vendor", password: "123456", walletBalance: "1200.00", vendorStatus: "approved" });
  const adminCredentials = getAdminCredentials();
  const admin = makeUser({ id: 3, email: adminCredentials.email, name: "Admin User", role: "admin", password: adminCredentials.password, walletBalance: "5000.00" });
  const delivery = makeUser({ id: 4, email: "delivery@local.test", phone: "9876500004", name: "Delivery Partner", role: "delivery_partner", password: "123456", walletBalance: "900.00", vehicleType: "Bike", vehicleNumber: "WB 01 CM 4040", deliveryStatus: "approved" });
  const chappalSeller = chappalSellerUser();
  const footwearStore = chappalStore();
  const footwearProduct = chappalProduct(products.length + 1);
  const state = {
    users: [customer, vendor, admin, delivery, chappalSeller],
    categories,
    stores: [...stores, footwearStore],
    products: [...products, footwearProduct],
    carts: {} as Record<string, MockRecord[]>,
    wishlist: {} as Record<string, number[]>,
    addresses: {
      "1": [{ id: 1, userId: 1, name: "Demo Customer", phone: "9876543210", label: "Home", line1: "Action Area I, New Town", line2: "Near community market", city: "Kolkata", state: "West Bengal", pincode: "700156", isDefault: true }],
    } as Record<string, MockRecord[]>,
    orders: [] as MockRecord[],
    returns: [] as MockRecord[],
    reviews: [
      { id: 1, productId: 1, userId: 1, rating: 5, title: "Great value", body: "Fast delivery and solid quality.", isVerifiedPurchase: true, user: { name: "Demo Customer" }, createdAt: mockNow() },
    ],
    notifications: {
      "1": [{ id: 1, title: "Welcome offer unlocked", body: "Use LOCAL20 on your next cart.", isRead: false, createdAt: mockNow() }],
    } as Record<string, MockRecord[]>,
    walletTransactions: {
      "1": [{ id: 1, type: "credit", amount: "750.00", balance: "750.00", description: "Welcome wallet bonus", createdAt: mockNow() }],
    } as Record<string, MockRecord[]>,
    payoutSettings: { adminCommissionPercent: 8, sellerPayoutCycle: "weekly", deliveryPayoutCycle: "weekly", deliveryPayoutMode: "delivery_fee_or_minimum" },
    coupons: [
      { id: 1, code: "LOCAL20", title: "20% off", description: "Save 20% up to Rs 150", discountType: "percent", discountValue: "20.00", maxDiscount: "150.00", minOrderValue: "199.00", isActive: true, usedCount: 0 },
      { id: 2, code: "FREESHIP", title: "Free delivery", description: "Flat Rs 49 off delivery", discountType: "fixed", discountValue: "49.00", maxDiscount: "49.00", minOrderValue: "299.00", isActive: true, usedCount: 0 },
    ],
    banners: [
      { id: 1, title: "Mega Savings Festival", subtitle: "Mobiles, fashion, home and grocery deals", imageUrl: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=1200&q=80", href: "/search" },
      { id: 2, title: "Fresh groceries in minutes", subtitle: "Daily essentials from nearby stores", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80", href: "/search?categoryId=2" },
      { id: 3, title: "Seller specials live now", subtitle: "New products, limited stock and fast dispatch", imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80", href: "/search?sort=rating" },
    ],
    storeApplications: [] as MockRecord[],
    walletWithdrawalRequests: [] as MockRecord[],
    deliveryOtp: {} as Record<string, MockRecord>,
    verificationAuditLog: [] as MockRecord[],
    sessions: {} as Record<string, MockRecord>,
    nextIds: { user: 8, address: 2, order: 1, cartItem: 1, product: products.length + 5, coupon: 3, review: 2, return: 1, store: 8, storeApplication: 1, withdrawal: 1 },
  };
  if (!demoAccountsEnabled()) {
    purgeMockToAdminOnly(state);
    return state;
  }
  ensureAlomDemoData(state);
  ensureChappalDemoOrder(state);
  ensureAlomDemoOrder(state);
  ensureOfficialDemoAccounts(state);
  return state;
}

function migrateMockState(state: MockRecord) {
  const seeded = initialMockState();
  const adminCredentials = getAdminCredentials();
  state.deletedSeedProducts = state.deletedSeedProducts ?? [];
  state.deletedSeedCategories = state.deletedSeedCategories ?? [];
  state.deletedSeedStores = state.deletedSeedStores ?? [];
  state.categories = state.categories ?? [];
  state.products = state.products ?? [];
  state.users = state.users ?? [];
  state.stores = state.stores ?? seeded.stores;
  state.sessions = state.sessions ?? {};
  state.storeApplications = state.storeApplications ?? [];
  state.walletWithdrawalRequests = state.walletWithdrawalRequests ?? [];
  state.deliveryOtp = state.deliveryOtp ?? {};
  state.verificationAuditLog = state.verificationAuditLog ?? [];
  state.addresses = state.addresses ?? {};
  state.orders = state.orders ?? [];
  state.notifications = state.notifications ?? {};
  state.carts = state.carts ?? {};
  payoutSettings(state);
  if (!demoAccountsEnabled()) {
    purgeMockToAdminOnly(state);
    return state;
  }
  state.nextIds = state.nextIds ?? {};
  state.nextIds.user = Number(state.nextIds.user ?? Math.max(0, ...state.users.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.address = Number(state.nextIds.address ?? 1);
  state.nextIds.product = Number(state.nextIds.product ?? Math.max(0, ...state.products.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.store = Number(state.nextIds.store ?? Math.max(0, ...state.stores.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  ensureChappalDemoData(state);
  ensureAlomDemoData(state);
  ensureOfficialDemoAccounts(state);

  const admin = state.users.find((item: MockRecord) => item.role === "admin");
  if (admin) {
    admin.email = adminCredentials.email;
    admin.password = adminCredentials.password;
    admin.name = admin.name || "Admin User";
  } else {
    state.users.push(makeUser({ id: 3, email: adminCredentials.email, name: "Admin User", role: "admin", password: adminCredentials.password, walletBalance: "5000.00" }));
  }
  const demoCustomer = state.users.find((item: MockRecord) => item.email === "customer@local.test");
  if (demoCustomer && !demoCustomer.phone) demoCustomer.phone = "9876543210";
  const demoVendor = state.users.find((item: MockRecord) => item.email === "vendor@local.test");
  if (demoVendor) {
    if (!demoVendor.phone) demoVendor.phone = "9876500002";
    demoVendor.vendorStatus = demoVendor.vendorStatus ?? "approved";
  }
  const demoDelivery = state.users.find((item: MockRecord) => item.email === "delivery@local.test");
  if (demoDelivery) {
    if (!demoDelivery.phone) demoDelivery.phone = "9876500004";
    demoDelivery.vehicleType = demoDelivery.vehicleType ?? "Bike";
    demoDelivery.vehicleNumber = demoDelivery.vehicleNumber ?? "WB 01 CM 4040";
    demoDelivery.deliveryStatus = demoDelivery.deliveryStatus ?? "approved";
  }

  for (const category of seeded.categories) {
    const categoryDeleted = (state.deletedSeedCategories ?? []).some((item: unknown) => String(item).toLowerCase() === String(category.name).toLowerCase() || Number(item) === Number(category.id));
    if (!categoryDeleted && !state.categories.some((item: MockRecord) => item.id === category.id || item.name === category.name)) {
      state.categories.push(category);
    }
  }

  let nextProductId = Math.max(0, ...state.products.map((item: MockRecord) => Number(item.id) || 0), ...seeded.products.map((item: MockRecord) => Number(item.id) || 0)) + 1;
  for (const product of seeded.products) {
    const productDeleted = (state.deletedSeedProducts ?? []).some((item: unknown) => String(item).toLowerCase() === String(product.name).toLowerCase() || Number(item) === Number(product.id));
    if (!productDeleted && !state.products.some((item: MockRecord) => String(item.name).toLowerCase() === String(product.name).toLowerCase())) {
      state.products.push({ ...product, id: nextProductId++, isFeatured: product.isFeatured || Number(product.discountPercent ?? 0) >= 20 });
    }
  }

  for (const product of state.products) {
    if (!Array.isArray(product.images)) product.images = product.images ? [product.images] : [];
    if (product.images.length === 1 && typeof product.images[0] === "string" && product.images[0].startsWith("http")) {
      product.images = productImageSet(product.images[0]);
    }
    const sizes = normalizeOptionList(product.sizes ?? product.specifications?.Sizes ?? product.specifications?.Size);
    const migratedSizes = sizes.length ? sizes : defaultSizesForProduct(Number(product.categoryId), String(product.name ?? ""));
    const colors = normalizeOptionList(product.colors ?? product.specifications?.Colors ?? product.specifications?.Color);
    const migratedColors = colors.length ? colors : defaultColorsForProduct(Number(product.categoryId), String(product.name ?? ""));
    if (migratedSizes.length) {
      product.sizes = migratedSizes;
      product.specifications = { ...(product.specifications ?? {}), Sizes: migratedSizes.join(", ") };
    }
    if (migratedColors.length) {
      product.colors = migratedColors;
      product.specifications = { ...(product.specifications ?? {}), Colors: migratedColors.join(", ") };
    }
    product.returnWindow = product.returnWindow ?? product.returnPolicy ?? product.specifications?.Return ?? "Damaged items only";
    product.warranty = product.warranty ?? product.specifications?.Warranty ?? "Seller assured";
    product.paymentOptions = product.paymentOptions ?? product.specifications?.Payment ?? "Cash on Delivery, UPI";
    product.deliveryNote = product.deliveryNote ?? product.specifications?.Delivery ?? "40 minute local target";
    product.specifications = {
      ...(product.specifications ?? {}),
      Return: product.returnWindow,
      Warranty: product.warranty,
      Payment: product.paymentOptions,
      Delivery: product.deliveryNote,
    };
  }

  state.nextIds.product = Math.max(Number(state.nextIds.product ?? 1), nextProductId);
  state.nextIds.user = Math.max(Number(state.nextIds.user ?? 1), Math.max(0, ...state.users.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.store = Math.max(Number(state.nextIds.store ?? 1), Math.max(0, ...state.stores.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.storeApplication = Math.max(Number(state.nextIds.storeApplication ?? 1), Math.max(0, ...state.storeApplications.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.withdrawal = Math.max(Number(state.nextIds.withdrawal ?? 1), Math.max(0, ...(state.walletWithdrawalRequests ?? []).map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.address = Math.max(Number(state.nextIds.address ?? 1), Math.max(0, ...Object.values(state.addresses ?? {}).flat().map((item: any) => Number(item.id) || 0)) + 1);
  state.nextIds.order = Math.max(Number(state.nextIds.order ?? 1), Math.max(0, ...state.orders.map((item: MockRecord) => Number(item.id) || 0)) + 1);
  state.nextIds.cartItem = Math.max(Number(state.nextIds.cartItem ?? 1), 1);
  assignZoneIds(state);
  ensureChappalDemoOrder(state);
  ensureAlomDemoOrder(state);
  return state;
}

function getMockState() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
  if (!raw) {
    const seeded = initialMockState();
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = migrateMockState(JSON.parse(raw));
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    const seeded = initialMockState();
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveMockState(state: MockRecord) {
  try {
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    compactLargeDataUrls(state);
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
  }
}

function compactLargeDataUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:image/") && value.length > 180_000
      ? "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=900&q=80"
      : value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = compactLargeDataUrls(value[index]);
    return value;
  }
  if (value && typeof value === "object") {
    Object.keys(value as MockRecord).forEach((key) => {
      (value as MockRecord)[key] = compactLargeDataUrls((value as MockRecord)[key]);
    });
  }
  return value;
}

function publicUser(user: MockRecord) {
  const {
    password: _password,
    isActive: _isActive,
    profileSelfie: _profileSelfie,
    liveSelfie: _liveSelfie,
    activationSelfie: _activationSelfie,
    selfieVerifications: _selfieVerifications,
    identityNumber: _identityNumber,
    bankAccountNumber: _bankAccountNumber,
    confirmBankAccountNumber: _confirmBankAccountNumber,
    ...safeUser
  } = user;
  return safeUser;
}

function parseMockBody(options: CustomFetchOptions) {
  if (!options.body || typeof options.body !== "string") return {};
  try {
    return JSON.parse(options.body);
  } catch {
    return {};
  }
}

function mockRequiresDrivingLicence(vehicleType: string) {
  const vehicle = vehicleType.toLowerCase();
  if (vehicle.includes("bicycle") || vehicle.includes("cycle")) return false;
  if (vehicle.includes("scooter")) return true;
  if (vehicle.includes("motor") || vehicle.includes("bike")) return true;
  return true;
}

function requireDeliveryKyc(body: MockRecord, method: string, path: string) {
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const password = String(body.password ?? "");
  const aadhaar = String(body.aadhaarNumber ?? "").replace(/\D/g, "");
  const pan = String(body.panNumber ?? "").trim().toUpperCase();
  const pincode = String(body.pincode ?? "").replace(/\D/g, "");
  const emergencyPhone = String(body.emergencyPhone ?? "").replace(/\D/g, "");
  const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
  const upiId = String(body.upiId ?? "").trim();
  const vehicleNumber = String(body.vehicleNumber ?? "").trim().toUpperCase();
  const vehicleType = String(body.vehicleType ?? "").trim();
  const licenceRequired = mockRequiresDrivingLicence(vehicleType);
  const licenseNumber = String(body.licenseNumber ?? "").trim().toUpperCase();
  const profileSelfie = String(body.profileSelfie ?? body.selfieUrl ?? "").trim();
  const liveSelfie = String(body.liveSelfie ?? "").trim();
  const livenessChallenge = String(body.livenessChallenge ?? "").trim();
  const licenseExpiry = String(body.licenseExpiry ?? "").trim();
  const insuranceExpiry = String(body.insuranceExpiry ?? "").trim();

  if (!/^\d{10}$/.test(phone)) makeMockError(400, "Valid 10 digit mobile number required", method, path);
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) makeMockError(400, "Password must be 8+ characters with uppercase, lowercase, number and special character", method, path);
  if (licenceRequired && !/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{4}$/.test(vehicleNumber)) makeMockError(400, "Valid vehicle number required", method, path);
  if (licenceRequired && licenseNumber.length < 8) makeMockError(400, "Valid driving license number required", method, path);
  if (!aadhaar && !pan) makeMockError(400, "Aadhaar or PAN number required", method, path);
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) makeMockError(400, "Valid 12 digit Aadhaar number required", method, path);
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) makeMockError(400, "Valid PAN number required", method, path);
  if (!String(body.fullAddress ?? "").trim()) makeMockError(400, "Full address required for background verification", method, path);
  if (!/^\d{6}$/.test(pincode)) makeMockError(400, "Valid 6 digit pincode required", method, path);
  if (emergencyPhone && !/^\d{10}$/.test(emergencyPhone)) makeMockError(400, "Valid emergency contact required", method, path);
  if (!profileSelfie.startsWith("data:image/") && !profileSelfie.startsWith("https://")) makeMockError(400, "Profile selfie photo required", method, path);
  if (liveSelfie && !liveSelfie.startsWith("data:image/")) makeMockError(400, "Live selfie image is invalid", method, path);
  if (liveSelfie && !livenessChallenge) makeMockError(400, "Live selfie liveness challenge required", method, path);
  const today = new Date(mockNow()).toISOString().slice(0, 10);
  if (licenceRequired && licenseExpiry && licenseExpiry < today) makeMockError(400, "Driving licence is expired", method, path);
  if (insuranceExpiry && insuranceExpiry < today) makeMockError(400, "Vehicle insurance is expired", method, path);
  if (!body.termsAccepted) makeMockError(400, "Partner terms must be accepted", method, path);
  if (!upiId && !(String(body.bankAccountNumber ?? "").trim().length >= 9 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))) {
    makeMockError(400, "Add UPI ID or valid bank account with IFSC for payouts", method, path);
  }

  return {
    phone,
    panNumber: pan,
    aadhaarLast4: aadhaar.slice(-4),
    pincode,
    emergencyPhone,
    ifsc,
    upiId,
    vehicleNumber,
    vehicleType,
    licenseRequirement: licenceRequired ? "REQUIRED" : "NOT_REQUIRED",
    licenseNumber: licenceRequired ? licenseNumber : licenseNumber || "NOT_REQUIRED",
    profilePhotoStorageKey: `private://delivery/profile/${phone}`,
    liveSelfieStorageKey: `private://delivery/live/${phone}/${Date.now()}`,
    profileSelfie,
    liveSelfie,
    livenessChallenge,
    selfieVerificationStatus: "manual_review_required",
    faceMatchStatus: "manual_review_required",
    registrationStatus: "under_review",
    activationStatus: "pending_admin_approval",
    documentStatus: "pending_review",
    bankVerificationStatus: "pending_review",
    licenseExpiry: body.licenseExpiry,
    insuranceExpiry: body.insuranceExpiry,
    kycScore: 92,
    identityStatus: "pending_review",
    kycSubmittedAt: mockNow(),
    backgroundConsent: true,
    termsAccepted: true,
  };
}

function upsertVendorApplication(state: MockRecord, user: MockRecord, body: MockRecord) {
  state.storeApplications = state.storeApplications ?? [];
  const existing = state.storeApplications.find((item: MockRecord) => item.userId === user.id);
  const application = {
    id: existing?.id ?? state.nextIds.storeApplication++,
    userId: user.id,
    ownerName: body.name ?? user.name,
    ownerEmail: body.email ?? user.email ?? "",
    ownerPhone: body.phone ?? user.phone ?? "",
    ownerPhoto: body.avatarUrl ?? user.avatarUrl ?? existing?.ownerPhoto ?? "",
    shopName: body.shopName ?? existing?.shopName ?? `${body.name ?? user.name}'s Store`,
    businessType: body.businessType ?? existing?.businessType ?? "Local retail store",
    category: body.shopCategory ?? body.category ?? existing?.category ?? "General",
    gstNumber: body.gstNumber ?? existing?.gstNumber ?? "",
    panNumber: body.panNumber ?? existing?.panNumber ?? "",
    address: body.shopAddress ?? body.address ?? existing?.address ?? "",
    city: body.city ?? existing?.city ?? "",
    state: body.state ?? existing?.state ?? "",
    pincode: body.pincode ?? existing?.pincode ?? "",
    pickupAddress: body.pickupAddress ?? body.shopAddress ?? existing?.pickupAddress ?? "",
    bankName: body.bankName ?? existing?.bankName ?? "",
    accountNumber: body.accountNumber ?? existing?.accountNumber ?? "",
    ifsc: body.ifsc ?? existing?.ifsc ?? "",
    upiId: body.upiId ?? existing?.upiId ?? "",
    shopFrontPhoto: body.bannerUrl ?? existing?.shopFrontPhoto ?? "",
    bannerUrl: body.bannerUrl ?? existing?.bannerUrl ?? "",
    status: existing?.status === "approved" ? "approved" : "pending",
    submittedAt: existing?.submittedAt ?? mockNow(),
    updatedAt: mockNow(),
  };
  if (existing) Object.assign(existing, application);
  else state.storeApplications.unshift(application);
  return existing ?? application;
}

function createStoreFromApplication(state: MockRecord, application: MockRecord) {
  const existing = state.stores.find((item: MockRecord) => item.ownerId === application.userId);
  if (existing) return existing;
  const store = {
    id: state.nextIds.store++,
    ownerId: application.userId,
    name: application.shopName,
    address: application.address,
    city: application.city,
    state: application.state,
    pincode: application.pincode,
    logoUrl: application.logoUrl ?? "",
    bannerUrl: application.shopFrontPhoto ?? application.bannerUrl ?? "",
    rating: "4.1",
    ratingCount: 0,
    estimatedDeliveryMins: 40,
    deliveryFee: "29.00",
    freeDeliveryAbove: "299.00",
    minOrderValue: "99.00",
    isOpen: true,
    isVerified: true,
    approvalStatus: "approved",
    gstNumber: application.gstNumber,
    businessType: application.businessType,
    category: application.category,
    lat: 22.5726,
    lng: 88.3639,
    pickupAddress: application.pickupAddress ?? application.address,
    createdAt: mockNow(),
  };
  state.stores.unshift(store);
  return store;
}

function makeMockError(status: number, error: string, method: string, url: string): never {
  const response = new Response(JSON.stringify({ error }), {
    status,
    statusText: error,
    headers: { "content-type": "application/json" },
  });
  throw new ApiError(response, { error }, { method, url });
}

function createSessionToken(state: MockRecord, user: MockRecord) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const token = `session-${random}`;
  state.sessions = state.sessions ?? {};
  state.sessions[token] = {
    userId: user.id,
    createdAt: mockNow(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
  };
  return token;
}

function getTokenUser(state: MockRecord, token: string | null) {
  if (!token) return null;
  const session = state.sessions?.[token];
  if (!session || (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now())) {
    if (session) delete state.sessions[token];
    return null;
  }
  const user = state.users.find((item: MockRecord) => item.id === Number(session.userId)) ?? null;
  if (!user || user.isActive === false) return null;
  return user;
}

function productWithStore(state: MockRecord, product: MockRecord) {
  return {
    ...product,
    category: state.categories.find((category: MockRecord) => category.id === product.categoryId) ?? null,
    store: state.stores.find((store: MockRecord) => store.id === product.storeId) ?? null,
  };
}

const DEFAULT_HOMEPAGE_SECTIONS = [
  ["Recommended for You", "recommended-for-you", "PERSONALIZED"],
  ["Best Sellers", "best-sellers", "BEST_SELLING"],
  ["Electronics Top Picks", "electronics-top-picks", "CATEGORY_BASED"],
  ["Grocery Saver Packs", "grocery-saver-packs", "DISCOUNT_BASED"],
  ["Today's Deals", "todays-deals", "DISCOUNT_BASED"],
  ["Featured Products", "featured-products", "MANUAL"],
  ["Trending Products", "trending-products", "RULE_BASED"],
  ["New Arrivals", "new-arrivals", "NEW_ARRIVAL"],
  ["Local Favourites", "local-favourites", "RULE_BASED"],
  ["Seasonal Offers", "seasonal-offers", "DISCOUNT_BASED"],
  ["Fast Delivery Picks", "fast-delivery-picks", "RULE_BASED"],
];

function ensureHomepageState(state: MockRecord) {
  state.homepageSections = state.homepageSections ?? DEFAULT_HOMEPAGE_SECTIONS.map(([title, slug, sectionType], index) => ({
    id: index + 1,
    title,
    slug,
    subtitle: index === 0 ? "Admin curated products for your local zone" : "",
    sectionType,
    layoutType: index % 3 === 1 ? "product_grid" : "horizontal_product_scroll",
    productLimit: 8,
    zoneId: null,
    cityId: null,
    isActive: true,
    personalizedEnabled: sectionType === "PERSONALIZED",
    sortOrder: index + 1,
    startAt: null,
    endAt: null,
    createdByAdminId: 1,
    updatedByAdminId: 1,
    createdAt: mockNow(),
    updatedAt: mockNow(),
  }));
  state.homepageSectionProducts = state.homepageSectionProducts ?? [];
  state.homepageRemovedProducts = state.homepageRemovedProducts ?? {};
  state.homepageAuditLog = state.homepageAuditLog ?? [];
}

function homepageScheduled(item: MockRecord) {
  const nowMs = Date.now();
  if (item.startAt && new Date(item.startAt).getTime() > nowMs) return false;
  if (item.endAt && new Date(item.endAt).getTime() < nowMs) return false;
  return true;
}

function homepageProductEligible(state: MockRecord, product: MockRecord) {
  const store = state.stores.find((item: MockRecord) => item.id === product.storeId);
  return Boolean(product?.isAvailable !== false && Number(product?.stock ?? product?.stockQty ?? 0) > 0 && store?.isActive !== false && store?.isOpen !== false && store?.isVerified !== false);
}

function sectionAllowsProduct(state: MockRecord, section: MockRecord, product: MockRecord) {
  const category = state.categories.find((item: MockRecord) => item.id === product.categoryId);
  const title = `${section.title} ${section.slug}`.toLowerCase();
  const haystack = `${product.name} ${category?.name ?? ""} ${(product.tags ?? []).join(" ")}`.toLowerCase();
  if (title.includes("electronics")) return /(electronic|mobile|phone|earphone|charger|smart|appliance|gadget|audio)/.test(haystack);
  if (title.includes("grocery")) return /(grocery|vegetable|fruit|milk|rice|atta|oil|dal|saver|pack|combo|family|bulk)/.test(haystack);
  return true;
}

function buildHomepageSectionProducts(state: MockRecord, section: MockRecord, zoneId = 0) {
  const removed = new Set((state.homepageRemovedProducts?.[String(section.id)] ?? []).map((id: unknown) => Number(id)));
  const manual = state.homepageSectionProducts
    .filter((item: MockRecord) => Number(item.sectionId) === Number(section.id))
    .filter((item: MockRecord) => !zoneId || !item.zoneId || Number(item.zoneId) === zoneId)
    .filter(homepageScheduled)
    .sort((a: MockRecord, b: MockRecord) => Number(b.isPinned) - Number(a.isPinned) || Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .map((item: MockRecord) => state.products.find((product: MockRecord) => Number(product.id) === Number(item.productId)))
    .filter(Boolean);

  let auto = [...state.products];
  if (section.sectionType === "BEST_SELLING") auto.sort((a: MockRecord, b: MockRecord) => Number(b.soldQty ?? b.reviewCount ?? b.rating ?? 0) - Number(a.soldQty ?? a.reviewCount ?? a.rating ?? 0));
  else if (section.sectionType === "DISCOUNT_BASED") auto.sort((a: MockRecord, b: MockRecord) => Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0));
  else if (section.sectionType === "NEW_ARRIVAL") auto.sort((a: MockRecord, b: MockRecord) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  else if (section.sectionType === "PERSONALIZED") auto.sort((a: MockRecord, b: MockRecord) => Number(b.rating ?? 0) - Number(a.rating ?? 0));

  const seen = new Set<number>();
  return [...manual, ...auto]
    .filter((product: MockRecord) => !removed.has(Number(product.id)))
    .filter((product: MockRecord) => homepageProductEligible(state, product) && sectionAllowsProduct(state, section, product))
    .filter((product: MockRecord) => {
      if (seen.has(Number(product.id))) return false;
      seen.add(Number(product.id));
      return true;
    })
    .slice(0, Number(section.productLimit ?? 8))
    .map((product: MockRecord) => productWithStore(state, product));
}

function homepageAudit(state: MockRecord, admin: MockRecord, action: string, payload: MockRecord) {
  state.homepageAuditLog.unshift({ id: Date.now(), adminId: admin.id, action, ...payload, timestamp: mockNow() });
  state.homepageAuditLog = state.homepageAuditLog.slice(0, 500);
}

function sellerIsActive(state: MockRecord, store: MockRecord | null | undefined) {
  if (!store || store.isOpen === false) return false;
  const owner = state.users.find((user: MockRecord) => user.id === store.ownerId);
  return owner?.isActive !== false && owner?.vendorStatus !== "rejected";
}

function ensureProductOrderable(state: MockRecord, product: MockRecord, method: string, path: string) {
  const store = state.stores.find((item: MockRecord) => item.id === product.storeId);
  if (!sellerIsActive(state, store)) makeMockError(400, "Seller is not active", method, path);
  if (product.isAvailable === false) makeMockError(400, `${product.name} is currently unavailable`, method, path);
  if (Number(product.stock ?? product.stockQty ?? 0) <= 0) makeMockError(400, `${product.name} is out of stock. Update stock from seller panel.`, method, path);
  return store;
}

function validateProductOptions(product: MockRecord, body: MockRecord, method: string, path: string) {
  const sizes = normalizeOptionList(product.sizes ?? product.specifications?.Sizes ?? product.specifications?.Size);
  const colors = normalizeOptionList(product.colors ?? product.specifications?.Colors ?? product.specifications?.Color);
  const selectedSize = String(body.selectedSize ?? body.size ?? "").trim();
  const selectedColor = String(body.selectedColor ?? body.color ?? "").trim();
  if (sizes.length && !selectedSize) makeMockError(400, "Please select a size", method, path);
  if (sizes.length && !sizes.includes(selectedSize)) makeMockError(400, "Selected size is not available", method, path);
  if (colors.length && !selectedColor) makeMockError(400, "Please select a color", method, path);
  if (colors.length && !colors.includes(selectedColor)) makeMockError(400, "Selected color is not available", method, path);
  const colorImages = product.colorImages && typeof product.colorImages === "object" ? product.colorImages : {};
  const selectedImageUrl = selectedColor ? colorImages[selectedColor] || colorImages[selectedColor.toLowerCase()] || body.selectedImageUrl : body.selectedImageUrl;
  return { selectedSize: selectedSize || null, selectedColor: selectedColor || null, imageUrl: selectedImageUrl || product.images?.[0] || null };
}

function approvedVendorStore(state: MockRecord, user: MockRecord, method: string, path: string) {
  let store = state.stores.find((item: MockRecord) => item.ownerId === user.id && item.approvalStatus !== "pending");
  if (!store && user.vendorStatus === "approved") {
    const application = state.storeApplications?.find((item: MockRecord) => item.userId === user.id && item.status === "approved");
    if (application) store = createStoreFromApplication(state, application);
  }
  if (!store && user.role === "vendor" && user.vendorStatus !== "pending" && user.vendorStatus !== "rejected") {
    user.vendorStatus = "approved";
    const application = upsertVendorApplication(state, user, {
      name: user.name,
      email: user.email,
      phone: user.phone,
      shopName: `${user.name ?? "Seller"} Store`,
      businessType: "Local retail store",
      category: "General",
      shopAddress: "Local pickup address",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700156",
      upiId: user.upiId ?? "",
    });
    application.status = "approved";
    store = createStoreFromApplication(state, application);
  }
  if (store) {
    store.address = store.address ?? store.pickupAddress ?? "Local pickup address";
    store.city = store.city ?? "Kolkata";
    store.lat = Number(store.lat ?? 22.5726);
    store.lng = Number(store.lng ?? 88.3639);
  }
  if (!store || user.vendorStatus === "pending") {
    const application = state.storeApplications?.find((item: MockRecord) => item.userId === user.id && item.status === "pending");
    makeMockError(403, application ? "Your shop registration is waiting for admin approval." : "No approved shop found for this account.", method, path);
  }
  return store;
}

function requireApprovedDeliveryPartner(user: MockRecord, method: string, path: string) {
  if (user.role === "admin") return;
  if (user.role !== "delivery_partner") makeMockError(403, "Delivery partner account required", method, path);
  if (user.deliveryStatus !== "approved") {
    makeMockError(403, user.deliveryStatus === "rejected" ? "Your delivery partner application was rejected." : "Your delivery partner registration is waiting for admin approval.", method, path);
  }
}

function buildCart(state: MockRecord, userId: number) {
  const items = (state.carts[String(userId)] ?? []).map((item: MockRecord) => ({
    ...item,
    product: state.products.find((product: MockRecord) => product.id === item.productId) ?? null,
    })).filter((item: MockRecord) => item.product);
  const storeId = items[0]?.product?.storeId ?? null;
  const store = storeId ? state.stores.find((item: MockRecord) => item.id === storeId) ?? null : null;
  const subtotal = items.reduce((sum: number, item: MockRecord) => sum + Number(item.price) * item.qty, 0);
  const deliveryFee = store && subtotal > 0 && subtotal < Number(store.freeDeliveryAbove ?? 299) ? Number(store.deliveryFee ?? 49) : 0;
  return {
    storeId,
    store,
    items,
    subtotal: subtotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    discount: "0.00",
    total: (subtotal + deliveryFee).toFixed(2),
    itemCount: items.reduce((sum: number, item: MockRecord) => sum + item.qty, 0),
  };
}

function removeProductEverywhere(state: MockRecord, productId: number) {
  const product = (state.products ?? []).find((item: MockRecord) => Number(item.id) === Number(productId));
  state.deletedSeedProducts = Array.from(new Set([
    ...(state.deletedSeedProducts ?? []),
    productId,
    ...(product?.name ? [String(product.name)] : []),
  ]));
  state.products = (state.products ?? []).filter((item: MockRecord) => item.id !== productId);
  Object.keys(state.carts ?? {}).forEach((key) => {
    state.carts[key] = (state.carts[key] ?? []).filter((item: MockRecord) => item.productId !== productId);
  });
  Object.keys(state.wishlist ?? {}).forEach((key) => {
    state.wishlist[key] = (state.wishlist[key] ?? []).filter((id: number) => Number(id) !== productId);
  });
  state.reviews = (state.reviews ?? []).filter((item: MockRecord) => Number(item.productId) !== productId);
  state.returns = (state.returns ?? []).filter((item: MockRecord) => Number(item.productId) !== productId);
}

function removeOrderEverywhere(state: MockRecord, orderId: number) {
  state.orders = (state.orders ?? []).filter((item: MockRecord) => item.id !== orderId);
  state.returns = (state.returns ?? []).filter((item: MockRecord) => item.orderId !== orderId);
  state.printLogs = (state.printLogs ?? []).filter((item: MockRecord) => item.orderId !== orderId);
}

function sellerInvoiceNumber(state: MockRecord, store: MockRecord) {
  state.invoiceCounters = state.invoiceCounters ?? {};
  const year = new Date().getFullYear();
  const initials = String(store.name ?? "CM")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 3)
    .toUpperCase() || "CM";
  const key = `${store.id}-${year}`;
  const next = Number(state.invoiceCounters[key] ?? 0) + 1;
  state.invoiceCounters[key] = next;
  return `CM-${initials}-${year}-${String(next).padStart(6, "0")}`;
}

function appendOrderAudit(state: MockRecord, entry: MockRecord) {
  state.orderAuditLog = [
    { id: Date.now() + Math.floor(Math.random() * 1000), createdAt: mockNow(), ...entry },
    ...(state.orderAuditLog ?? []),
  ];
}

function releaseOrderInventory(state: MockRecord, order: MockRecord, type: "RELEASED_AFTER_REJECTION" | "RELEASED_AFTER_CANCELLATION") {
  if (order.inventoryReleasedAt) return;
  state.inventoryTransactions = state.inventoryTransactions ?? [];
  (order.items ?? []).forEach((item: MockRecord) => {
    const product = state.products.find((candidate: MockRecord) => Number(candidate.id) === Number(item.productId));
    const quantity = Number(item.quantity ?? item.qty ?? 0);
    if (!product || quantity <= 0) return;
    product.stock = Number(product.stock ?? product.stockQty ?? 0) + quantity;
    product.stockQty = product.stock;
    state.inventoryTransactions.unshift({
      id: Date.now() + Math.floor(Math.random() * 1000),
      orderId: order.id,
      productId: product.id,
      shopId: order.storeId,
      type,
      quantity,
      createdAt: mockNow(),
    });
  });
  order.inventoryReleasedAt = mockNow();
}

function initiateRefundIfPaid(state: MockRecord, order: MockRecord, reason: string, actor: string) {
  if (String(order.paymentMethod) === "cod" || String(order.paymentStatus) !== "paid") return null;
  state.refunds = state.refunds ?? [];
  const existing = state.refunds.find((item: MockRecord) => item.orderId === order.id && ["pending", "processing", "completed"].includes(item.refundStatus));
  if (existing) return existing;
  const refund = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    refundId: `RF-${order.orderNumber}-${Date.now().toString().slice(-5)}`,
    orderId: order.id,
    sellerOrderId: order.sellerOrderId,
    paymentId: order.paymentId ?? `PAY-${order.orderNumber}`,
    refundAmount: Number(order.total ?? 0).toFixed(2),
    refundReason: reason,
    refundStatus: "processing",
    gatewayReference: `MOCK-${Date.now()}`,
    initiatedBy: actor,
    initiatedAt: mockNow(),
    completedAt: null,
    failedAt: null,
  };
  state.refunds.unshift(refund);
  order.refundStatus = "processing";
  order.refundId = refund.refundId;
  return refund;
}

function cancelOrderWithBusinessRules(state: MockRecord, order: MockRecord, actor: MockRecord, reason: string, code: string) {
  if (["delivered"].includes(String(order.status))) makeMockError(400, "Delivered order cannot be cancelled", "PATCH", "/api/orders/cancel");
  if (["picked_up", "on_the_way", "arriving"].includes(String(order.status)) && code !== "CANCELLED_BY_ADMIN") {
    makeMockError(400, "Picked up order needs admin/support cancellation", "PATCH", "/api/orders/cancel");
  }
  if (String(order.status) === "cancelled" && order.cancelCode) return order;
  releaseOrderInventory(state, order, code === "REJECTED_BY_SELLER" ? "RELEASED_AFTER_REJECTION" : "RELEASED_AFTER_CANCELLATION");
  const refund = initiateRefundIfPaid(state, order, reason, String(actor.role ?? "system"));
  const previousPartnerId = order.deliveryPartnerId;
  order.status = "cancelled";
  order.cancelCode = code;
  order.sellerOrderStatus = code === "REJECTED_BY_SELLER" ? "REJECTED_BY_SELLER" : order.sellerOrderStatus;
  order.cancelledAt = mockNow();
  order.cancelledBy = actor.id;
  order.cancelledByRole = actor.role;
  order.cancellationReason = reason;
  order.deliveryPartnerId = null;
  order.deliveryAssignmentStatus = previousPartnerId ? "CANCELLED" : order.deliveryAssignmentStatus;
  order.tracking = order.tracking ?? {};
  order.tracking.status = "cancelled";
  order.tracking.deliveryPartner = null;
  order.tracking.timeline = order.tracking.timeline ?? [];
  order.tracking.timeline.unshift({ status: "cancelled", code, message: reason, actorRole: actor.role, updatedAt: mockNow() });
  appendOrderAudit(state, { orderId: order.id, actorId: actor.id, actorRole: actor.role, action: code, reason, refundId: refund?.refundId ?? null });
  state.notifications[String(order.userId)] = [{ id: Date.now(), title: code === "REJECTED_BY_SELLER" ? "Order rejected by seller" : "Order cancelled", body: refund ? `${reason}. Refund processing started.` : reason, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
  if (previousPartnerId) {
    state.notifications[String(previousPartnerId)] = [{ id: Date.now() + 1, title: "Delivery assignment cancelled", body: `Order #${order.orderNumber} was cancelled.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(previousPartnerId)] ?? [])];
  }
  const adminId = adminUserId(state);
  state.notifications[String(adminId)] = [{ id: Date.now() + 2, title: "Order cancellation alert", body: `#${order.orderNumber}: ${reason}`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(adminId)] ?? [])];
  return order;
}

function buildInvoiceSnapshot(order: MockRecord, store: MockRecord, printType: string, paperSize: string, duplicate: boolean) {
  const subtotal = Number(order.subtotal ?? 0);
  const coupon = Number(order.couponDiscount ?? 0);
  const delivery = Number(order.deliveryFee ?? 0);
  const mrpTotal = (order.items ?? []).reduce((sum: number, item: MockRecord) => sum + Number(item.mrp ?? item.sellingPrice ?? item.price ?? 0) * Number(item.quantity ?? item.qty ?? 1), 0);
  const total = Number(order.total ?? 0);
  return {
    invoiceId: order.invoiceNumber,
    invoiceNumber: order.invoiceNumber,
    orderId: order.id,
    sellerOrderId: order.sellerOrderId,
    shopId: order.storeId,
    customerId: order.userId,
    printType,
    paperSize,
    duplicate,
    itemSnapshot: (order.items ?? []).map((item: MockRecord) => ({ ...item })),
    chargeSnapshot: {
      mrpTotal: mrpTotal.toFixed(2),
      productDiscount: Math.max(0, mrpTotal - subtotal).toFixed(2),
      couponDiscount: coupon.toFixed(2),
      subtotal: subtotal.toFixed(2),
      gst: Number(order.taxAmount ?? 0).toFixed(2),
      packagingCharge: Number(order.packagingCharge ?? 0).toFixed(2),
      deliveryCharge: delivery.toFixed(2),
      platformFee: Number(order.platformFee ?? 0).toFixed(2),
      grandTotal: total.toFixed(2),
      cashToCollect: order.paymentMethod === "cod" ? total.toFixed(2) : "0.00",
      paidAmount: order.paymentMethod === "cod" ? "0.00" : total.toFixed(2),
      refundedAmount: order.refundStatus ? total.toFixed(2) : "0.00",
    },
    taxSnapshot: { gstMode: "included_or_exempt", taxAmount: Number(order.taxAmount ?? 0).toFixed(2) },
    totalAmount: total.toFixed(2),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    invoiceStatus: order.status === "cancelled" ? "cancelled" : "issued",
    generatedAt: mockNow(),
    cancelledAt: order.cancelledAt ?? null,
    refundStatus: order.refundStatus ?? null,
    originalInvoiceId: duplicate ? order.invoiceNumber : null,
    shopSnapshot: { id: store.id, name: store.name, address: store.address, phone: store.phone, email: store.email, gstin: store.gstin, fssai: store.fssai },
    customerSnapshot: { ...order.addressSnapshot, phone: order.addressSnapshot?.phone ? `******${String(order.addressSnapshot.phone).slice(-4)}` : null },
  };
}

function removeStoreEverywhere(state: MockRecord, storeId: number) {
  const store = (state.stores ?? []).find((item: MockRecord) => Number(item.id) === Number(storeId));
  state.deletedSeedStores = Array.from(new Set([
    ...(state.deletedSeedStores ?? []),
    storeId,
    ...(store?.name ? [String(store.name)] : []),
  ]));
  const productIds = (state.products ?? []).filter((item: MockRecord) => item.storeId === storeId).map((item: MockRecord) => Number(item.id));
  productIds.forEach((productId: number) => removeProductEverywhere(state, productId));
  const orderIds = (state.orders ?? []).filter((item: MockRecord) => item.storeId === storeId).map((item: MockRecord) => Number(item.id));
  orderIds.forEach((orderId: number) => removeOrderEverywhere(state, orderId));
  state.stores = (state.stores ?? []).filter((item: MockRecord) => item.id !== storeId);
  Object.keys(state.carts ?? {}).forEach((key) => {
    state.carts[key] = (state.carts[key] ?? []).filter((item: MockRecord) => {
      const product = state.products.find((productItem: MockRecord) => productItem.id === item.productId);
      return product?.storeId !== storeId;
    });
  });
}

function removeUserEverywhere(state: MockRecord, userId: number) {
  const storeIds = (state.stores ?? []).filter((item: MockRecord) => item.ownerId === userId).map((item: MockRecord) => Number(item.id));
  storeIds.forEach((storeId: number) => removeStoreEverywhere(state, storeId));
  const orderIds = (state.orders ?? []).filter((item: MockRecord) => item.userId === userId || item.deliveryPartnerId === userId).map((item: MockRecord) => Number(item.id));
  orderIds.forEach((orderId: number) => removeOrderEverywhere(state, orderId));
  state.users = (state.users ?? []).filter((item: MockRecord) => item.id !== userId);
  delete state.carts?.[String(userId)];
  delete state.wishlist?.[String(userId)];
  delete state.addresses?.[String(userId)];
  delete state.notifications?.[String(userId)];
  delete state.walletTransactions?.[String(userId)];
  state.reviews = (state.reviews ?? []).filter((item: MockRecord) => item.userId !== userId);
  state.storeApplications = (state.storeApplications ?? []).filter((item: MockRecord) => item.userId !== userId);
  Object.keys(state.sessions ?? {}).forEach((token) => {
    if (Number(state.sessions[token]?.userId) === userId) delete state.sessions[token];
  });
}

function purgeMockToAdminOnly(state: MockRecord) {
  const adminCredentials = getAdminCredentials();
  let admin = (state.users ?? []).find((item: MockRecord) => String(item.email ?? "").toLowerCase() === adminCredentials.email.toLowerCase() && item.role === "admin")
    ?? (state.users ?? []).find((item: MockRecord) => item.role === "admin");
  admin = {
    ...makeUser({ id: Number(admin?.id ?? 1), email: adminCredentials.email, name: admin?.name || "Admin User", role: "admin", password: adminCredentials.password, walletBalance: admin?.walletBalance ?? "7000.00" }),
    ...admin,
    email: adminCredentials.email,
    password: adminCredentials.password,
    role: "admin",
    isActive: true,
    deletedAt: null,
  };
  state.users = [admin];
  state.categories = [];
  state.products = [];
  state.stores = [];
  state.orders = [];
  state.returns = [];
  state.reviews = [];
  state.carts = {};
  state.wishlist = {};
  state.addresses = {};
  state.notifications = { [String(admin.id)]: state.notifications?.[String(admin.id)] ?? [] };
  state.walletTransactions = { [String(admin.id)]: state.walletTransactions?.[String(admin.id)] ?? [] };
  state.storeApplications = [];
  state.walletWithdrawalRequests = [];
  state.deliveryOtp = {};
  state.verificationAuditLog = [];
  state.homepageSectionProducts = [];
  state.deletedSeedProducts = ["*"];
  state.deletedSeedCategories = ["*"];
  state.deletedSeedStores = ["*"];
  Object.keys(state.sessions ?? {}).forEach((token) => {
    if (Number(state.sessions[token]?.userId) !== Number(admin.id)) delete state.sessions[token];
  });
  state.nextIds = {
    ...(state.nextIds ?? {}),
    user: Math.max(Number(admin.id) + 1, 2),
    product: 1,
    store: 1,
    order: 1,
    cartItem: 1,
    address: 1,
    storeApplication: 1,
    withdrawal: 1,
  };
}

function couponDiscount(coupon: MockRecord, amount: number) {
  if (!coupon || amount < Number(coupon.minOrderValue ?? 0)) return 0;
  const raw = coupon.discountType === "percent" ? amount * Number(coupon.discountValue) / 100 : Number(coupon.discountValue);
  return Math.min(raw, Number(coupon.maxDiscount ?? raw), amount);
}

function mockDistanceKm(aLat?: number, aLng?: number, bLat?: number, bLng?: number) {
  if ([aLat, aLng, bLat, bLng].some(value => value === undefined || Number.isNaN(Number(value)))) return 3.2;
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(Number(bLat) - Number(aLat));
  const dLng = toRad(Number(bLng) - Number(aLng));
  const lat1 = toRad(Number(aLat));
  const lat2 = toRad(Number(bLat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function defaultServiceZones() {
  return [
    {
      id: 1,
      zoneCode: "KOL-NT-5K",
      zoneName: "Kolkata New Town 5 km",
      cityId: 1,
      stateId: 19,
      centreLatitude: 22.6076,
      centreLongitude: 88.4695,
      radiusMeters: 5000,
      boundaryGeometry: null,
      status: "active",
      acceptingOrders: true,
      deliveryEnabled: true,
      defaultDeliveryTime: 40,
      minimumOrderAmount: 99,
      maximumDeliveryDistance: 5000,
      createdAt: mockNow(),
      updatedAt: mockNow(),
    },
    {
      id: 2,
      zoneCode: "KOL-CEN-5K",
      zoneName: "Kolkata Central 5 km",
      cityId: 1,
      stateId: 19,
      centreLatitude: 22.5726,
      centreLongitude: 88.3639,
      radiusMeters: 5000,
      boundaryGeometry: null,
      status: "active",
      acceptingOrders: true,
      deliveryEnabled: true,
      defaultDeliveryTime: 40,
      minimumOrderAmount: 99,
      maximumDeliveryDistance: 5000,
      createdAt: mockNow(),
      updatedAt: mockNow(),
    },
  ];
}

function resolveServiceZone(state: MockRecord, lat?: number, lng?: number) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const zones = (state.serviceZones ?? []).filter((zone: MockRecord) => zone.status === "active" && zone.acceptingOrders !== false);
  return zones
    .map((zone: MockRecord) => {
      const distanceKm = mockDistanceKm(Number(lat), Number(lng), Number(zone.centreLatitude), Number(zone.centreLongitude));
      return { ...zone, distanceKm, serviceable: distanceKm * 1000 <= Number(zone.radiusMeters ?? 5000) };
    })
    .sort((a: MockRecord, b: MockRecord) => Number(a.distanceKm) - Number(b.distanceKm))[0] ?? null;
}

function eligiblePublicZones(state: MockRecord, type: "seller" | "rider", lat?: number, lng?: number) {
  return (state.serviceZones ?? [])
    .filter((zone: MockRecord) => (zone.status ?? (zone.isActive === false ? "paused" : "active")) === "active" && zone.archivedAt == null)
    .filter((zone: MockRecord) => zone.registrationEnabled !== false)
    .filter((zone: MockRecord) => type === "seller" ? zone.sellerRegistrationEnabled !== false : zone.riderRegistrationEnabled !== false && zone.deliveryEnabled !== false)
    .map((zone: MockRecord) => {
      const distance = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? mockDistanceKm(Number(lat), Number(lng), Number(zone.centreLatitude), Number(zone.centreLongitude))
        : null;
      return {
        id: zone.id,
        code: zone.code ?? zone.zoneCode,
        name: zone.name ?? zone.zoneName,
        city: zone.city,
        state: zone.state,
        approximateArea: `${zone.city ?? "Local area"} service zone`,
        radiusMeters: zone.radiusMeters ?? 5000,
        deliveryMinutes: zone.deliveryMinutes ?? zone.defaultDeliveryTime ?? 40,
        minimumOrderAmount: zone.minimumOrderAmount ?? 99,
        registrationAvailable: true,
        acceptingOrders: zone.acceptingOrders !== false,
        deliveryEnabled: zone.deliveryEnabled !== false,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        insideServiceZone: distance === null ? false : distance * 1000 <= Number(zone.radiusMeters ?? 5000),
      };
    })
    .sort((a: MockRecord, b: MockRecord) => Number(a.distanceKm ?? 9999) - Number(b.distanceKm ?? 9999));
}

function assignZoneIds(state: MockRecord) {
  state.serviceZones = state.serviceZones?.length ? state.serviceZones : defaultServiceZones();
  state.stores.forEach((store: MockRecord) => {
    const zone = resolveServiceZone(state, Number(store.lat), Number(store.lng));
    store.zoneId = store.zoneId ?? zone?.id ?? 1;
    store.serviceRadiusMeters = Number(store.serviceRadiusMeters ?? 5000);
    store.deliveryEnabled = store.deliveryEnabled ?? true;
  });
  state.products.forEach((product: MockRecord) => {
    const store = state.stores.find((item: MockRecord) => item.id === product.storeId);
    product.zoneId = product.zoneId ?? store?.zoneId ?? 1;
    product.masterProductId = product.masterProductId ?? product.id;
    product.listingStatus = product.listingStatus ?? "active";
    product.approvalStatus = product.approvalStatus ?? "approved";
    product.reservedStock = product.reservedStock ?? 0;
  });
  state.users.forEach((user: MockRecord) => {
    if (user.role === "delivery_partner") user.currentZoneId = user.currentZoneId ?? 1;
    if (user.role === "admin") {
      user.adminRole = user.adminRole ?? "SUPER_ADMIN";
      user.zoneIds = user.zoneIds ?? state.serviceZones.map((zone: MockRecord) => zone.id);
    }
  });
}

function mockOrderLocations(order: MockRecord) {
  const storeLat = Number(order.store?.lat ?? 22.5726);
  const storeLng = Number(order.store?.lng ?? 88.3639);
  const customerLat = Number(order.address?.lat ?? order.addressSnapshot?.lat ?? storeLat + 0.026);
  const customerLng = Number(order.address?.lng ?? order.addressSnapshot?.lng ?? storeLng + 0.031);
  const partnerLocation = order.tracking?.partnerLocation ?? order.tracking?.deliveryPartner?.location ?? { lat: storeLat + 0.006, lng: storeLng + 0.004 };
  return {
    storeLocation: { lat: storeLat, lng: storeLng, label: order.store?.name ?? "Store hub", address: order.store?.address ?? "Pickup point" },
    customerLocation: { lat: customerLat, lng: customerLng, label: order.address?.label ?? "Customer", address: `${order.addressSnapshot?.line1 ?? "Delivery address"}, ${order.addressSnapshot?.city ?? ""}` },
    partnerLocation: { lat: Number(partnerLocation.lat), lng: Number(partnerLocation.lng) },
  };
}

function mockTrackingPayload(order: MockRecord, state?: MockRecord) {
  const locations = mockOrderLocations(order);
  const distance = mockDistanceKm(locations.partnerLocation.lat, locations.partnerLocation.lng, locations.customerLocation.lat, locations.customerLocation.lng);
  const eta = order.status === "delivered"
    ? 0
    : ["picked_up", "on_the_way", "arriving"].includes(order.status)
      ? Math.min(40, Math.max(4, Math.ceil(distance / 0.32) + 5))
      : Math.min(40, Math.max(18, Number(order.estimatedDeliveryMins ?? 40)));
  const tracking = order.tracking ?? {};
  return {
    orderId: order.id,
    status: order.status,
    estimatedMins: eta,
    distanceKm: Number(distance.toFixed(1)),
    pickupOtp: order.status === "delivered" ? null : tracking.pickupOtp ?? generateOrderOtp(order.id, 431),
    deliveryOtp: order.status === "delivered" ? null : tracking.deliveryOtp ?? generateOrderOtp(order.id, 0),
    riderHeading: tracking.partnerLocation?.heading ?? tracking.deliveryPartner?.location?.heading ?? 0,
    riderSpeed: tracking.partnerLocation?.speed ?? tracking.deliveryPartner?.location?.speed ?? 0,
    locationAccuracy: tracking.partnerLocation?.accuracy ?? tracking.deliveryPartner?.location?.accuracy ?? null,
    lastLocationUpdatedAt: tracking.partnerLocation?.updatedAt ?? tracking.deliveryPartner?.location?.updatedAt ?? null,
    acceptedAt: tracking.etaStartedAt ?? null,
    pickedUpAt: tracking.pickupVerifiedAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    trackingStopped: order.status === "delivered",
    locationWarning: tracking.locationWarning ?? null,
    payout: {
      sellerAmount: Math.max(0, Number(order.total ?? 0) - Number(order.deliveryFee ?? 0)).toFixed(2),
      delivery: order.deliveryPartnerEarning ?? deliveryFeeForOrder(order).earning.toFixed(2),
      distanceKm: order.deliveryDistanceKm ?? deliveryFeeForOrder(order).km,
    },
    deliveryPartner: state ? publicTrackingPartner(state, order) : (order.status === "delivered" ? null : tracking.deliveryPartner ?? null),
    ...locations,
    route: [locations.storeLocation, locations.partnerLocation, locations.customerLocation],
    timeline: tracking.timeline ?? [],
  };
}

function clearDeliveredOtps(order: MockRecord) {
  if (order.status !== "delivered") return;
  order.tracking = order.tracking ?? {};
  order.tracking.pickupOtp = null;
  order.tracking.deliveryOtp = null;
  order.deliveryOtpClearedAt = order.deliveryOtpClearedAt ?? mockNow();
}

function approvedDeliveryProfilePhoto(user?: MockRecord | null) {
  if (!user || user.role !== "delivery_partner" || user.deliveryStatus !== "approved") return null;
  return user.publicProfilePhotoUrl ?? user.avatarUrl ?? null;
}

function publicTrackingPartner(state: MockRecord, order: MockRecord) {
  if (!order.deliveryPartnerId || ["delivered", "cancelled"].includes(String(order.status))) return null;
  const partner = state.users.find((item: MockRecord) => item.id === order.deliveryPartnerId && item.role === "delivery_partner");
  const trackingPartner = order.tracking?.deliveryPartner ?? {};
  if (!partner || partner.deliveryStatus !== "approved") return null;
  return {
    id: partner.id,
    partnerId: `CM-DP-${String(partner.id).padStart(5, "0")}`,
    name: partner.name,
    phone: partner.phone ?? trackingPartner.phone ?? null,
    vehicleType: partner.vehicleType ?? trackingPartner.vehicleType ?? "Bike",
    vehicleNumber: partner.vehicleNumber ?? trackingPartner.vehicleNumber ?? "",
    rating: partner.rating ?? trackingPartner.rating ?? "4.8",
    photoUrl: approvedDeliveryProfilePhoto(partner),
    photoVerified: Boolean(approvedDeliveryProfilePhoto(partner)),
    status: partner.isOnline === false ? "offline" : order.status === "packed" ? "waiting" : ["picked_up", "on_the_way"].includes(String(order.status)) ? "delivering" : String(order.status),
    location: trackingPartner.location ?? order.tracking?.partnerLocation ?? null,
  };
}

function mockMovePartner(order: MockRecord, lat: number, lng: number, meta: MockRecord = {}) {
  order.tracking = order.tracking ?? {};
  order.tracking.partnerLocation = { lat, lng, updatedAt: mockNow(), ...meta };
  if (order.tracking.deliveryPartner) {
    order.tracking.deliveryPartner.location = { lat, lng, updatedAt: mockNow(), ...meta };
  }
}

function mockAdvancePartner(order: MockRecord) {
  if (["cancelled"].includes(order.status)) return;
  const locations = mockOrderLocations(order);
  const current = locations.partnerLocation;
  let target = locations.storeLocation;

  if (["on_the_way", "arriving", "delivered"].includes(order.status)) {
    target = locations.customerLocation;
  } else if (["picked_up"].includes(order.status)) {
    target = {
      ...locations.storeLocation,
      lat: (locations.storeLocation.lat + locations.customerLocation.lat) / 2,
      lng: (locations.storeLocation.lng + locations.customerLocation.lng) / 2,
    };
  }

  if (order.status === "delivered") {
    mockMovePartner(order, locations.customerLocation.lat, locations.customerLocation.lng);
    return;
  }

  const step = ["on_the_way", "arriving"].includes(order.status) ? 0.18 : 0.08;
  const nextLat = current.lat + (Number(target.lat) - current.lat) * step;
  const nextLng = current.lng + (Number(target.lng) - current.lng) * step;
  mockMovePartner(order, nextLat, nextLng);

  const distance = mockDistanceKm(nextLat, nextLng, locations.customerLocation.lat, locations.customerLocation.lng);
  if (order.status === "on_the_way" && distance < 0.75) {
    order.status = "arriving";
    order.tracking.status = "arriving";
    order.tracking.timeline.unshift({ status: "arriving", message: "Delivery partner is near the customer", updatedAt: mockNow() });
  }
}

async function tryMockFetch<T>(input: RequestInfo | URL, options: CustomFetchOptions, method: string): Promise<T | undefined> {
  if (!mockApiEnabled()) return undefined;
  const state = getMockState() as MockRecord | null;
  if (!state) return undefined;
  const urlText = resolveUrl(input);
  const url = new URL(urlText, "http://local-commerce.test");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return undefined;

  const token = _authTokenGetter ? await _authTokenGetter() : null;
  const currentUser = getTokenUser(state, token);
  const body = parseMockBody(options);
  const requireUser = () => currentUser ?? makeMockError(401, "Please login first", method, path);
  const requireAdmin = () => {
    const user = requireUser();
    if (user.role !== "admin") makeMockError(403, "Admin access required", method, path);
    return user;
  };
  const ok = (data: unknown) => data as T;

  if (path === "/api/healthz") return ok({ ok: true, status: "ok" });
  if (path === "/api/uploads/image" && method === "POST") {
    const user = requireUser();
    const dataUrl = String(body.dataUrl ?? "");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,/i);
    if (!match) makeMockError(400, "Only JPG, PNG, WEBP or GIF images are allowed.", method, path);
    const sizeBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    if (sizeBytes > 5 * 1024 * 1024) makeMockError(400, "Image is too large. Please upload up to 5 MB.", method, path);
    const folder = String(body.folder ?? "general").toLowerCase().replace(/[^a-z0-9/_-]+/g, "-").replace(/^\/|\/$/g, "") || "general";
    const ext = match[1].toLowerCase() === "image/jpeg" ? "jpg" : match[1].split("/")[1];
    return ok({
      imageUrl: dataUrl,
      storagePath: `${folder}/${user.id}/${Date.now()}.${ext}`,
      provider: "mock",
      mime: match[1].toLowerCase(),
      sizeBytes,
    });
  }
  if (path === "/api/auth/otp/send" && method === "POST") {
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!phone && !email) makeMockError(400, "Email or mobile number is required", method, path);
    if (phone && !/^\d{10}$/.test(phone)) makeMockError(400, "Valid 10 digit mobile number required", method, path);
    state.otpCodes = state.otpCodes ?? {};
    const target = phone || email;
    state.otpCodes[target] = {
      otp: "123456",
      purpose: body.purpose ?? "login",
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    };
    saveMockState(state);
    return ok({ message: "OTP sent", verificationMode: "DEMO", expiresInSeconds: 300 });
  }
  if (path === "/api/auth/delivery-otp/send" && method === "POST") {
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) makeMockError(400, "Valid 10 digit mobile number required", method, path);
    const duplicate = state.users.find((item: MockRecord) => item.role === "delivery_partner" && item.phone === phone);
    if (duplicate) makeMockError(400, "Delivery partner account already exists for this mobile number", method, path);
    const existingOtp = state.deliveryOtp?.[phone];
    const nowMs = Date.now();
    if (existingOtp?.blockedUntil && nowMs < Number(existingOtp.blockedUntil)) {
      makeMockError(429, "Too many OTP attempts. Please try again later.", method, path);
    }
    state.deliveryOtp = state.deliveryOtp ?? {};
    state.deliveryOtp[phone] = {
      otp: "123456",
      attempts: 0,
      verified: false,
      expiresAt: nowMs + 5 * 60 * 1000,
      sentAt: mockNow(),
    };
    saveMockState(state);
    return ok({ message: "OTP sent", expiresInSeconds: 300 });
  }
  if (path === "/api/auth/delivery-otp/verify" && method === "POST") {
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const otp = String(body.otp ?? "").replace(/\D/g, "");
    const record = state.deliveryOtp?.[phone];
    const nowMs = Date.now();
    if (!record && otp === "123456") return ok({ message: "Mobile verified" });
    if (!record) makeMockError(400, "Please send OTP first", method, path);
    if (record.blockedUntil && nowMs < Number(record.blockedUntil)) makeMockError(429, "OTP verification temporarily blocked", method, path);
    if (nowMs > Number(record.expiresAt)) makeMockError(400, "OTP expired. Please resend.", method, path);
    record.attempts = Number(record.attempts ?? 0) + 1;
    if (record.otp !== otp && otp !== "123456") {
      if (record.attempts >= 5) record.blockedUntil = nowMs + 10 * 60 * 1000;
      saveMockState(state);
      makeMockError(401, record.attempts >= 5 ? "Too many wrong OTP attempts. Try after 10 minutes." : "Invalid OTP. Please try again.", method, path);
    }
    record.verified = true;
    record.verifiedAt = mockNow();
    saveMockState(state);
    return ok({ message: "Mobile verified" });
  }
  if (path === "/api/auth/register" && method === "POST") {
    if (!body.name || !body.password || (!body.email && !body.phone)) makeMockError(400, "Name, password and email or phone are required", method, path);
    const requestedRole = String(body.role ?? "customer").trim().toLowerCase();
    if (!["customer", "vendor", "delivery_partner"].includes(requestedRole)) {
      makeMockError(403, "This account type cannot be created from the public application.", method, path);
    }
    const role = requestedRole;
    if (role === "vendor" && (!body.avatarUrl || !body.bannerUrl)) {
      makeMockError(400, "Seller photo and shop front photo are required", method, path);
    }
    if (role === "vendor" || role === "delivery_partner") {
      const selectedZoneId = Number(body.selectedZoneId ?? body.zoneId);
      const lat = Number(role === "vendor" ? body.shopLatitude ?? body.lat : body.currentLatitude ?? body.lat);
      const lng = Number(role === "vendor" ? body.shopLongitude ?? body.lng : body.currentLongitude ?? body.lng);
      const zone = eligiblePublicZones(state, role === "vendor" ? "seller" : "rider", lat, lng).find((item: MockRecord) => Number(item.id) === selectedZoneId);
      if (!zone) makeMockError(400, "Please select an active service zone.", method, path);
      if (!zone.insideServiceZone) makeMockError(400, role === "vendor" ? "Your shop location is outside the selected service zone." : "Your current location is outside the selected service zone.", method, path);
      body.zoneId = selectedZoneId;
      body.lat = lat;
      body.lng = lng;
      if (role === "delivery_partner") body.currentZoneId = selectedZoneId;
    }
    if (body.email && state.users.some((user: MockRecord) => user.email === body.email)) {
      makeMockError(400, "User with this email already exists", method, path);
    }
    const samePhoneUsers = body.phone ? state.users.filter((user: MockRecord) => user.phone === body.phone) : [];
    if (samePhoneUsers.length >= 3) makeMockError(400, "Maximum 3 accounts are allowed with one mobile number", method, path);
    if (samePhoneUsers.some((user: MockRecord) => user.role === role)) {
      makeMockError(400, "This mobile number already has this account type", method, path);
    }
    const target = String(body.phone ?? body.email ?? "").replace(/\D/g, "") || String(body.email ?? "").trim().toLowerCase();
    const savedOtp = state.otpCodes?.[target];
    if ((!savedOtp || Number(savedOtp.expiresAt ?? 0) < Date.now() || savedOtp.otp !== body.otp) && String(body.otp ?? "") !== "123456") {
      makeMockError(400, "Valid OTP is required", method, path);
    }
    const existing = state.users.find((user: MockRecord) => body.email && user.email === body.email);
    if (existing) {
      if (role !== "vendor") makeMockError(400, "User with this email or phone already exists", method, path);
      existing.role = "vendor";
      existing.vendorStatus = existing.vendorStatus === "approved" ? "approved" : "pending";
      existing.name = body.name ?? existing.name;
      existing.phone = body.phone ?? existing.phone;
      existing.email = body.email ?? existing.email;
      if (body.password) existing.password = body.password;
      if (body.zoneId) existing.zoneIds = Array.from(new Set([...(existing.zoneIds ?? []), Number(body.zoneId)]));
      upsertVendorApplication(state, existing, body);
      state.notifications[String(existing.id)] = [{ id: Date.now(), title: "Shop registration submitted", body: "Admin approval pending. You can add products after approval.", isRead: false, createdAt: mockNow() }, ...(state.notifications[String(existing.id)] ?? [])];
      const token = createSessionToken(state, existing);
      saveMockState(state);
      return ok({ token, user: publicUser(existing) });
    }
    if (role === "delivery_partner") {
      const phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!state.deliveryOtp?.[phone]?.verified && String(body.otp ?? "") !== "123456") makeMockError(400, "Mobile OTP must be verified before delivery partner registration", method, path);
      if (mockRequiresDrivingLicence(String(body.vehicleType ?? ""))) {
        const duplicateLicense = state.users.find((item: MockRecord) => item.role === "delivery_partner" && String(item.licenseNumber ?? "").toUpperCase() === String(body.licenseNumber ?? "").toUpperCase());
        if (duplicateLicense) makeMockError(400, "Driving licence is already used by another delivery partner", method, path);
      }
    }
    const deliveryKyc = role === "delivery_partner" ? requireDeliveryKyc(body, method, path) : {};
    const userPayload = role === "delivery_partner"
      ? { ...body, aadhaarNumber: undefined, ...deliveryKyc }
      : body;
    const user = makeUser({
      ...userPayload,
      id: state.nextIds.user++,
      role,
      vendorStatus: role === "vendor" ? "pending" : undefined,
      deliveryStatus: role === "delivery_partner" ? "pending" : undefined,
      zoneIds: body.zoneId ? [Number(body.zoneId)] : undefined,
    });
    state.users.push(user);
    state.addresses[String(user.id)] = [];
    if (role === "vendor") {
      upsertVendorApplication(state, user, body);
      state.notifications[String(user.id)] = [{ id: Date.now(), title: "Shop registration submitted", body: "Admin approval pending. You can add products after approval.", isRead: false, createdAt: mockNow() }];
    }
    if (role === "delivery_partner") {
      const deliveryUser = user as MockRecord;
      deliveryUser.selfieVerifications = [{
        id: Date.now(),
        verificationType: "REGISTRATION",
        profilePhotoStorageKey: deliveryUser.profilePhotoStorageKey,
        liveSelfieStorageKey: deliveryUser.liveSelfieStorageKey,
        livenessStatus: "completed",
        faceMatchStatus: "manual_review_required",
        verificationStatus: "manual_review_required",
        capturedAt: mockNow(),
      }];
      state.verificationAuditLog = [{ id: Date.now(), userId: user.id, action: "delivery_registration_submitted", createdAt: mockNow() }, ...(state.verificationAuditLog ?? [])];
      if (state.deliveryOtp?.[user.phone]) delete state.deliveryOtp[user.phone];
      state.notifications[String(user.id)] = [{
        id: Date.now(),
        title: "Delivery partner registration submitted",
        body: "Admin approval pending. You can receive orders after approval.",
        isRead: false,
        createdAt: mockNow(),
      }];
    }
    saveMockState(state);
    const token = createSessionToken(state, user);
    saveMockState(state);
    return ok({ token, user: publicUser(user) });
  }
  if (path === "/api/auth/login" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    const authState = state as MockRecord;
    authState.loginAuditLog = authState.loginAuditLog ?? [];
    authState.loginFailures = authState.loginFailures ?? {};
    const identifier = String(body.email ?? body.phone ?? "unknown").toLowerCase();
    const failure = authState.loginFailures[identifier] ?? { count: 0, lockedUntil: 0 };
    if (failure.lockedUntil && Date.now() < Number(failure.lockedUntil)) {
      makeMockError(429, "Too many failed attempts. Please try again later.", method, path);
    }
    const recordFailure = (reason: string) => {
      failure.count = Number(failure.count ?? 0) + 1;
      if (failure.count >= 5) failure.lockedUntil = Date.now() + 10 * 60 * 1000;
      authState.loginFailures[identifier] = failure;
      authState.loginAuditLog.unshift({ id: Date.now(), identifier, roleHint: body.roleHint ?? null, reason, success: false, createdAt: mockNow() });
      saveMockState(state);
    };
    const genericAuthMessage = "Invalid credentials or account unavailable.";
    const requestedRole = String(body.roleHint ?? body.requestedRole ?? "").trim().toLowerCase();
    if (!user || user.password !== body.password) {
      recordFailure("invalid_credentials");
      makeMockError(401, genericAuthMessage, method, path);
    }
    if (user.isActive === false) makeMockError(401, genericAuthMessage, method, path);
    if (requestedRole && requestedRole !== user.role) makeMockError(401, genericAuthMessage, method, path);
    if (user.role === "vendor" && user.vendorStatus && user.vendorStatus !== "approved") makeMockError(403, "Seller account is pending admin approval.", method, path);
    if (user.role === "delivery_partner" && user.deliveryStatus && user.deliveryStatus !== "approved") makeMockError(403, "Delivery partner account is pending admin approval.", method, path);
    delete authState.loginFailures[identifier];
    const token = createSessionToken(state, user);
    authState.loginAuditLog.unshift({ id: Date.now(), userId: user.id, identifier, role: user.role, success: true, createdAt: mockNow() });
    saveMockState(state);
    return ok({ token, user: publicUser(user) });
  }
  if (path === "/api/auth/otp-login" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    const genericAuthMessage = "Invalid credentials or account unavailable.";
    const requestedRole = String(body.roleHint ?? body.requestedRole ?? "").trim().toLowerCase();
    const target = String(body.phone ?? body.email ?? "").replace(/\D/g, "") || String(body.email ?? "").trim().toLowerCase();
    const savedOtp = state.otpCodes?.[target];
    if (!user || ((savedOtp?.otp !== body.otp || Number(savedOtp?.expiresAt ?? 0) < Date.now()) && String(body.otp ?? "") !== "123456")) makeMockError(401, genericAuthMessage, method, path);
    if (user.isActive === false) makeMockError(401, genericAuthMessage, method, path);
    if (requestedRole && requestedRole !== user.role) makeMockError(401, genericAuthMessage, method, path);
    const token = createSessionToken(state, user);
    saveMockState(state);
    return ok({ token, user: publicUser(user) });
  }
  if (path === "/api/auth/forgot-password" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    const genericForgotMessage = "If an eligible account exists, recovery instructions have been sent.";
    if (!user) return ok({ message: genericForgotMessage });
    const target = String(body.phone ?? body.email ?? "").replace(/\D/g, "") || String(body.email ?? "").trim().toLowerCase();
    const savedOtp = state.otpCodes?.[target];
    if (((savedOtp?.otp !== body.otp || Number(savedOtp?.expiresAt ?? 0) < Date.now()) && String(body.otp ?? "") !== "123456") || !body.password || String(body.password).length < 6) makeMockError(400, "Valid OTP and 6-character password required", method, path);
    user.password = body.password;
    user.updatedAt = mockNow();
    saveMockState(state);
    return ok({ message: genericForgotMessage, user: publicUser(user) });
  }
  if (path === "/api/auth/logout" && method === "POST") {
    if (token && state.sessions?.[token]) {
      delete state.sessions[token];
      saveMockState(state);
    }
    return ok({ message: "Logged out successfully" });
  }
  if (path === "/api/auth/me") {
    const user = requireUser();
    if (method === "PATCH") {
      Object.assign(user, body, { updatedAt: mockNow() });
      saveMockState(state);
    }
    return ok(publicUser(user));
  }
  if (path === "/api/notifications/push-token" && method === "POST") {
    const user = requireUser();
    state.pushTokens = state.pushTokens ?? {};
    state.pushTokens[String(user.id)] = Array.from(new Set([...(state.pushTokens[String(user.id)] ?? []), String(body.token ?? "")].filter(Boolean)));
    saveMockState(state);
    return ok({ message: "Push token registered" });
  }

  if (path === "/api/public/service-zones") {
    const type = url.searchParams.get("type") === "rider" ? "rider" : "seller";
    const lat = Number(url.searchParams.get("lat") ?? "");
    const lng = Number(url.searchParams.get("lng") ?? "");
    return ok({ items: eligiblePublicZones(state, type, lat, lng) });
  }
  const publicZoneValidateMatch = path.match(/^\/api\/public\/service-zones\/(\d+)\/validate$/);
  if (publicZoneValidateMatch) {
    const type = url.searchParams.get("type") === "rider" ? "rider" : "seller";
    const lat = Number(url.searchParams.get("lat") ?? "");
    const lng = Number(url.searchParams.get("lng") ?? "");
    const zone = eligiblePublicZones(state, type, lat, lng).find((item: MockRecord) => Number(item.id) === Number(publicZoneValidateMatch[1]));
    if (!zone) return ok({ serviceable: false, error: "Please select an active service zone." });
    return ok({ serviceable: Boolean(zone.insideServiceZone), zone, error: zone.insideServiceZone ? undefined : type === "seller" ? "Your shop location is outside the selected service zone." : "Your current location is outside the selected service zone." });
  }
  if (path === "/api/service-zones") return ok((state as MockRecord).serviceZones ?? []);
  if (path === "/api/service-zones/resolve") {
    const lat = Number(url.searchParams.get("lat") ?? body.lat);
    const lng = Number(url.searchParams.get("lng") ?? body.lng);
    const zone = resolveServiceZone(state, lat, lng);
    if (!zone) return ok({ serviceable: false, message: "This address is outside our current delivery area." });
    return ok({
      serviceable: Boolean(zone.serviceable),
      zone,
      message: zone.serviceable ? `Delivering in ${zone.zoneName}` : "This address is outside our current delivery area.",
      nearestDistanceKm: Number(zone.distanceKm).toFixed(2),
      maxDistanceKm: Number(zone.radiusMeters ?? 5000) / 1000,
    });
  }

  if (path === "/api/categories") {
    return ok([...state.categories]
      .filter((category: MockRecord) => category.isActive !== false)
      .sort((a: MockRecord, b: MockRecord) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? ""))));
  }
  if (path === "/api/stores") {
    const limit = Number(url.searchParams.get("limit") ?? state.stores.length);
    const lat = Number(url.searchParams.get("lat") ?? "");
    const lng = Number(url.searchParams.get("lng") ?? "");
    const zoneId = Number(url.searchParams.get("zoneId") ?? 0);
    let stores = [...state.stores].filter((store: MockRecord) => store.approvalStatus !== "rejected");
    if (zoneId) stores = stores.filter((store: MockRecord) => Number(store.zoneId) === zoneId);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const zone = resolveServiceZone(state, lat, lng);
      stores = stores
        .map((store: MockRecord) => ({ ...store, distanceKm: Number(mockDistanceKm(lat, lng, Number(store.lat), Number(store.lng)).toFixed(2)), zoneServiceable: zone?.serviceable ?? false }))
        .filter((store: MockRecord) => Number(store.distanceKm) <= Number(store.serviceRadiusMeters ?? 5000) / 1000 && sellerIsActive(state, store));
    }
    return ok(stores.slice(0, Math.min(limit, 40)));
  }
  const storeMatch = path.match(/^\/api\/stores\/(\d+)$/);
  if (storeMatch) {
    const store = state.stores.find((item: MockRecord) => item.id === Number(storeMatch[1]));
    if (!store) makeMockError(404, "Store not found", method, path);
    return ok({ ...store, products: state.products.filter((item: MockRecord) => item.storeId === store.id) });
  }

  if (path === "/api/products") {
    let items = [...state.products];
    const q = url.searchParams.get("q")?.toLowerCase();
    const categoryId = Number(url.searchParams.get("categoryId") || 0);
    const storeId = Number(url.searchParams.get("storeId") || 0);
    const featured = url.searchParams.get("featured");
    const minPrice = Number(url.searchParams.get("minPrice") ?? url.searchParams.get("priceMin") ?? "");
    const maxPrice = Number(url.searchParams.get("maxPrice") ?? url.searchParams.get("priceMax") ?? "");
    const minRating = Number(url.searchParams.get("rating") ?? url.searchParams.get("minRating") ?? "");
    const minDiscount = Number(url.searchParams.get("discount") ?? url.searchParams.get("minDiscount") ?? "");
    const brand = String(url.searchParams.get("brand") ?? "").trim().toLowerCase();
    const inStock = url.searchParams.get("inStock") === "true";
    const customerLat = Number(url.searchParams.get("lat") ?? "");
    const customerLng = Number(url.searchParams.get("lng") ?? "");
    const radiusKm = Math.min(8, Number(url.searchParams.get("radiusKm") ?? url.searchParams.get("distance") ?? "5"));
    const zoneId = Number(url.searchParams.get("zoneId") ?? 0);
    const sort = url.searchParams.get("sort") ?? url.searchParams.get("sortBy") ?? "popular";
    if (q) {
      const aliases: Record<string, string[]> = {
        sugar: ["suger", "chini"],
        vegetable: ["sabji", "sobji", "vegitable", "sabzi"],
        potato: ["alu", "aloo"],
        onion: ["peyaj", "pyaj"],
        milk: ["dudh", "doodh"],
        chappal: ["chapal", "sandal"],
        mobile: ["mobail", "phone"],
      };
      const relatedTerms = [q, ...(Object.entries(aliases).find(([term, values]) => term === q || values.includes(q))?.flat() ?? [])]
        .map((term) => term.toLowerCase());
      items = items.filter((item: MockRecord) => {
        const category = state.categories.find((cat: MockRecord) => cat.id === item.categoryId);
        const store = state.stores.find((storeItem: MockRecord) => storeItem.id === item.storeId);
        const haystack = [
          item.name,
          item.description,
          item.brandName,
          item.brand?.name,
          item.unit,
          category?.name,
          store?.name,
          store?.address,
        ].filter(Boolean).join(" ").toLowerCase();
        return relatedTerms.some((term) => haystack.includes(term));
      });
    }
    if (categoryId) items = items.filter((item: MockRecord) => item.categoryId === categoryId);
    if (storeId) items = items.filter((item: MockRecord) => item.storeId === storeId);
    if (zoneId) items = items.filter((item: MockRecord) => Number(item.zoneId) === zoneId);
    if (featured === "true") items = items.filter((item: MockRecord) => item.isFeatured);
    if (Number.isFinite(minPrice)) items = items.filter((item: MockRecord) => Number(item.price ?? 0) >= minPrice);
    if (Number.isFinite(maxPrice)) items = items.filter((item: MockRecord) => Number(item.price ?? 0) <= maxPrice);
    if (Number.isFinite(minRating)) items = items.filter((item: MockRecord) => Number(item.rating ?? 0) >= minRating);
    if (Number.isFinite(minDiscount)) items = items.filter((item: MockRecord) => Number(item.discountPercent ?? 0) >= minDiscount);
    if (brand && brand !== "all") {
      items = items.filter((item: MockRecord) => String(item.brandName ?? item.brand?.name ?? "").toLowerCase() === brand);
    }
    if (inStock) items = items.filter((item: MockRecord) => Number(item.stock ?? item.stockQty ?? 0) > 0 && item.isAvailable !== false);
    if (Number.isFinite(customerLat) && Number.isFinite(customerLng) && Number.isFinite(radiusKm)) {
      items = items
        .map((item: MockRecord) => {
          const store = state.stores.find((storeItem: MockRecord) => storeItem.id === item.storeId);
          const distanceKm = store ? mockDistanceKm(customerLat, customerLng, Number(store.lat), Number(store.lng)) : Number.POSITIVE_INFINITY;
          return { ...item, distanceKm: Number(distanceKm.toFixed(2)), store };
        })
        .filter((item: MockRecord) => Number(item.distanceKm) <= radiusKm && sellerIsActive(state, item.store));
    }
    if (sort === "price_asc") items.sort((a: MockRecord, b: MockRecord) => Number(a.price) - Number(b.price));
    if (sort === "price_desc") items.sort((a: MockRecord, b: MockRecord) => Number(b.price) - Number(a.price));
    if (sort === "discount") items.sort((a: MockRecord, b: MockRecord) => Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0));
    if (sort === "fastest") items.sort((a: MockRecord, b: MockRecord) => Number(a.store?.estimatedDeliveryMins ?? 40) - Number(b.store?.estimatedDeliveryMins ?? 40));
    if (sort === "nearest") items.sort((a: MockRecord, b: MockRecord) => Number(a.distanceKm ?? 999) - Number(b.distanceKm ?? 999));
    if (sort === "rating" || sort === "popular") items.sort((a: MockRecord, b: MockRecord) => Number(b.rating) - Number(a.rating));
    if (sort === "newest") items.sort((a: MockRecord, b: MockRecord) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    const total = items.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.max(1, Math.min(40, Number(url.searchParams.get("limit") ?? 40)));
    const customerZone = Number.isFinite(customerLat) && Number.isFinite(customerLng) ? resolveServiceZone(state, customerLat, customerLng) : null;
    return ok({
      items: items.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
      pageSize: limit,
      zone: customerZone ? { id: customerZone.id, zoneCode: customerZone.zoneCode, zoneName: customerZone.zoneName, serviceable: customerZone.serviceable } : null,
    });
  }
  const productRelatedMatch = path.match(/^\/api\/products\/(\d+)\/related$/);
  if (productRelatedMatch) {
    const productId = Number(productRelatedMatch[1]);
    const current = state.products.find((item: MockRecord) => item.id === productId);
    if (!current) makeMockError(404, "Product not found", method, path);
    const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") ?? 16)));
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0));
    const excluded = new Set([productId, ...String(url.searchParams.get("excludeIds") ?? "").split(",").map((item) => Number(item)).filter(Boolean)]);
    const customerLat = Number(url.searchParams.get("lat") ?? "");
    const customerLng = Number(url.searchParams.get("lng") ?? "");
    const radiusKm = Math.min(8, Number(url.searchParams.get("radiusKm") ?? "5"));
    const currentPrice = Number(current.price ?? 0);
    const currentTags = Array.isArray(current.tags) ? current.tags.map((item: unknown) => String(item).toLowerCase()) : [];
    const ranked = state.products
      .filter((product: MockRecord) => !excluded.has(Number(product.id)) && product.isAvailable !== false && Number(product.stock ?? product.stockQty ?? 0) > 0)
      .map((product: MockRecord) => {
        const enriched = productWithStore(state, product);
        const distanceKm = Number.isFinite(customerLat) && Number.isFinite(customerLng) && enriched.store
          ? mockDistanceKm(customerLat, customerLng, Number(enriched.store.lat), Number(enriched.store.lng))
          : 0;
        const tags = Array.isArray(product.tags) ? product.tags.map((item: unknown) => String(item).toLowerCase()) : [];
        const tagMatches = tags.filter((tag: string) => currentTags.includes(tag)).length;
        const similarPrice = currentPrice > 0 ? Math.max(0, 1 - Math.abs(Number(product.price ?? 0) - currentPrice) / currentPrice) : 0;
        const score =
          (product.categoryId === current.categoryId ? 60 : 0) +
          (product.brandId && product.brandId === current.brandId ? 25 : 0) +
          tagMatches * 12 +
          similarPrice * 20 +
          Number(product.rating ?? 0) * 4 +
          (Number(product.stock ?? 0) > 10 ? 6 : 0) +
          (Number(enriched.store?.estimatedDeliveryMins ?? 40) <= 40 ? 8 : 0) -
          (Number.isFinite(distanceKm) ? Math.min(distanceKm, 20) : 0);
        return {
          ...enriched,
          shopName: enriched.store?.name,
          shopRating: enriched.store?.rating,
          deliveryEtaMins: enriched.store?.estimatedDeliveryMins ?? 40,
          distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : undefined,
          _score: score,
        };
      })
      .filter((product: MockRecord) => {
        if (!sellerIsActive(state, product.store)) return false;
        if (Number.isFinite(customerLat) && Number.isFinite(customerLng)) return Number(product.distanceKm ?? 999) <= radiusKm;
        return true;
      })
      .sort((a: MockRecord, b: MockRecord) => Number(b._score) - Number(a._score) || Number(b.rating ?? 0) - Number(a.rating ?? 0));
    const unique = Array.from(new Map(ranked.map((item: MockRecord) => [item.id, item])).values());
    const items = unique.slice(cursor, cursor + limit).map(({ _score, ...item }: MockRecord) => item);
    const nextCursor = cursor + limit < unique.length ? String(cursor + limit) : null;
    return ok({ items, nextCursor, hasMore: Boolean(nextCursor) });
  }
  const productReviewMatch = path.match(/^\/api\/products\/(\d+)\/reviews$/);
  if (productReviewMatch) return ok(state.reviews.filter((item: MockRecord) => item.productId === Number(productReviewMatch[1])));
  const productMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const product = state.products.find((item: MockRecord) => item.id === Number(productMatch[1]));
    if (!product) makeMockError(404, "Product not found", method, path);
    return ok(productWithStore(state, product));
  }

  if (path === "/api/search/suggestions") {
    const q = String(url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(12, Number(url.searchParams.get("limit") ?? 8));
    if (!q) return ok({ items: [] });
    const items = state.products
      .filter((product: MockRecord) => product.isAvailable !== false && Number(product.stock ?? product.stockQty ?? 0) > 0)
      .map((product: MockRecord) => {
        const enriched = productWithStore(state, product);
        const name = String(product.name ?? "").toLowerCase();
        const category = String(enriched.category?.name ?? "").toLowerCase();
        const shop = String(enriched.store?.name ?? "").toLowerCase();
        const score = name === q ? 100 : name.startsWith(q) ? 90 : category.startsWith(q) ? 75 : shop.startsWith(q) ? 65 : name.includes(q) ? 55 : 0;
        return {
          id: product.id,
          productId: product.id,
          name: product.name,
          imageUrl: product.images?.[0],
          brand: product.brandName ?? product.specifications?.Brand ?? "",
          unit: product.unit ?? product.weight ?? "",
          price: product.price,
          mrp: product.mrp,
          discountPercent: product.discountPercent,
          shopName: enriched.store?.name,
          etaMins: enriched.store?.estimatedDeliveryMins ?? 40,
          inStock: Number(product.stock ?? product.stockQty ?? 0) > 0,
          category: enriched.category?.name ?? "",
          score,
        };
      })
      .filter((item: MockRecord) => item.score > 0)
      .sort((a: MockRecord, b: MockRecord) => Number(b.score) - Number(a.score))
      .slice(0, limit);
    return ok({ items });
  }

  if (path === "/api/payments/razorpay/order" && method === "POST") {
    requireUser();
    makeMockError(503, "Razorpay backend is not configured in mock mode. Add real backend Razorpay keys to .env and run the API server.", method, path);
  }
  if (path === "/api/payments/razorpay/verify" && method === "POST") {
    requireUser();
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) makeMockError(400, "Razorpay payment response is incomplete", method, path);
    return ok({ verified: true, paymentId: Date.now(), providerPaymentId: body.razorpay_payment_id });
  }

  if (path === "/api/homepage") {
    ensureHomepageState(state);
    const zoneId = Number(url.searchParams.get("zoneId") ?? 0);
    const sections = state.homepageSections
      .filter((section: MockRecord) => section.isActive !== false)
      .filter(homepageScheduled)
      .filter((section: MockRecord) => !zoneId || !section.zoneId || Number(section.zoneId) === zoneId)
      .sort((a: MockRecord, b: MockRecord) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((section: MockRecord) => ({
        id: section.slug,
        databaseId: section.id,
        title: section.title,
        subtitle: section.subtitle,
        layout: section.layoutType,
        sectionType: section.sectionType,
        zoneId: section.zoneId,
        products: buildHomepageSectionProducts(state, section, zoneId),
      }));
    return ok({ sections });
  }

  if (path.startsWith("/api/admin/") || path === "/api/admin/dashboard") {
    requireAdmin();
  }

  if (path === "/api/admin/homepage/permissions") {
    return ok({
      roles: ["SUPER_ADMIN", "PLATFORM_ADMIN", "CONTENT_ADMIN", "ZONE_ADMIN"],
      permissions: ["homepage.view", "homepage.create_section", "homepage.edit_section", "homepage.delete_section", "homepage.add_product", "homepage.remove_product", "homepage.reorder_product", "homepage.publish", "homepage.schedule", "homepage.manage_zone_content"],
    });
  }
  if (path === "/api/admin/homepage/sections") {
    ensureHomepageState(state);
    if (method === "POST") {
      const id = Math.max(0, ...state.homepageSections.map((item: MockRecord) => Number(item.id) || 0)) + 1;
      const section = {
        id,
        title: body.title,
        slug: String(body.slug ?? body.internalName ?? body.title ?? `section-${id}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        subtitle: body.subtitle ?? "",
        sectionType: body.sectionType ?? "MANUAL",
        layoutType: body.layoutType ?? "horizontal_product_scroll",
        icon: body.icon ?? "",
        bannerImageUrl: body.bannerImageUrl ?? "",
        productLimit: Number(body.productLimit ?? 8),
        zoneId: body.zoneId ? Number(body.zoneId) : null,
        cityId: body.cityId ? Number(body.cityId) : null,
        isActive: body.isActive ?? true,
        personalizedEnabled: body.personalizedEnabled ?? false,
        sortOrder: Number(body.sortOrder ?? state.homepageSections.length + 1),
        startAt: body.startAt || null,
        endAt: body.endAt || null,
        createdByAdminId: currentUser?.id,
        updatedByAdminId: currentUser?.id,
        createdAt: mockNow(),
        updatedAt: mockNow(),
      };
      state.homepageSections.push(section);
      homepageAudit(state, currentUser!, "Section created", { sectionId: id, newValue: section });
      saveMockState(state);
      return ok(section);
    }
    return ok([...state.homepageSections].sort((a: MockRecord, b: MockRecord) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)));
  }
  const adminHomepageSectionMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)$/);
  if (adminHomepageSectionMatch) {
    ensureHomepageState(state);
    const section = state.homepageSections.find((item: MockRecord) => Number(item.id) === Number(adminHomepageSectionMatch[1]));
    if (!section) makeMockError(404, "Section not found", method, path);
    if (method === "DELETE") {
      state.homepageSections = state.homepageSections.filter((item: MockRecord) => item.id !== section.id);
      state.homepageSectionProducts = state.homepageSectionProducts.filter((item: MockRecord) => item.sectionId !== section.id);
      if (state.homepageRemovedProducts) delete state.homepageRemovedProducts[String(section.id)];
      homepageAudit(state, currentUser!, "Section deleted", { sectionId: section.id });
      saveMockState(state);
      return ok({ message: "Section deleted" });
    }
    if (method === "PATCH") {
      const oldValue = { ...section };
      Object.assign(section, body, {
        productLimit: Number(body.productLimit ?? section.productLimit ?? 8),
        sortOrder: Number(body.sortOrder ?? section.sortOrder ?? 0),
        zoneId: body.zoneId === "" ? null : body.zoneId !== undefined ? Number(body.zoneId) : section.zoneId,
        updatedByAdminId: currentUser?.id,
        updatedAt: mockNow(),
      });
      homepageAudit(state, currentUser!, "Section edited", { sectionId: section.id, oldValue, newValue: section });
      saveMockState(state);
      return ok(section);
    }
  }
  if (path === "/api/admin/homepage/products/search") {
    ensureHomepageState(state);
    const q = String(url.searchParams.get("q") ?? "").toLowerCase();
    const categoryId = Number(url.searchParams.get("categoryId") ?? 0);
    const items = state.products
      .filter((product: MockRecord) => homepageProductEligible(state, product))
      .filter((product: MockRecord) => !q || String(product.name ?? "").toLowerCase().includes(q) || String(product.sku ?? "").toLowerCase().includes(q) || String(product.brandName ?? "").toLowerCase().includes(q))
      .filter((product: MockRecord) => !categoryId || Number(product.categoryId) === categoryId)
      .slice(0, 40)
      .map((product: MockRecord) => productWithStore(state, product));
    return ok(items);
  }
  const adminHomepageAddProductMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)\/products$/);
  if (adminHomepageAddProductMatch && method === "POST") {
    ensureHomepageState(state);
    const section = state.homepageSections.find((item: MockRecord) => Number(item.id) === Number(adminHomepageAddProductMatch[1]));
    const product = state.products.find((item: MockRecord) => Number(item.id) === Number(body.productId));
    if (!section || !product) makeMockError(404, "Section or product not found", method, path);
    if (!homepageProductEligible(state, product)) makeMockError(400, "Only approved, active, in-stock products from active approved shops can be curated.", method, path);
    if (!sectionAllowsProduct(state, section, product)) makeMockError(400, `${section.title} does not accept this product category.`, method, path);
    const item = {
      id: Math.max(0, ...state.homepageSectionProducts.map((row: MockRecord) => Number(row.id) || 0)) + 1,
      sectionId: section.id,
      productId: product.id,
      shopProductId: body.shopProductId ?? null,
      zoneId: body.zoneId ? Number(body.zoneId) : null,
      priority: Number(body.priority ?? state.homepageSectionProducts.length + 1),
      isPinned: body.isPinned ?? false,
      startAt: body.startAt || null,
      endAt: body.endAt || null,
      addedByAdminId: currentUser?.id,
      createdAt: mockNow(),
      updatedAt: mockNow(),
    };
    state.homepageRemovedProducts = state.homepageRemovedProducts ?? {};
    state.homepageRemovedProducts[String(section.id)] = (state.homepageRemovedProducts[String(section.id)] ?? []).filter((id: unknown) => Number(id) !== Number(product.id));
    state.homepageSectionProducts.push(item);
    homepageAudit(state, currentUser!, "Product added", { sectionId: section.id, productId: product.id, newValue: item });
    saveMockState(state);
    return ok(item);
  }
  const adminHomepageRemoveProductMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)\/products\/(\d+)$/);
  if (adminHomepageRemoveProductMatch && method === "DELETE") {
    ensureHomepageState(state);
    const sectionId = Number(adminHomepageRemoveProductMatch[1]);
    const productId = Number(adminHomepageRemoveProductMatch[2]);
    const row = state.homepageSectionProducts.find((item: MockRecord) => Number(item.sectionId) === sectionId && Number(item.id) === productId);
    const resolvedProductId = Number(row?.productId ?? productId);
    state.homepageSectionProducts = state.homepageSectionProducts.filter((item: MockRecord) => !(Number(item.sectionId) === sectionId && (Number(item.productId) === resolvedProductId || Number(item.id) === productId)));
    state.homepageRemovedProducts = state.homepageRemovedProducts ?? {};
    state.homepageRemovedProducts[String(sectionId)] = Array.from(new Set([
      ...(state.homepageRemovedProducts[String(sectionId)] ?? []).map((id: unknown) => Number(id)),
      resolvedProductId,
    ].filter((id: number) => Number.isFinite(id) && id > 0)));
    homepageAudit(state, currentUser!, "Product removed", { sectionId, productId: resolvedProductId });
    saveMockState(state);
    return ok({ message: "Product removed" });
  }
  const adminHomepageReorderMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)\/reorder$/);
  if (adminHomepageReorderMatch && method === "PATCH") {
    ensureHomepageState(state);
    const sectionId = Number(adminHomepageReorderMatch[1]);
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const target = state.homepageSectionProducts.find((row: MockRecord) => Number(row.sectionId) === sectionId && Number(row.productId) === Number(item.productId));
      if (target) Object.assign(target, { priority: Number(item.priority ?? target.priority ?? 0), isPinned: item.isPinned ?? target.isPinned, updatedAt: mockNow() });
    }
    homepageAudit(state, currentUser!, "Product reordered", { sectionId, newValue: body.items ?? [] });
    saveMockState(state);
    return ok({ message: "Section order updated" });
  }
  const adminHomepagePublishMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)\/publish$/);
  if (adminHomepagePublishMatch && method === "POST") {
    ensureHomepageState(state);
    const section = state.homepageSections.find((item: MockRecord) => Number(item.id) === Number(adminHomepagePublishMatch[1]));
    if (!section) makeMockError(404, "Section not found", method, path);
    Object.assign(section, { isActive: true, startAt: null, endAt: null, updatedAt: mockNow() });
    homepageAudit(state, currentUser!, "Section published", { sectionId: section.id, newValue: section });
    saveMockState(state);
    return ok(section);
  }
  const adminHomepageScheduleMatch = path.match(/^\/api\/admin\/homepage\/sections\/(\d+)\/schedule$/);
  if (adminHomepageScheduleMatch && method === "POST") {
    ensureHomepageState(state);
    const section = state.homepageSections.find((item: MockRecord) => Number(item.id) === Number(adminHomepageScheduleMatch[1]));
    if (!section) makeMockError(404, "Section not found", method, path);
    Object.assign(section, { startAt: body.startAt || null, endAt: body.endAt || null, updatedAt: mockNow() });
    homepageAudit(state, currentUser!, "Section scheduled", { sectionId: section.id, newValue: section });
    saveMockState(state);
    return ok(section);
  }
  if (path === "/api/admin/homepage/preview") {
    ensureHomepageState(state);
    const zoneId = Number(url.searchParams.get("zoneId") ?? 0);
    const sections = state.homepageSections
      .filter((section: MockRecord) => section.isActive !== false)
      .map((section: MockRecord) => ({ ...section, products: buildHomepageSectionProducts(state, section, zoneId) }));
    return ok({ viewport: url.searchParams.get("viewport") ?? "mobile", zoneId: zoneId || null, sections });
  }
  if (path === "/api/admin/homepage/audit") {
    ensureHomepageState(state);
    return ok(state.homepageAuditLog);
  }

  if (path === "/api/cart") {
    const user = requireUser();
    if (method === "DELETE") {
      state.carts[String(user.id)] = [];
      saveMockState(state);
      return ok({ message: "Cart cleared" });
    }
    return ok(buildCart(state, user.id));
  }
  if (path === "/api/cart/items" && method === "POST") {
    const user = requireUser();
    const product = state.products.find((item: MockRecord) => item.id === Number(body.productId));
    if (!product) makeMockError(404, "Product not found", method, path);
    const requestedQty = Number(body.qty ?? 1);
    if (requestedQty > 0) ensureProductOrderable(state, product, method, path);
    const optionSelection = requestedQty > 0 ? validateProductOptions(product, body, method, path) : {
      selectedSize: String(body.selectedSize ?? body.size ?? "").trim() || null,
      selectedColor: String(body.selectedColor ?? body.color ?? "").trim() || null,
      imageUrl: null,
    };
    const key = String(user.id);
    const current = state.carts[key] ?? [];
    const sameStore = current.filter((item: MockRecord) => state.products.find((productItem: MockRecord) => productItem.id === item.productId)?.storeId === product.storeId);
    const existing = sameStore.find((item: MockRecord) =>
      item.productId === product.id
      && String(item.selectedSize ?? "") === String(optionSelection.selectedSize ?? "")
      && String(item.selectedColor ?? "") === String(optionSelection.selectedColor ?? "")
    );
    if (existing) {
      existing.qty = Math.max(0, requestedQty);
      existing.imageUrl = optionSelection.imageUrl ?? existing.imageUrl;
      if (existing.qty === 0) sameStore.splice(sameStore.indexOf(existing), 1);
    } else if (requestedQty > 0) {
      sameStore.push({ id: state.nextIds.cartItem++, productId: product.id, qty: requestedQty, price: product.price, ...optionSelection });
    }
    state.carts[key] = sameStore;
    saveMockState(state);
    return ok(buildCart(state, user.id));
  }
  const cartItemMatch = path.match(/^\/api\/cart\/items\/(\d+)$/);
  if (cartItemMatch) {
    const user = requireUser();
    const key = String(user.id);
    const itemId = Number(cartItemMatch[1]);
    const items = state.carts[key] ?? [];
    if (method === "DELETE") state.carts[key] = items.filter((item: MockRecord) => item.id !== itemId);
    if (method === "PATCH") {
      const item = items.find((entry: MockRecord) => entry.id === itemId);
      if (item) item.qty = Number(body.qty ?? item.qty);
      state.carts[key] = items.filter((entry: MockRecord) => entry.qty > 0);
    }
    saveMockState(state);
    return ok(buildCart(state, user.id));
  }

  if (path === "/api/wishlist") {
    const user = requireUser();
    const key = String(user.id);
    if (method === "POST") {
      state.wishlist[key] = Array.from(new Set([...(state.wishlist[key] ?? []), Number(body.productId)]));
      saveMockState(state);
      return ok({ message: "Added to wishlist" });
    }
    return ok((state.wishlist[key] ?? []).map((productId: number, index: number) => ({ id: index + 1, userId: user.id, productId, product: state.products.find((item: MockRecord) => item.id === productId) })));
  }
  const wishlistMatch = path.match(/^\/api\/wishlist\/(\d+)$/);
  if (wishlistMatch) {
    const user = requireUser();
    const key = String(user.id);
    state.wishlist[key] = (state.wishlist[key] ?? []).filter((id: number) => id !== Number(wishlistMatch[1]));
    saveMockState(state);
    return ok({ message: "Removed from wishlist" });
  }

  if (path === "/api/addresses") {
    const user = requireUser();
    const key = String(user.id);
    if (method === "POST") {
      const address = { id: state.nextIds.address++, userId: user.id, isDefault: !(state.addresses[key] ?? []).length, ...body };
      state.addresses[key] = [...(state.addresses[key] ?? []), address];
      saveMockState(state);
      return ok(address);
    }
    return ok(state.addresses[key] ?? []);
  }
  const addressMatch = path.match(/^\/api\/addresses\/(\d+)$/);
  if (addressMatch) {
    const user = requireUser();
    const key = String(user.id);
    const list = state.addresses[key] ?? [];
    const id = Number(addressMatch[1]);
    if (method === "DELETE") {
      state.addresses[key] = list.filter((item: MockRecord) => item.id !== id);
      saveMockState(state);
      return ok({ message: "Address deleted" });
    }
    const address = list.find((item: MockRecord) => item.id === id);
    if (!address) makeMockError(404, "Address not found", method, path);
    Object.assign(address, body);
    saveMockState(state);
    return ok(address);
  }

  if (path === "/api/orders") {
    const user = requireUser();
    if (method === "POST") {
      const cart = buildCart(state, user.id);
      if (!cart.items.length) makeMockError(400, "Cart is empty", method, path);
      if (!cart.store) makeMockError(400, "Store not found for cart item. Remove the item and add it again.", method, path);
      if (!sellerIsActive(state, cart.store)) makeMockError(400, "Seller is not active", method, path);
      cart.items.forEach((item: MockRecord) => {
        ensureProductOrderable(state, item.product, method, path);
        if (Number(item.product.stock ?? item.product.stockQty ?? 0) < Number(item.qty ?? 1)) {
          makeMockError(400, `Only ${item.product.stock ?? 0} unit available for ${item.product.name}`, method, path);
        }
      });
      const addressKey = String(user.id);
      state.addresses[addressKey] = state.addresses[addressKey] ?? [];
      let address = state.addresses[addressKey].find((item: MockRecord) => item.id === Number(body.addressId));
      if (!address) {
        address = state.addresses[addressKey].find((item: MockRecord) => item.isDefault) ?? state.addresses[addressKey][0];
      }
      if (!address) {
        address = {
          id: state.nextIds.address++,
          userId: user.id,
          label: "home",
          name: user.name || "Customer",
          phone: user.phone || "9999999999",
          line1: "Current delivery location",
          line2: "",
          city: cart.store.city ?? "Kolkata",
          state: cart.store.state ?? "West Bengal",
          pincode: cart.store.pincode ?? "700156",
          lat: Number(cart.store.lat ?? 22.5726) + 0.01,
          lng: Number(cart.store.lng ?? 88.3639) + 0.01,
          isDefault: true,
          createdAt: mockNow(),
        };
        state.addresses[addressKey].push(address);
      }
      const customerZone = resolveServiceZone(state, Number(address.lat), Number(address.lng));
      if (!customerZone?.serviceable) {
        makeMockError(400, "This address is outside our current delivery area.", method, path);
      }
      if (cart.store?.zoneId && Number(cart.store.zoneId) !== Number(customerZone.id)) {
        makeMockError(400, "Your cart store is outside the selected delivery zone. Please switch to a nearby store.", method, path);
      }
      const storeDistanceKm = mockDistanceKm(Number(address.lat), Number(address.lng), Number(cart.store.lat), Number(cart.store.lng));
      if (storeDistanceKm > Number(cart.store.serviceRadiusMeters ?? customerZone.maximumDeliveryDistance ?? 5000) / 1000) {
        makeMockError(400, "Selected store is outside the 5 km delivery coverage for this address.", method, path);
      }
      const paymentMethod = ["cod", "upi", "wallet", "online"].includes(String(body.paymentMethod)) ? String(body.paymentMethod) : "cod";
      const coupon = state.coupons.find((item: MockRecord) => item.code === String(body.couponCode ?? "").toUpperCase());
      const subtotal = Number(cart.subtotal);
      const deliveryFee = Number(cart.deliveryFee);
      const discount = couponDiscount(coupon, subtotal);
      const walletUsed = body.useWallet ? Math.min(Number(user.walletBalance ?? 0), subtotal + deliveryFee - discount) : 0;
      user.walletBalance = (Number(user.walletBalance ?? 0) - walletUsed).toFixed(2);
      const orderId = state.nextIds.order++;
      const orderNumber = `LCH${Date.now().toString().slice(-7)}`;
      const invoiceNumber = sellerInvoiceNumber(state, cart.store);
      const pickupOtp = generateOrderOtp(orderId, 431);
      const deliveryOtp = generateOrderOtp(orderId, 0);
      const order = {
        id: orderId,
        orderNumber,
        sellerOrderId: `${orderNumber}-S${cart.storeId}`,
        invoiceNumber,
        userId: user.id,
        storeId: cart.storeId,
        zoneId: customerZone.id,
        serviceZoneSnapshot: { id: customerZone.id, zoneCode: customerZone.zoneCode, zoneName: customerZone.zoneName, radiusMeters: customerZone.radiusMeters },
        store: cart.store,
        addressId: address.id,
        address,
        addressSnapshot: address,
        items: cart.items.map((item: MockRecord, index: number) => {
          const product = item.product;
          const quantity = Number(item.qty ?? 1);
          const sellingPrice = Number(item.price ?? product.price ?? 0);
          const mrp = Number(product.mrp ?? sellingPrice);
          const itemTotal = sellingPrice * quantity;
          const discountAmount = Math.max(0, (mrp - sellingPrice) * quantity);
          return {
            id: item.id,
            orderItemId: `${orderId}-${index + 1}`,
            orderId,
            productId: item.productId,
            sellerId: cart.store?.ownerId ?? null,
            shopId: cart.storeId,
            name: product.name,
            productName: product.name,
            imageUrl: item.imageUrl ?? product.images?.[0],
            productImage: item.imageUrl ?? product.images?.[0],
            brandName: product.brandName ?? product.brand?.name ?? "Chowdhary Mart",
            sku: product.sku ?? `SKU-${product.id}`,
            barcode: product.barcode ?? `CM${String(product.id).padStart(6, "0")}`,
            variantId: item.variantId ?? null,
            variantName: item.selectedSize || item.selectedColor ? [item.selectedSize, item.selectedColor].filter(Boolean).join(" / ") : product.weight || product.unit || "",
            size: item.selectedSize ?? null,
            colour: item.selectedColor ?? null,
            color: item.selectedColor ?? null,
            weight: product.weight ?? "",
            flavour: product.flavour ?? "",
            packSize: product.packSize ?? product.weight ?? "",
            unit: product.unit ?? "",
            qty: quantity,
            quantity,
            mrp: mrp.toFixed(2),
            price: sellingPrice.toFixed(2),
            sellingPrice: sellingPrice.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            taxAmount: "0.00",
            itemTotal: itemTotal.toFixed(2),
            total: itemTotal.toFixed(2),
            customerNote: item.customerNote ?? body.notes ?? "",
            replacementPreference: item.replacementPreference ?? "Call before replacing",
            itemStatus: "ordered",
            stockAvailableAtOrder: Number(product.stock ?? product.stockQty ?? 0),
          };
        }),
        status: "pending",
        paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
        subtotal: subtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        couponCode: coupon?.code ?? null,
        couponDiscount: discount.toFixed(2),
        walletUsed: walletUsed.toFixed(2),
        total: Math.max(0, subtotal + deliveryFee - discount - walletUsed).toFixed(2),
        loyaltyPointsEarned: Math.floor(subtotal / 10),
        estimatedDeliveryMins: 40,
        sellerPaidAt: null as string | null,
        adminCommission: "0.00",
        sellerPayout: "0.00",
        createdAt: mockNow(),
        tracking: {
          orderId: 0,
          status: "pending",
          estimatedMins: null,
          etaStartedAt: null,
          pickupOtp,
          deliveryOtp,
          deliveryPartner: null,
          partnerLocation: { lat: Number(cart.store?.lat ?? 22.5726) + 0.006, lng: Number(cart.store?.lng ?? 88.3639) + 0.004 },
          timeline: [
            { status: "pending", message: "Waiting for seller acceptance", updatedAt: mockNow() },
            { status: "pending", message: "Order placed", updatedAt: mockNow() },
          ],
        },
      };
      cart.items.forEach((item: MockRecord) => {
        item.product.stock = Math.max(0, Number(item.product.stock ?? item.product.stockQty ?? 0) - Number(item.qty ?? 1));
        item.product.stockQty = item.product.stock;
        const mockState = state as MockRecord;
        mockState.inventoryTransactions = mockState.inventoryTransactions ?? [];
        mockState.inventoryTransactions.unshift({
          id: Date.now() + Math.floor(Math.random() * 1000),
          orderId,
          productId: item.productId,
          shopId: cart.storeId,
          type: "RESERVED",
          quantity: Number(item.qty ?? 1),
          createdAt: mockNow(),
        });
      });
      order.tracking.orderId = order.id;
      state.orders.unshift(order);
      state.carts[String(user.id)] = [];
      state.notifications[String(user.id)] = [{ id: Date.now(), title: "Order placed", body: `Order #${order.orderNumber} is waiting for seller acceptance.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(user.id)] ?? [])];
      if (cart.store?.ownerId) {
        state.notifications[String(cart.store.ownerId)] = [{ id: Date.now() + 1, title: "New order received", body: `Order #${order.orderNumber} is waiting for your acceptance.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(cart.store.ownerId)] ?? [])];
        if (body.paymentMethod === "upi") {
          addWalletTransaction(state, adminUserId(state), Number(order.total), `UPI escrow received #${order.orderNumber}`, order.orderNumber);
        }
      }
      saveMockState(state);
      return ok(order);
    }
    return ok(state.orders.filter((order: MockRecord) => currentUser?.role === "admin" || order.userId === user.id));
  }
  const orderCancelMatch = path.match(/^\/api\/orders\/(\d+)\/cancel$/);
  if (orderCancelMatch) {
    const user = requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderCancelMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.userId !== user.id && user.role !== "admin") makeMockError(403, "You can cancel only your own order", method, path);
    cancelOrderWithBusinessRules(state, order, user, body.reason ?? "Cancelled by customer", user.role === "admin" ? "CANCELLED_BY_ADMIN" : "CANCELLED_BY_CUSTOMER");
    saveMockState(state);
    return ok(order);
  }
  const orderReviewMatch = path.match(/^\/api\/orders\/(\d+)\/review$/);
  if (orderReviewMatch) {
    const user = requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderReviewMatch[1]) && item.userId === user.id);
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.status !== "delivered") makeMockError(400, "Review can be submitted only after delivery", method, path);
    const orderedProduct = (order.items ?? []).some((item: MockRecord) => Number(item.productId) === Number(body.productId));
    if (!orderedProduct) makeMockError(400, "You can review only products from this order", method, path);
    const review = { id: state.nextIds.review++, userId: user.id, orderId: Number(orderReviewMatch[1]), isVerifiedPurchase: true, createdAt: mockNow(), user: { name: user.name }, ...body };
    state.reviews.unshift(review);
    saveMockState(state);
    return ok(review);
  }
  if (path === "/api/returns") {
    const user = requireUser();
    state.returns = state.returns ?? [];
    state.nextIds.return = state.nextIds.return ?? (state.returns.length + 1);
    if (method === "POST") {
      const order = state.orders.find((item: MockRecord) => item.id === Number(body.orderId) && item.userId === user.id);
      if (!order) makeMockError(404, "Order not found", method, path);
      const returnReason = String(body.reason ?? "").toLowerCase();
      if (!returnReason.includes("damage") && !returnReason.includes("damaged") && !returnReason.includes("broken") && !returnReason.includes("leaked")) {
        makeMockError(400, "Only damaged items are eligible for return", method, path);
      }
      const product = (order.items ?? []).find((item: MockRecord) => item.productId === Number(body.productId)) ?? order.items?.[0];
      if (!product) makeMockError(400, "Select a product for return", method, path);
      const request = {
        id: state.nextIds.return++,
        userId: user.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        productId: product.productId,
        productName: product.name,
        imageUrl: product.imageUrl,
        reason: body.reason ?? "Return requested",
        details: body.details ?? "",
        status: "requested",
        refundAmount: product.total ?? product.price,
        createdAt: mockNow(),
        timeline: [
          { status: "requested", message: "Return request submitted", updatedAt: mockNow() },
          { status: "pickup_pending", message: "Pickup will be scheduled after approval", updatedAt: mockNow() },
        ],
      };
      state.returns.unshift(request);
      saveMockState(state);
      return ok(request);
    }
    return ok(state.returns.filter((item: MockRecord) => item.userId === user.id));
  }
  const orderTrackingMatch = path.match(/^\/api\/tracking\/(\d+)$/) ?? path.match(/^\/api\/orders\/(\d+)\/tracking$/) ?? path.match(/^\/api\/tracking\/orders\/(\d+)$/);
  if (orderTrackingMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderTrackingMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    return ok(mockTrackingPayload(order, state));
  }
  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    return ok(order);
  }

  if ((path === "/api/coupons" || path === "/api/admin/coupons") && method === "GET") return ok(state.coupons);
  if (path === "/api/coupons/validate" && method === "POST") {
    const coupon = state.coupons.find((item: MockRecord) => item.code === String(body.code ?? "").toUpperCase() && item.isActive);
    if (!coupon) makeMockError(400, "Invalid coupon", method, path);
    const discount = couponDiscount(coupon, Number(body.orderValue ?? body.orderTotal ?? 0));
    if (discount <= 0) makeMockError(400, `Minimum order value is Rs ${coupon.minOrderValue}`, method, path);
    return ok({ valid: true, code: coupon.code, discount: discount.toFixed(2), message: "Coupon applied" });
  }
  if (path === "/api/admin/coupons" && method === "POST") {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) makeMockError(400, "Coupon code must be 3-20 letters/numbers", method, path);
    if (state.coupons.some((item: MockRecord) => String(item.code).toUpperCase() === code)) makeMockError(409, "Coupon code already exists", method, path);
    const discountType = body.discountType === "percent" ? "percent" : "flat";
    const discountValue = Number(body.discountValue ?? 0);
    if (!Number.isFinite(discountValue) || discountValue <= 0) makeMockError(400, "Discount value required", method, path);
    if (discountType === "percent" && discountValue > 100) makeMockError(400, "Percent discount cannot be more than 100", method, path);
    const coupon = {
      id: state.nextIds.coupon++,
      usedCount: 0,
      isActive: true,
      ...body,
      code,
      description: String(body.description ?? `${code} discount`).trim(),
      discountType,
      discountValue: discountValue.toFixed(2),
      minOrderValue: Number(body.minOrderValue ?? 0).toFixed(2),
      maxDiscount: body.maxDiscount !== undefined && body.maxDiscount !== "" ? Number(body.maxDiscount).toFixed(2) : undefined,
      usageLimit: body.usageLimit !== undefined && body.usageLimit !== "" ? Number(body.usageLimit) : undefined,
      perUserLimit: body.perUserLimit !== undefined && body.perUserLimit !== "" ? Number(body.perUserLimit) : undefined,
      isSpecial: Boolean(body.isSpecial),
      createdAt: mockNow(),
    };
    state.coupons.unshift(coupon);
    saveMockState(state);
    return ok(coupon);
  }
  const adminCouponMatch = path.match(/^\/api\/admin\/coupons\/(\d+)$/);
  if (adminCouponMatch) {
    requireUser();
    const coupon = state.coupons.find((item: MockRecord) => item.id === Number(adminCouponMatch[1]));
    if (!coupon) makeMockError(404, "Coupon not found", method, path);
    if (method === "DELETE") {
      state.coupons = state.coupons.filter((item: MockRecord) => item.id !== coupon.id);
      saveMockState(state);
      return ok({ message: "Coupon deleted" });
    }
    if (method === "PATCH") {
      const nextCode = body.code !== undefined ? String(body.code).trim().toUpperCase() : coupon.code;
      if (!/^[A-Z0-9_-]{3,20}$/.test(nextCode)) makeMockError(400, "Coupon code must be 3-20 letters/numbers", method, path);
      if (state.coupons.some((item: MockRecord) => item.id !== coupon.id && String(item.code).toUpperCase() === nextCode)) makeMockError(409, "Coupon code already exists", method, path);
      const nextDiscountType = body.discountType === "percent" ? "percent" : body.discountType === "flat" ? "flat" : coupon.discountType;
      const nextDiscountValue = body.discountValue !== undefined ? Number(body.discountValue) : Number(coupon.discountValue);
      if (!Number.isFinite(nextDiscountValue) || nextDiscountValue <= 0) makeMockError(400, "Discount value required", method, path);
      if (nextDiscountType === "percent" && nextDiscountValue > 100) makeMockError(400, "Percent discount cannot be more than 100", method, path);
      Object.assign(coupon, body, {
        code: nextCode,
        discountType: nextDiscountType,
        discountValue: nextDiscountValue.toFixed(2),
        minOrderValue: body.minOrderValue !== undefined ? Number(body.minOrderValue ?? 0).toFixed(2) : coupon.minOrderValue,
        maxDiscount: body.maxDiscount !== undefined && body.maxDiscount !== "" ? Number(body.maxDiscount).toFixed(2) : body.maxDiscount === "" ? undefined : coupon.maxDiscount,
        usageLimit: body.usageLimit !== undefined && body.usageLimit !== "" ? Number(body.usageLimit) : body.usageLimit === "" ? undefined : coupon.usageLimit,
        perUserLimit: body.perUserLimit !== undefined && body.perUserLimit !== "" ? Number(body.perUserLimit) : body.perUserLimit === "" ? undefined : coupon.perUserLimit,
        updatedAt: mockNow(),
      });
      saveMockState(state);
      return ok(coupon);
    }
  }

  if (path === "/api/wallet") {
    const user = requireUser();
    return ok({ balance: user.walletBalance, loyaltyPoints: user.loyaltyPoints, referralCode: user.referralCode });
  }
  if (path === "/api/wallet/topup" && method === "POST") {
    const user = requireUser();
    const amount = Number(body.amount ?? 0);
    const upiId = String(body.upiId ?? "").trim();
    if (!amount || amount < 1 || amount > 50000) makeMockError(400, "Enter an amount between Rs.1 and Rs.50,000", method, path);
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) makeMockError(400, "Enter a valid UPI ID", method, path);
    const balance = Number(user.walletBalance ?? 0) + amount;
    user.walletBalance = balance.toFixed(2);
    const key = String(user.id);
    state.walletTransactions[key] = state.walletTransactions[key] ?? [];
    const tx = {
      id: Date.now(),
      userId: user.id,
      type: "credit",
      amount: amount.toFixed(2),
      balance: balance.toFixed(2),
      description: `Added money via UPI (${upiId})`,
      referenceId: `UPI-${Date.now()}`,
      referenceType: "wallet_topup",
      createdAt: mockNow(),
    };
    state.walletTransactions[key].unshift(tx);
    saveMockState(state);
    return ok({ balance: balance.toFixed(2), transaction: tx });
  }
  if (path === "/api/wallet/transactions") {
    const user = requireUser();
    return ok(state.walletTransactions[String(user.id)] ?? []);
  }
  if (path === "/api/wallet/withdrawals") {
    const user = requireUser();
    if (method === "POST") {
      const amount = Number(body.amount ?? 0);
      const methodName = String(body.method ?? "upi");
      const upiId = String(body.upiId ?? "").trim();
      const accountNumber = String(body.accountNumber ?? "").trim();
      const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
      const accountName = String(body.accountName ?? user.name ?? "").trim();
      if (!Number.isFinite(amount) || amount < 10) makeMockError(400, "Minimum transfer amount is Rs.10", method, path);
      if (amount > Number(user.walletBalance ?? 0)) makeMockError(400, "Insufficient wallet balance", method, path);
      if (methodName === "upi" && !/^[\w.-]+@[\w.-]+$/.test(upiId)) makeMockError(400, "Enter a valid UPI ID", method, path);
      if (methodName === "bank" && (!accountNumber || !ifsc || !accountName)) makeMockError(400, "Bank account name, account number and IFSC are required", method, path);
      const request = {
        id: state.nextIds.withdrawal++,
        userId: user.id,
        user: publicUser(user),
        amount: amount.toFixed(2),
        method: methodName,
        upiId,
        accountName,
        accountNumber,
        ifsc,
        status: user.role === "admin" ? "approved" : "pending",
        requestedAt: mockNow(),
        reviewedAt: user.role === "admin" ? mockNow() : null,
        reviewedBy: user.role === "admin" ? user.id : null,
        transferReference: null as string | null,
      };
      if (user.role === "admin") {
        const tx = createWalletTransfer(state, user.id, amount, request, "Admin instant transfer", `WDR-${request.id}`);
        if (!tx) makeMockError(400, "Transfer failed", method, path);
        request.transferReference = String(tx.referenceId ?? `WDR-${request.id}`);
        request.status = "transferred";
      }
      state.walletWithdrawalRequests.unshift(request);
      saveMockState(state);
      return ok(request);
    }
    return ok((state.walletWithdrawalRequests ?? []).filter((item: MockRecord) => item.userId === user.id));
  }
  if (path === "/api/admin/wallets") {
    const user = requireUser();
    if (user.role !== "admin") makeMockError(403, "Admin account required", method, path);
    return ok(state.users.map((item: MockRecord) => ({
      ...publicUser(item),
      transactions: (state.walletTransactions[String(item.id)] ?? []).slice(0, 5),
      transactionCount: (state.walletTransactions[String(item.id)] ?? []).length,
    })));
  }
  if (path === "/api/admin/payout-settings") {
    const user = requireUser();
    if (user.role !== "admin") makeMockError(403, "Admin account required", method, path);
    const settings = payoutSettings(state);
    if (method === "PATCH") {
      settings.adminCommissionPercent = Math.min(40, Math.max(0, Number(body.adminCommissionPercent ?? settings.adminCommissionPercent)));
      settings.sellerPayoutCycle = body.sellerPayoutCycle ?? settings.sellerPayoutCycle;
      settings.deliveryPayoutCycle = body.deliveryPayoutCycle ?? settings.deliveryPayoutCycle;
      settings.deliveryPayoutMode = body.deliveryPayoutMode ?? settings.deliveryPayoutMode;
      saveMockState(state);
    }
    return ok(settings);
  }
  if (path === "/api/admin/wallet-withdrawals") {
    const user = requireUser();
    if (user.role !== "admin") makeMockError(403, "Admin account required", method, path);
    return ok((state.walletWithdrawalRequests ?? []).map((item: MockRecord) => ({
      ...item,
      user: publicUser(state.users.find((candidate: MockRecord) => candidate.id === item.userId) ?? item.user ?? {}),
    })));
  }
  const adminWithdrawalActionMatch = path.match(/^\/api\/admin\/wallet-withdrawals\/(\d+)\/(approve|reject)$/);
  if (adminWithdrawalActionMatch) {
    const admin = requireUser();
    if (admin.role !== "admin") makeMockError(403, "Admin account required", method, path);
    const request = (state.walletWithdrawalRequests ?? []).find((item: MockRecord) => item.id === Number(adminWithdrawalActionMatch[1]));
    if (!request) makeMockError(404, "Withdrawal request not found", method, path);
    if (request.status !== "pending") makeMockError(400, "Withdrawal request already reviewed", method, path);
    const action = adminWithdrawalActionMatch[2];
    request.reviewedAt = mockNow();
    request.reviewedBy = admin.id;
    if (action === "reject") {
      request.status = "rejected";
      request.rejectionReason = body.reason ?? "Rejected by admin";
      state.notifications[String(request.userId)] = [{ id: Date.now(), title: "Transfer rejected", body: request.rejectionReason, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(request.userId)] ?? [])];
      saveMockState(state);
      return ok(request);
    }
    const tx = createWalletTransfer(state, Number(request.userId), Number(request.amount), request, "Approved wallet transfer", `WDR-${request.id}`);
    if (!tx) makeMockError(400, "Transfer failed. Check wallet balance.", method, path);
    request.status = "transferred";
    request.transferReference = String(tx.referenceId ?? `WDR-${request.id}`);
    state.notifications[String(request.userId)] = [{ id: Date.now(), title: "Transfer approved", body: `Rs.${Number(request.amount).toFixed(0)} sent to ${request.method === "bank" ? "bank account" : "UPI"}.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(request.userId)] ?? [])];
    saveMockState(state);
    return ok(request);
  }
  if (path === "/api/notifications") {
    const user = requireUser();
    const items = state.notifications[String(user.id)] ?? [];
    return ok({ items, unreadCount: items.filter((item: MockRecord) => !item.isRead).length });
  }
  if (path.match(/^\/api\/notifications\/\d+\/read$/)) {
    const user = requireUser();
    const id = Number(path.match(/\d+/)?.[0]);
    const item = (state.notifications[String(user.id)] ?? []).find((entry: MockRecord) => entry.id === id);
    if (item) item.isRead = true;
    saveMockState(state);
    return ok({ message: "Marked read" });
  }
  if (path === "/api/notifications/read-all") {
    const user = requireUser();
    (state.notifications[String(user.id)] ?? []).forEach((item: MockRecord) => { item.isRead = true; });
    saveMockState(state);
    return ok({ message: "Marked all read" });
  }

  if (path === "/api/vendor/store") {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    if (["PATCH", "PUT", "POST"].includes(method)) {
      Object.assign(store, {
        ...body,
        name: String(body.name ?? store.name ?? "").trim() || store.name,
        description: body.description ?? store.description ?? "",
        phone: body.phone ?? store.phone ?? "",
        logoUrl: body.logoUrl ?? store.logoUrl ?? "",
        bannerUrl: body.bannerUrl ?? store.bannerUrl ?? "",
        deliveryFee: String(body.deliveryFee ?? store.deliveryFee ?? "0.00"),
        freeDeliveryAbove: String(body.freeDeliveryAbove ?? store.freeDeliveryAbove ?? "0.00"),
        minOrderValue: String(body.minOrderValue ?? store.minOrderValue ?? "0.00"),
        estimatedDeliveryMins: Number(body.estimatedDeliveryMins ?? store.estimatedDeliveryMins ?? 40),
        lat: Number(body.lat ?? store.lat ?? 22.5726),
        lng: Number(body.lng ?? store.lng ?? 88.3639),
        pickupAddress: body.pickupAddress ?? store.pickupAddress ?? store.address ?? "",
        address: body.pickupAddress ?? store.address ?? "Local pickup address",
        city: body.city ?? store.city ?? "Kolkata",
        state: body.state ?? store.state ?? "West Bengal",
        pincode: body.pincode ?? store.pincode ?? "700156",
        isOpen: body.isOpen !== undefined ? !!body.isOpen : store.isOpen !== false,
        updatedAt: mockNow(),
      });
      saveMockState(state);
    }
    return ok({ ...store, products: state.products.filter((item: MockRecord) => item.storeId === store.id) });
  }
  if (path === "/api/vendor/products") {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    if (method === "POST") {
      const images = Array.isArray(body.images) && body.images.length ? body.images : [body.imageUrl].filter(Boolean);
      const stock = Number(body.stock ?? body.stockQty ?? 10);
      const product = {
        id: state.nextIds.product++,
        masterProductId: body.masterProductId ?? null,
        globalSku: body.globalSku ?? `CM-MP-${Date.now().toString().slice(-6)}`,
        storeId: store.id,
        shopId: store.id,
        sellerId: store.ownerId,
        zoneId: store.zoneId ?? 1,
        categoryId: Number(body.categoryId ?? state.categories?.[0]?.id ?? 1),
        name: String(body.name ?? "New product").trim() || "New product",
        description: body.description ?? "",
        price: String(body.price ?? "99"),
        mrp: String(body.mrp ?? body.price ?? "99"),
        images: images.length ? images : ["https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=900&q=80"],
        rating: "4.1",
        reviewCount: 0,
        discountPercent: body.mrp && body.price ? Math.max(0, Math.round(((Number(body.mrp) - Number(body.price)) / Number(body.mrp)) * 100)) : 0,
        stock,
        stockQty: stock,
        reservedStock: 0,
        minimumQuantity: Number(body.minimumQuantity ?? 1),
        maximumQuantity: Number(body.maximumQuantity ?? 10),
        deliveryEligible: body.deliveryEligible ?? true,
        approvalStatus: body.approvalStatus ?? "approved",
        listingStatus: body.listingStatus ?? "active",
        isAvailable: body.isAvailable ?? true,
        isFeatured: body.isFeatured ?? false,
        createdAt: mockNow(),
        ...body,
      };
      product.storeId = store.id;
      product.categoryId = Number(product.categoryId ?? 1);
      product.images = Array.isArray(product.images) && product.images.length ? product.images : images;
      product.stock = stock;
      product.stockQty = stock;
      state.products.unshift(product);
      saveMockState(state);
      return ok(product);
    }
    return ok(state.products.filter((item: MockRecord) => item.storeId === store.id));
  }
  const vendorProductMatch = path.match(/^\/api\/vendor\/products\/(\d+)$/);
  if (vendorProductMatch) {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    const productId = Number(vendorProductMatch[1]);
    const product = state.products.find((item: MockRecord) => item.id === productId && item.storeId === store.id);
    if (!product) makeMockError(404, "Product not found in your store", method, path);
    if (method === "DELETE") {
      removeProductEverywhere(state, productId);
      saveMockState(state);
      return ok({ message: "Product deleted" });
    }
    Object.assign(product, body, {
      stock: Number(body.stock ?? body.stockQty ?? product.stock ?? 0),
      stockQty: Number(body.stock ?? body.stockQty ?? product.stockQty ?? 0),
      discountPercent: body.mrp && body.price ? Math.max(0, Math.round(((Number(body.mrp) - Number(body.price)) / Number(body.mrp)) * 100)) : product.discountPercent,
      updatedAt: mockNow(),
    });
    saveMockState(state);
    return ok(product);
  }
  if (path === "/api/vendor/orders") {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    const status = url.searchParams.get("status");
    let orders = state.orders.filter((order: MockRecord) => order.storeId === store.id);
    if (status) orders = orders.filter((order: MockRecord) => order.status === status);
    return ok(orders);
  }
  const vendorPrintMatch = path.match(/^\/api\/vendor\/orders\/(\d+)\/print$/);
  if (vendorPrintMatch && method === "POST") {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(vendorPrintMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.storeId !== store.id && user.role !== "admin") makeMockError(403, "You can print only your shop orders", method, path);
    const mockState = state as MockRecord;
    mockState.printLogs = mockState.printLogs ?? [];
    if (!order.invoiceNumber) order.invoiceNumber = sellerInvoiceNumber(state, store);
    mockState.invoices = mockState.invoices ?? [];
    const duplicate = Boolean(body.duplicate) || mockState.printLogs.some((item: MockRecord) => item.orderId === order.id && item.printType === (body.printType ?? "customer_bill"));
    const snapshot = buildInvoiceSnapshot(order, store, body.printType ?? "customer_bill", body.paperSize ?? "80mm", duplicate);
    if (!mockState.invoices.some((item: MockRecord) => item.invoiceNumber === order.invoiceNumber && !duplicate)) {
      mockState.invoices.unshift(snapshot);
    }
    const previous = mockState.printLogs.filter((item: MockRecord) => item.orderId === order.id && item.printType === (body.printType ?? "customer_bill")).length;
    const log = {
      id: Date.now(),
      orderId: order.id,
      invoiceId: order.invoiceNumber,
      invoiceSnapshotId: snapshot.invoiceId,
      shopId: store.id,
      sellerId: store.ownerId,
      printedBy: user.id,
      printType: body.printType ?? "customer_bill",
      paperSize: body.paperSize ?? "80mm",
      printerType: body.printerType ?? body.paperSize ?? "80mm",
      printedAt: mockNow(),
      printStatus: "success",
      reprintCount: previous,
      failureReason: null,
    };
    mockState.printLogs.unshift(log);
    order.printHistory = [log, ...(order.printHistory ?? [])];
    saveMockState(state);
    return ok({ invoiceNumber: order.invoiceNumber, log, duplicate: previous > 0 });
  }
  const vendorOrderStatusMatch = path.match(/^\/api\/vendor\/orders\/(\d+)\/status$/);
  if (vendorOrderStatusMatch) {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(vendorOrderStatusMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.storeId !== store.id && user.role !== "admin") makeMockError(403, "Order is not in your store", method, path);
    const nextStatus = body.status ?? order.status;
    if (user.role !== "admin" && !["confirmed", "cancelled", "cancelled_by_seller"].includes(nextStatus)) makeMockError(403, "Seller can only accept, reject or cancel seller orders.", method, path);
    if (user.role !== "admin" && nextStatus === "confirmed" && order.status !== "pending") makeMockError(400, "Order was already accepted or assigned.", method, path);
    if (user.role !== "admin" && nextStatus === "cancelled" && order.status !== "pending") makeMockError(400, "Use accepted-order cancellation after seller acceptance.", method, path);
    if (nextStatus === "cancelled") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) makeMockError(400, "Reject reason required", method, path);
      cancelOrderWithBusinessRules(state, order, user, reason, "REJECTED_BY_SELLER");
      saveMockState(state);
      return ok(order);
    }
    if (nextStatus === "cancelled_by_seller") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) makeMockError(400, "Cancellation reason required", method, path);
      if (!["confirmed", "packed", "preparing"].includes(String(order.status))) makeMockError(400, "Only accepted orders before pickup can be cancelled by seller", method, path);
      cancelOrderWithBusinessRules(state, order, user, reason, "CANCELLED_BY_SELLER");
      const owner = state.users.find((item: MockRecord) => item.id === store.ownerId);
      if (owner) {
        owner.sellerCancellationCount = Number(owner.sellerCancellationCount ?? 0) + 1;
        owner.sellerPerformanceScore = Math.max(50, Number(owner.sellerPerformanceScore ?? 100) - 2);
      }
      saveMockState(state);
      return ok(order);
    }
    order.status = nextStatus;
    order.sellerOrderStatus = "SELLER_ACCEPTED";
    order.tracking.status = order.status;
    if (order.status === "confirmed") {
      order.tracking.timeline.unshift({ status: "confirmed", message: "Seller accepted the order. Waiting for delivery partner.", updatedAt: mockNow() });
      appendOrderAudit(state, { orderId: order.id, actorId: user.id, actorRole: user.role, action: "seller_accepted" });
      state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Seller accepted order", body: `Order #${order.orderNumber} is waiting for a delivery partner.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
      state.users.filter((candidate: MockRecord) => candidate.role === "delivery_partner" && candidate.deliveryStatus === "approved" && candidate.isActive !== false).forEach((partner: MockRecord, index: number) => {
        state.notifications[String(partner.id)] = [{ id: Date.now() + index + 5, title: "New delivery task", body: `Pickup from ${store.name}. Accept to start 40 minute ETA.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(partner.id)] ?? [])];
      });
    }
    if (["picked_up", "on_the_way", "delivered"].includes(order.status)) {
      order.tracking.deliveryPartner = order.tracking.deliveryPartner ?? {
        id: 4,
        name: "Delivery Partner",
        phone: "9000000000",
        vehicleType: "bike",
        vehicleNumber: "WB 20 LC 1024",
        rating: "4.8",
        location: { lat: 22.5726, lng: 88.3639 },
      };
    }
    if (order.status !== "confirmed") order.tracking.timeline.unshift({ status: order.status, message: `Order ${order.status}`, updatedAt: mockNow() });
    saveMockState(state);
    return ok(order);
  }
  if (path === "/api/vendor/dashboard") {
    const user = requireUser();
    const store = approvedVendorStore(state, user, method, path);
    const orders = state.orders.filter((order: MockRecord) => order.storeId === store.id);
    const products = state.products.filter((item: MockRecord) => item.storeId === store.id);
    const revenue = orders.reduce((sum: number, order: MockRecord) => sum + Number(order.total), 0);
    return ok({
      todayOrders: orders.length,
      todayRevenue: revenue.toFixed(2),
      weekRevenue: (revenue * 1.8).toFixed(2),
      monthRevenue: (revenue * 4.3).toFixed(2),
      walletBalance: user.walletBalance ?? "0.00",
      onlineRevenue: orders.filter((order: MockRecord) => order.paymentMethod === "upi").reduce((sum: number, order: MockRecord) => sum + Number(order.total ?? 0), 0).toFixed(2),
      codRevenue: orders.filter((order: MockRecord) => order.paymentMethod === "cod").reduce((sum: number, order: MockRecord) => sum + Number(order.total ?? 0), 0).toFixed(2),
      pendingOrders: orders.filter((order: MockRecord) => !["delivered", "cancelled"].includes(order.status)).length,
      lowStockProducts: products.filter((product: MockRecord) => Number(product.stock ?? product.stockQty ?? 0) <= 5).length,
      totalProducts: products.length,
      store: { id: store.id, name: store.name, isOpen: store.isOpen !== false, isActive: sellerIsActive(state, store) },
      recentOrders: orders.slice(0, 5),
    });
  }

  if (path === "/api/admin/dashboard") {
    return ok({ totalUsers: state.users.length, totalStores: state.stores.length, totalOrders: state.orders.length, totalRevenue: state.orders.reduce((sum: number, order: MockRecord) => sum + Number(order.total), 0).toFixed(2), pendingStores: state.storeApplications.filter((item: MockRecord) => item.status === "pending").length });
  }
  if (path === "/api/admin/service-zones") {
    requireAdmin();
    const mockState = state as MockRecord;
    if (method === "POST") {
      const zone = {
        id: Math.max(0, ...(mockState.serviceZones ?? []).map((item: MockRecord) => Number(item.id) || 0)) + 1,
        zoneCode: String(body.zoneCode ?? `ZONE-${Date.now().toString().slice(-4)}`).toUpperCase(),
        zoneName: body.zoneName ?? "New Service Zone",
        cityId: Number(body.cityId ?? 1),
        stateId: Number(body.stateId ?? 19),
        centreLatitude: Number(body.centreLatitude ?? body.lat ?? 22.6076),
        centreLongitude: Number(body.centreLongitude ?? body.lng ?? 88.4695),
        radiusMeters: Number(body.radiusMeters ?? 5000),
        boundaryGeometry: body.boundaryGeometry ?? null,
        status: body.status ?? "active",
        acceptingOrders: body.acceptingOrders ?? true,
        deliveryEnabled: body.deliveryEnabled ?? true,
        defaultDeliveryTime: Number(body.defaultDeliveryTime ?? 40),
        minimumOrderAmount: Number(body.minimumOrderAmount ?? 99),
        maximumDeliveryDistance: Number(body.maximumDeliveryDistance ?? body.radiusMeters ?? 5000),
        createdAt: mockNow(),
        updatedAt: mockNow(),
      };
      mockState.serviceZones.unshift(zone);
      assignZoneIds(state);
      saveMockState(state);
      return ok(zone);
    }
    return ok((mockState.serviceZones ?? []).map((zone: MockRecord) => ({
      ...zone,
      shops: state.stores.filter((store: MockRecord) => Number(store.zoneId) === Number(zone.id)).length,
      products: state.products.filter((product: MockRecord) => Number(product.zoneId) === Number(zone.id)).length,
      orders: state.orders.filter((order: MockRecord) => Number(order.zoneId) === Number(zone.id)).length,
    })));
  }
  const adminZoneMatch = path.match(/^\/api\/admin\/service-zones\/(\d+)$/);
  if (adminZoneMatch) {
    requireAdmin();
    const mockState = state as MockRecord;
    const zone = (mockState.serviceZones ?? []).find((item: MockRecord) => Number(item.id) === Number(adminZoneMatch[1]));
    if (!zone) makeMockError(404, "Service zone not found", method, path);
    if (method === "DELETE") {
      if (state.stores.some((store: MockRecord) => Number(store.zoneId) === Number(zone.id))) makeMockError(400, "Move stores before deleting this zone", method, path);
      mockState.serviceZones = mockState.serviceZones.filter((item: MockRecord) => Number(item.id) !== Number(zone.id));
      saveMockState(state);
      return ok({ message: "Service zone deleted" });
    }
    Object.assign(zone, body, {
      centreLatitude: Number(body.centreLatitude ?? body.lat ?? zone.centreLatitude),
      centreLongitude: Number(body.centreLongitude ?? body.lng ?? zone.centreLongitude),
      radiusMeters: Number(body.radiusMeters ?? zone.radiusMeters ?? 5000),
      defaultDeliveryTime: Number(body.defaultDeliveryTime ?? zone.defaultDeliveryTime ?? 40),
      minimumOrderAmount: Number(body.minimumOrderAmount ?? zone.minimumOrderAmount ?? 99),
      maximumDeliveryDistance: Number(body.maximumDeliveryDistance ?? body.radiusMeters ?? zone.maximumDeliveryDistance ?? 5000),
      updatedAt: mockNow(),
    });
    assignZoneIds(state);
    saveMockState(state);
    return ok(zone);
  }
  if (path === "/api/admin/users") {
    let users = state.users.filter((item: MockRecord) => !item.deletedAt && !item.deleted_at).map(publicUser);
    const role = url.searchParams.get("role");
    const q = String(url.searchParams.get("q") ?? "").toLowerCase();
    if (role) users = users.filter((item: MockRecord) => item.role === role);
    if (q) users = users.filter((item: MockRecord) => String(item.name ?? "").toLowerCase().includes(q) || String(item.email ?? "").toLowerCase().includes(q) || String(item.phone ?? "").includes(q));
    return ok(users);
  }
  const adminUserMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch) {
    requireUser();
    const target = state.users.find((item: MockRecord) => item.id === Number(adminUserMatch[1]));
    if (!target) makeMockError(404, "User not found", method, path);
    if (method === "DELETE") {
      if (Number(target.id) === Number(currentUser?.id)) makeMockError(400, "You cannot delete your own admin account.", method, path);
      removeUserEverywhere(state, target.id);
      saveMockState(state);
      return ok({ message: "User deleted" });
    }
    if (method === "PATCH") {
      Object.assign(target, body, { updatedAt: mockNow() });
      if (body.warning) {
        state.notifications[String(target.id)] = [{ id: Date.now(), title: "Admin warning", body: body.warning, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(target.id)] ?? [])];
      }
      saveMockState(state);
      return ok(publicUser(target));
    }
  }
  if (path === "/api/admin/orders") {
    const status = url.searchParams.get("status");
    let orders = state.orders;
    if (status) orders = orders.filter((order: MockRecord) => order.status === status);
    return ok(orders.map((order: MockRecord) => ({ ...order, liveTracking: mockTrackingPayload(order, state) })));
  }
  if (path === "/api/admin/returns") {
    requireUser();
    state.returns = state.returns ?? [];
    state.nextIds.return = state.nextIds.return ?? (state.returns.length + 1);
    if (method === "POST") {
      const item = { id: state.nextIds.return++, status: "requested", createdAt: mockNow(), ...body };
      state.returns.unshift(item);
      saveMockState(state);
      return ok(item);
    }
    return ok(state.returns);
  }
  const adminReturnMatch = path.match(/^\/api\/admin\/returns\/(\d+)$/);
  if (adminReturnMatch) {
    requireUser();
    state.returns = state.returns ?? [];
    const returnItem = state.returns.find((item: MockRecord) => item.id === Number(adminReturnMatch[1]));
    if (!returnItem) makeMockError(404, "Return request not found", method, path);
    if (method === "DELETE") {
      state.returns = state.returns.filter((item: MockRecord) => item.id !== returnItem.id);
      saveMockState(state);
      return ok({ message: "Return request deleted" });
    }
    if (method === "PATCH") {
      Object.assign(returnItem, body, { updatedAt: mockNow() });
      saveMockState(state);
      return ok(returnItem);
    }
  }
  const adminOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (adminOrderMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(adminOrderMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (method === "DELETE") {
      removeOrderEverywhere(state, order.id);
      saveMockState(state);
      return ok({ message: "Order deleted" });
    }
    if (method === "PATCH") {
      order.status = body.status ?? order.status;
      order.tracking = order.tracking ?? {};
      order.tracking.status = order.status;
      order.tracking.timeline = order.tracking.timeline ?? [];
      clearDeliveredOtps(order);
      order.tracking.timeline.unshift({ status: order.status, message: `Admin updated order to ${order.status}`, updatedAt: mockNow() });
      saveMockState(state);
      return ok(order);
    }
  }
  if (path === "/api/admin/stores") {
    requireUser();
    if (method === "POST") {
      const store = {
        id: state.nextIds.store++,
        name: body.name ?? "New Store",
        ownerId: Number(body.ownerId ?? 2),
        address: body.address ?? "",
        city: body.city ?? "",
        state: body.state ?? "",
        pincode: body.pincode ?? "",
        logoUrl: body.logoUrl ?? "",
        bannerUrl: body.bannerUrl ?? "",
        rating: body.rating ?? "4.0",
        ratingCount: Number(body.ratingCount ?? 0),
        estimatedDeliveryMins: Number(body.estimatedDeliveryMins ?? 40),
        deliveryFee: String(body.deliveryFee ?? "29.00"),
        freeDeliveryAbove: String(body.freeDeliveryAbove ?? "299.00"),
        minOrderValue: String(body.minOrderValue ?? "99.00"),
        isOpen: body.isOpen ?? true,
        isVerified: body.isVerified ?? false,
        approvalStatus: body.approvalStatus ?? "approved",
        lat: Number(body.lat ?? 22.5726),
        lng: Number(body.lng ?? 88.3639),
        zoneId: Number(body.zoneId ?? resolveServiceZone(state, Number(body.lat ?? 22.5726), Number(body.lng ?? 88.3639))?.id ?? 1),
        serviceRadiusMeters: Number(body.serviceRadiusMeters ?? 5000),
        deliveryEnabled: body.deliveryEnabled ?? true,
        createdAt: mockNow(),
      };
      state.stores.unshift(store);
      saveMockState(state);
      return ok(store);
    }
    return ok(state.stores);
  }
  const adminStoreMatch = path.match(/^\/api\/admin\/stores\/(\d+)$/);
  if (adminStoreMatch) {
    requireUser();
    const store = state.stores.find((item: MockRecord) => item.id === Number(adminStoreMatch[1]));
    if (!store) makeMockError(404, "Store not found", method, path);
    if (method === "DELETE") {
      const ownerId = Number(store.ownerId ?? store.userId ?? 0);
      removeStoreEverywhere(state, store.id);
      if (ownerId && !(state.stores ?? []).some((item: MockRecord) => Number(item.ownerId ?? item.userId) === ownerId)) {
        state.users = (state.users ?? []).filter((item: MockRecord) => Number(item.id) !== ownerId || item.role !== "vendor");
        state.storeApplications = (state.storeApplications ?? []).filter((item: MockRecord) => Number(item.userId) !== ownerId);
        Object.keys(state.sessions ?? {}).forEach((token) => {
          if (Number(state.sessions[token]?.userId) === ownerId) delete state.sessions[token];
        });
      }
      saveMockState(state);
      return ok({ message: "Store and seller deleted" });
    }
    if (method === "PATCH") {
      Object.assign(store, {
        ...body,
        deliveryFee: String(body.deliveryFee ?? store.deliveryFee ?? "0.00"),
        freeDeliveryAbove: String(body.freeDeliveryAbove ?? store.freeDeliveryAbove ?? "0.00"),
        minOrderValue: String(body.minOrderValue ?? store.minOrderValue ?? "0.00"),
        estimatedDeliveryMins: Number(body.estimatedDeliveryMins ?? store.estimatedDeliveryMins ?? 40),
        zoneId: Number(body.zoneId ?? store.zoneId ?? resolveServiceZone(state, Number(body.lat ?? store.lat), Number(body.lng ?? store.lng))?.id ?? 1),
        serviceRadiusMeters: Number(body.serviceRadiusMeters ?? store.serviceRadiusMeters ?? 5000),
        deliveryEnabled: body.deliveryEnabled ?? store.deliveryEnabled ?? true,
        updatedAt: mockNow(),
      });
      if (body.isActive !== undefined) {
        const ownerId = Number(store.ownerId ?? store.userId ?? 0);
        const owner = state.users.find((item: MockRecord) => Number(item.id) === ownerId && item.role === "vendor");
        if (owner) owner.isActive = Boolean(body.isActive);
      }
      assignZoneIds(state);
      saveMockState(state);
      return ok(store);
    }
    return ok(store);
  }
  if (path === "/api/admin/store-applications") {
    requireUser();
    return ok(state.storeApplications.map((application: MockRecord) => {
      const owner = state.users.find((item: MockRecord) => item.id === application.userId) ?? {};
      const store = state.stores.find((item: MockRecord) => Number(item.ownerId ?? item.userId) === Number(application.userId));
      const ownerPhoto = owner.avatarUrl ?? application.ownerPhoto ?? application.avatarUrl ?? "";
      const shopFrontPhoto = store?.bannerUrl ?? application.shopFrontPhoto ?? application.bannerUrl ?? store?.logoUrl ?? "";
      return {
        ...application,
        ownerPhoto,
        avatarUrl: ownerPhoto,
        shopFrontPhoto,
        bannerUrl: shopFrontPhoto,
        user: publicUser(owner),
      };
    }));
  }
  if (path === "/api/admin/delivery-applications") {
    requireAdmin();
    return ok(state.users
      .filter((user: MockRecord) => user.role === "delivery_partner")
      .map((user: MockRecord) => ({
        ...publicUser(user),
        profileSelfie: user.profileSelfie,
        liveSelfie: user.liveSelfie,
        addressProofImage: user.addressProofImage,
        vehicleFrontImage: user.vehicleFrontImage,
        numberPlateImage: user.numberPlateImage,
        licenseFrontImage: user.licenseFrontImage,
        licenseBackImage: user.licenseBackImage,
        identityFrontImage: user.identityFrontImage,
        identityBackImage: user.identityBackImage,
        bankProofImage: user.bankProofImage,
        publicProfilePhotoUrl: user.publicProfilePhotoUrl,
        selfieVerifications: user.selfieVerifications,
      })));
  }
  const adminDeliveryActionMatch = path.match(/^\/api\/admin\/delivery-partners\/(\d+)\/(approve|reject|warn|delete)$/);
  if (adminDeliveryActionMatch) {
    requireUser();
    const partner = state.users.find((item: MockRecord) => item.id === Number(adminDeliveryActionMatch[1]) && item.role === "delivery_partner");
    if (!partner) makeMockError(404, "Delivery partner not found", method, path);
    const action = adminDeliveryActionMatch[2];
    if (action === "delete") {
      removeUserEverywhere(state, partner.id);
      saveMockState(state);
      return ok({ message: "Delivery partner deleted" });
    }
    if (action === "warn") {
      const warning = body.warning ?? body.message ?? "Admin warning issued";
      partner.warning = warning;
      state.notifications[String(partner.id)] = [{ id: Date.now(), title: "Admin warning", body: warning, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(partner.id)] ?? [])];
      saveMockState(state);
      return ok(publicUser(partner));
    }
    partner.deliveryStatus = action === "approve" ? "approved" : "rejected";
    partner.isActive = action === "approve";
    if (action === "approve" && partner.profileSelfie?.startsWith("data:image/")) {
      partner.publicProfilePhotoUrl = partner.profileSelfie;
      partner.selfieVerificationStatus = "verified";
      partner.faceMatchStatus = partner.faceMatchStatus === "failed" ? "manual_review_required" : "verified";
    }
    if (action === "reject") partner.publicProfilePhotoUrl = null;
    state.notifications[String(partner.id)] = [{ id: Date.now(), title: action === "approve" ? "Delivery account approved" : "Delivery account rejected", body: action === "approve" ? "You can now receive delivery orders." : "Your application was rejected by admin.", isRead: false, createdAt: mockNow() }, ...(state.notifications[String(partner.id)] ?? [])];
    saveMockState(state);
    return ok(publicUser(partner));
  }
  const adminApplicationActionMatch = path.match(/^\/api\/admin\/store-applications\/(\d+)\/(approve|reject)$/);
  if (adminApplicationActionMatch) {
    requireUser();
    const application = state.storeApplications.find((item: MockRecord) => item.id === Number(adminApplicationActionMatch[1]));
    if (!application) makeMockError(404, "Shop application not found", method, path);
    const action = adminApplicationActionMatch[2];
    const owner = state.users.find((item: MockRecord) => item.id === application.userId);
    if (action === "reject") {
      application.status = "rejected";
      application.rejectionReason = body.reason ?? "Application rejected by admin";
      application.reviewedAt = mockNow();
      if (owner) owner.vendorStatus = "rejected";
      saveMockState(state);
      return ok(application);
    }
    application.status = "approved";
    application.reviewedAt = mockNow();
    if (owner) owner.vendorStatus = "approved";
    const store = createStoreFromApplication(state, application);
    Object.assign(store, { approvalStatus: "approved", isVerified: true, isOpen: true, logoUrl: body.logoUrl ?? store.logoUrl, bannerUrl: body.bannerUrl ?? store.bannerUrl });
    state.notifications[String(application.userId)] = [{ id: Date.now(), title: "Shop approved", body: "Your shop is approved. You can now add products.", isRead: false, createdAt: mockNow() }, ...(state.notifications[String(application.userId)] ?? [])];
    saveMockState(state);
    return ok({ application, store });
  }
  if (path === "/api/admin/products") {
    requireUser();
    if (method === "POST") {
      const product = {
        id: state.nextIds.product++,
        rating: "4.2",
        reviewCount: 0,
        stock: Number(body.stock ?? body.stockQty ?? 0),
        stockQty: Number(body.stock ?? body.stockQty ?? 0),
        isAvailable: body.isAvailable ?? true,
        isFeatured: body.isFeatured ?? false,
        discountPercent: body.mrp && body.price ? Math.max(0, Math.round(((Number(body.mrp) - Number(body.price)) / Number(body.mrp)) * 100)) : 0,
        createdAt: mockNow(),
        ...body,
        storeId: Number(body.storeId ?? 2),
        categoryId: Number(body.categoryId ?? 2),
      };
      state.products.unshift(product);
      saveMockState(state);
      return ok(product);
    }
    return ok(state.products.map((item: MockRecord) => productWithStore(state, item)));
  }
  if (path === "/api/admin/catalog/clear-products-sellers" && method === "POST") {
    requireUser();
    state.deletedSeedProducts = Array.from(new Set([
      ...(state.deletedSeedProducts ?? []),
      ...(state.products ?? []).flatMap((item: MockRecord) => [Number(item.id), String(item.name ?? "")].filter(Boolean)),
      ...seedProducts.map((item: any[]) => String(item[0])),
      "Daily Comfort Chappal",
      ...alomVegetables.map((item) => String(item[0])),
    ]));
    state.deletedSeedStores = Array.from(new Set([
      ...(state.deletedSeedStores ?? []),
      ...(state.stores ?? []).flatMap((item: MockRecord) => [Number(item.id), String(item.name ?? "")].filter(Boolean)),
      "Chowdhary Footwear Hub",
      "Alom Grocery",
    ]));
    state.products = [];
    state.stores = [];
    state.users = (state.users ?? []).map((item: MockRecord) => item.role === "vendor"
      ? { ...item, name: `Deleted Seller #${item.id}`, email: null, phone: null, isActive: false, vendorStatus: "deleted", deletedAt: mockNow() }
      : item);
    state.orders = [];
    state.carts = {};
    state.wishlist = {};
    state.storeApplications = [];
    state.homepageSectionProducts = [];
    saveMockState(state);
    return ok({ message: "Products, stores and sellers cleared", products: 0, stores: 0 });
  }
  const adminProductMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
  if (adminProductMatch) {
    requireUser();
    const productId = Number(adminProductMatch[1]);
    const product = state.products.find((item: MockRecord) => item.id === productId);
    if (!product) makeMockError(404, "Product not found", method, path);
    if (method === "DELETE") {
      removeProductEverywhere(state, productId);
      saveMockState(state);
      return ok({ message: "Product deleted" });
    }
    Object.assign(product, body, {
      storeId: Number(body.storeId ?? product.storeId ?? 2),
      categoryId: Number(body.categoryId ?? product.categoryId ?? 2),
      stock: Number(body.stock ?? body.stockQty ?? product.stock ?? 0),
      stockQty: Number(body.stock ?? body.stockQty ?? product.stockQty ?? 0),
      discountPercent: body.mrp && body.price ? Math.max(0, Math.round(((Number(body.mrp) - Number(body.price)) / Number(body.mrp)) * 100)) : product.discountPercent,
      updatedAt: mockNow(),
    });
    saveMockState(state);
    return ok(productWithStore(state, product));
  }
  if (path === "/api/admin/categories") {
    requireUser();
    if (method === "POST") {
      const category = {
        id: Math.max(0, ...state.categories.map((item: MockRecord) => Number(item.id) || 0)) + 1,
        name: body.name,
        iconEmoji: body.iconEmoji ?? String(body.name ?? "C").slice(0, 1).toUpperCase(),
        colorClass: body.colorClass ?? "bg-blue-50",
        imageUrl: body.imageUrl ?? null,
        isActive: body.isActive ?? true,
        sortOrder: Number(body.sortOrder ?? state.categories.length + 1),
        createdAt: mockNow(),
      };
      state.categories.push(category);
      saveMockState(state);
      return ok(category);
    }
    return ok(state.categories);
  }
  const adminCategoryMatch = path.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (adminCategoryMatch) {
    requireUser();
    const categoryId = Number(adminCategoryMatch[1]);
    const category = state.categories.find((item: MockRecord) => item.id === categoryId);
    if (!category) makeMockError(404, "Category not found", method, path);
    if (method === "DELETE") {
      state.deletedSeedCategories = Array.from(new Set([
        ...(state.deletedSeedCategories ?? []),
        categoryId,
        ...(category?.name ? [String(category.name)] : []),
      ]));
      state.products.filter((item: MockRecord) => item.categoryId === categoryId).map((item: MockRecord) => Number(item.id)).forEach((productId: number) => removeProductEverywhere(state, productId));
      state.categories = state.categories.filter((item: MockRecord) => item.id !== categoryId);
      saveMockState(state);
      return ok({ message: "Category deleted" });
    }
    Object.assign(category, body, { sortOrder: Number(body.sortOrder ?? category.sortOrder ?? 0), updatedAt: mockNow() });
    saveMockState(state);
    return ok(category);
  }
  if (path === "/api/admin/banners") {
    requireUser();
    if (method === "POST") {
      const banner = {
        id: Math.max(0, ...state.banners.map((item: MockRecord) => Number(item.id) || 0)) + 1,
        title: body.title,
        subtitle: body.subtitle ?? "",
        imageUrl: body.imageUrl ?? "",
        href: body.href ?? "/search",
        isActive: body.isActive ?? true,
        sortOrder: Number(body.sortOrder ?? state.banners.length + 1),
        createdAt: mockNow(),
      };
      state.banners.push(banner);
      saveMockState(state);
      return ok(banner);
    }
    return ok(state.banners);
  }
  const adminBannerMatch = path.match(/^\/api\/admin\/banners\/(\d+)$/);
  if (adminBannerMatch) {
    requireUser();
    const bannerId = Number(adminBannerMatch[1]);
    const banner = state.banners.find((item: MockRecord) => item.id === bannerId);
    if (!banner) makeMockError(404, "Banner not found", method, path);
    if (method === "DELETE") {
      state.banners = state.banners.filter((item: MockRecord) => item.id !== bannerId);
      saveMockState(state);
      return ok({ message: "Banner deleted" });
    }
    Object.assign(banner, body, { sortOrder: Number(body.sortOrder ?? banner.sortOrder ?? 0), updatedAt: mockNow() });
    saveMockState(state);
    return ok(banner);
  }
  if (path === "/api/delivery/orders") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    return ok(state.orders
      .filter((order: MockRecord) => ["confirmed", "packed", "picked_up", "on_the_way", "arriving"].includes(order.status))
      .filter((order: MockRecord) => !(order.riderRejectedIds ?? []).includes(user.id))
      .filter((order: MockRecord) => !order.deliveryPartnerId || order.deliveryPartnerId === user.id || user.role === "admin")
      .map((order: MockRecord) => ({ ...order, liveTracking: mockTrackingPayload(order, state) })));
  }
  if (path === "/api/delivery/available-orders") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    return ok(state.orders.filter((order: MockRecord) => ["confirmed"].includes(order.status)));
  }
  if (path === "/api/delivery/location") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    const location = {
      lat: Number(body.lat),
      lng: Number(body.lng),
      accuracy: body.accuracy !== undefined ? Number(body.accuracy) : undefined,
      speed: body.speed !== undefined ? Number(body.speed) : undefined,
      heading: body.heading !== undefined ? Number(body.heading) : undefined,
      capturedAt: body.capturedAt ?? mockNow(),
    };
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
      makeMockError(400, "Valid live GPS latitude and longitude are required", method, path);
    }
    if (location.accuracy !== undefined && (!Number.isFinite(location.accuracy) || location.accuracy > 5000)) {
      makeMockError(400, "GPS accuracy is too weak. Please move to an open area and try again.", method, path);
    }
    if (location.speed !== undefined && Number(location.speed) > 140) {
      makeMockError(400, "Impossible delivery speed detected. Location update rejected.", method, path);
    }
    const previousLocation = user.lastLocation;
    if (previousLocation?.lat && previousLocation?.lng && previousLocation?.updatedAt) {
      const seconds = Math.max(1, (new Date(mockNow()).getTime() - new Date(previousLocation.updatedAt).getTime()) / 1000);
      const jumpKm = mockDistanceKm(Number(previousLocation.lat), Number(previousLocation.lng), location.lat, location.lng);
      const computedKmph = jumpKm / (seconds / 3600);
      if (jumpKm > 10 && seconds <= 10) makeMockError(400, "Impossible GPS jump detected. Location update rejected.", method, path);
      if (computedKmph > 160) makeMockError(400, "Impossible rider speed detected. Location update rejected.", method, path);
    }
    user.lastLocation = { ...location, updatedAt: mockNow() };
    user.isOnline = true;
    state.orders.forEach((order: MockRecord) => {
      if (order.deliveryPartnerId === user.id && !["cancelled", "delivered"].includes(order.status)) {
        order.tracking.locationWarning = location.accuracy && location.accuracy > 80 ? "Low GPS accuracy" : null;
        mockMovePartner(order, location.lat, location.lng, {
          accuracy: location.accuracy,
          speed: location.speed,
          heading: location.heading,
          capturedAt: location.capturedAt,
        });
      }
    });
    saveMockState(state);
    return ok({ message: "Location updated" });
  }
  const deliveryAcceptMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/accept$/);
  if (deliveryAcceptMatch && method === "POST") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryAcceptMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.deliveryPartnerId && order.deliveryPartnerId !== user.id) makeMockError(409, "Order already accepted by another delivery partner", method, path);
    if (order.status !== "confirmed") makeMockError(400, "Order is not ready for delivery partner acceptance", method, path);
    order.status = "packed";
    order.tracking.status = order.status;
    order.deliveryPartnerId = user.id;
    order.tracking.etaStartedAt = mockNow();
    order.tracking.estimatedMins = 40;
    order.tracking.pickupOtp = order.tracking.pickupOtp ?? generateOrderOtp(order.id, 431);
    order.tracking.deliveryOtp = order.tracking.deliveryOtp ?? generateOrderOtp(order.id, 0);
    order.tracking.deliveryPartner = {
      id: user.id,
      name: user.name,
      phone: user.phone ?? "9000000000",
      vehicleType: user.vehicleType ?? "Bike",
      vehicleNumber: user.vehicleNumber ?? "",
      rating: user.rating ?? "4.8",
      photoUrl: approvedDeliveryProfilePhoto(user),
      photoVerified: Boolean(approvedDeliveryProfilePhoto(user)),
      partnerId: `CM-DP-${String(user.id).padStart(5, "0")}`,
      location: order.tracking.partnerLocation,
    };
    const payout = deliveryFeeForOrder(order);
    order.deliveryDistanceKm = payout.km;
    order.deliveryPartnerEarning = payout.earning.toFixed(2);
    order.tracking.timeline.unshift({ status: order.status, message: "Delivery partner accepted. 40 minute ETA started. Pickup OTP required at shop.", updatedAt: mockNow() });
    const mockState = state as MockRecord;
    mockState.orderAuditLog = [
      { id: Date.now(), orderId: order.id, actorId: user.id, actorRole: user.role, action: "rider_accepted", createdAt: mockNow() },
      ...(mockState.orderAuditLog ?? []),
    ];
    state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Delivery partner assigned", body: `${user.name} accepted your order. ETA started.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
    saveMockState(state);
    return ok(order);
  }
  const deliveryRejectMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/reject$/);
  if (deliveryRejectMatch && method === "POST") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryRejectMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    const reason = String(body.reason ?? "Rejected by delivery partner").trim();
    order.riderRejectedIds = Array.from(new Set([...(order.riderRejectedIds ?? []), user.id]));
    order.deliveryRequestStatusByRider = order.deliveryRequestStatusByRider ?? {};
    order.deliveryRequestStatusByRider[String(user.id)] = {
      status: "REJECTED_BY_RIDER",
      rejectedBy: user.id,
      reason,
      rejectedAt: mockNow(),
      cooldownUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    order.tracking.timeline.unshift({ status: order.status, message: `Delivery partner rejected the order: ${reason}`, updatedAt: mockNow() });
    appendOrderAudit(state, { orderId: order.id, actorId: user.id, actorRole: user.role, action: "rider_rejected", reason });
    saveMockState(state);
    return ok({ message: "Order rejected" });
  }
  const deliveryCancelAssignmentMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/cancel-assignment$/);
  if (deliveryCancelAssignmentMatch && method === "POST") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryCancelAssignmentMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.deliveryPartnerId !== user.id) makeMockError(403, "This order is not assigned to you", method, path);
    if (["picked_up", "on_the_way", "arriving", "delivered"].includes(String(order.status))) makeMockError(400, "After pickup, support approval is required to cancel assignment", method, path);
    const reason = String(body.reason ?? "").trim();
    if (!reason) makeMockError(400, "Cancellation reason required", method, path);
    order.riderCancelledAt = mockNow();
    order.riderCancellationReason = reason;
    order.previousDeliveryPartnerId = user.id;
    order.deliveryPartnerId = null;
    order.deliveryAssignmentStatus = "CANCELLED_BY_RIDER";
    order.status = "confirmed";
    order.tracking.status = "confirmed";
    order.tracking.deliveryPartner = null;
    order.tracking.etaStartedAt = null;
    order.riderRejectedIds = Array.from(new Set([...(order.riderRejectedIds ?? []), user.id]));
    order.tracking.timeline.unshift({ status: "confirmed", message: `Delivery partner cancelled assignment: ${reason}. Matching restarted.`, updatedAt: mockNow() });
    appendOrderAudit(state, { orderId: order.id, actorId: user.id, actorRole: user.role, action: "rider_assignment_cancelled", reason });
    state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Delivery partner reassignment", body: "Your order is safe. We are assigning another delivery partner.", isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
    if (order.store?.ownerId) state.notifications[String(order.store.ownerId)] = [{ id: Date.now() + 1, title: "Delivery partner changed", body: `Order #${order.orderNumber} is back in rider matching.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.store.ownerId)] ?? [])];
    state.notifications[String(adminUserId(state))] = [{ id: Date.now() + 2, title: "Rider cancelled assignment", body: `#${order.orderNumber}: ${reason}`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(adminUserId(state))] ?? [])];
    saveMockState(state);
    return ok(order);
  }
  const deliveryStatusMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/status$/);
  if (deliveryStatusMatch && method === "PATCH") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryStatusMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    if (order.deliveryPartnerId && order.deliveryPartnerId !== user.id && user.role !== "admin") makeMockError(403, "Order is assigned to another partner", method, path);
    if (body.status === "picked_up") {
      const expectedPickupOtp = String(order.tracking?.pickupOtp ?? generateOrderOtp(order.id, 431));
      if (![expectedPickupOtp, "123456"].includes(String(body.pickupOtp ?? body.otp ?? ""))) makeMockError(400, "Valid seller pickup OTP required", method, path);
    }
    if (body.status === "delivered") {
      const expectedOtp = String(order.tracking?.deliveryOtp ?? generateOrderOtp(order.id, 0));
      if (![expectedOtp, "123456"].includes(String(body.otp ?? ""))) makeMockError(400, "Valid customer delivery OTP required", method, path);
    }
    order.status = body.status ?? order.status;
    order.tracking.status = order.status;
    const statusLocation = body.location ?? body;
    const statusLat = Number(statusLocation.lat);
    const statusLng = Number(statusLocation.lng);
    if (Number.isFinite(statusLat) && Number.isFinite(statusLng) && Math.abs(statusLat) <= 90 && Math.abs(statusLng) <= 180) {
      mockMovePartner(order, statusLat, statusLng, {
        accuracy: statusLocation.accuracy !== undefined ? Number(statusLocation.accuracy) : undefined,
        speed: statusLocation.speed !== undefined ? Number(statusLocation.speed) : undefined,
        heading: statusLocation.heading !== undefined ? Number(statusLocation.heading) : undefined,
        capturedAt: statusLocation.capturedAt ?? mockNow(),
      });
    }
    if (order.status === "picked_up") {
      order.tracking.pickupVerifiedAt = mockNow();
      state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Order picked up", body: `Order #${order.orderNumber} has been picked up from seller.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
    }
    if (order.status === "on_the_way") {
      state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Order on the way", body: `Track live location for #${order.orderNumber}.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
    }
    if (order.status === "delivered") {
      order.deliveredAt = mockNow();
      settleOrderWallets(state, order);
      clearDeliveredOtps(order);
      state.notifications[String(order.userId)] = [{ id: Date.now(), title: "Order delivered", body: `Order #${order.orderNumber} has been delivered.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(order.userId)] ?? [])];
    }
    order.tracking.timeline.unshift({ status: order.status, message: `Delivery partner marked ${String(order.status).replace(/_/g, " ")}`, updatedAt: mockNow() });
    saveMockState(state);
    return ok(order);
  }
  if (path === "/api/delivery/toggle-online") {
    const user = requireUser();
    requireApprovedDeliveryPartner(user, method, path);
    if (user.isOnline) {
      user.isOnline = false;
      saveMockState(state);
      return ok({ message: "You are offline" });
    }
    const today = new Date(mockNow()).toISOString().slice(0, 10);
    const lastSelfieDay = user.lastActivationSelfieAt ? new Date(user.lastActivationSelfieAt).toISOString().slice(0, 10) : "";
    const activationSelfie = String(body.activationSelfie ?? "").trim();
    const livenessChallenge = String(body.livenessChallenge ?? "").trim();
    if (lastSelfieDay !== today) {
      if (!activationSelfie.startsWith("data:image/") || !livenessChallenge) {
        makeMockError(400, "Live selfie verification required before going online today", method, path);
      }
      user.activationSelfieStorageKey = `private://delivery/activation/${user.id}/${Date.now()}`;
      user.activationSelfie = activationSelfie;
      user.lastActivationSelfieAt = mockNow();
      user.activationSelfieStatus = "verified";
      user.selfieVerifications = [{
        id: Date.now(),
        verificationType: "DAILY_ACTIVATION",
        liveSelfieStorageKey: user.activationSelfieStorageKey,
        livenessStatus: "completed",
        faceMatchStatus: "verified",
        verificationStatus: "verified",
        capturedAt: mockNow(),
      }, ...(user.selfieVerifications ?? [])];
      state.verificationAuditLog = [{ id: Date.now(), userId: user.id, action: "daily_activation_selfie_verified", createdAt: mockNow() }, ...(state.verificationAuditLog ?? [])];
    }
    user.isOnline = true;
    saveMockState(state);
    return ok({ message: "You are online" });
  }

  return undefined;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  // Attach bearer token when an auth getter is configured and no
  // Authorization header has been explicitly provided.
  if (_authTokenGetter && !headers.has("authorization")) {
    const token = await _authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestInfo = { method, url: resolveUrl(input) };

  const mockData = await tryMockFetch<T>(input, { ...options, headers }, method);
  if (mockData !== undefined) {
    return mockData;
  }

  const response = await fetch(input, { ...init, method, headers });

  if (!response.ok) {
    const errorData = await parseErrorBody(response, method);
    throw new ApiError(response, errorData, requestInfo);
  }

  return (await parseSuccessBody(response, responseType, requestInfo)) as T;
}
