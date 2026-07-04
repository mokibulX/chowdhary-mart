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
];

function mockNow() {
  return new Date().toISOString();
}

function makeUser(overrides: MockRecord = {}) {
  return {
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
    return {
      id: index + 1,
      name,
      categoryId,
      storeId,
      price: Number(price).toFixed(2),
      mrp: Number(mrp).toFixed(2),
      discountPercent: Math.round(((Number(mrp) - Number(price)) / Number(mrp)) * 100),
      images: [image],
      weight,
      unit,
      description: `${name} with 40 minute local delivery target, damaged-item return support, verified seller support and assured quality.`,
      specifications: { Warranty: "Assured", Delivery: "40 minute local target", Return: "Damaged items only" },
      rating: (4.2 + (index % 6) / 10).toFixed(1),
      reviewCount: 25 + index * 7,
      stock: 20 + (index % 8) * 6,
      stockQty: 20 + (index % 8) * 6,
      isAvailable: true,
      isFeatured: index < 8,
      createdAt: mockNow(),
    };
  });
  const customer = makeUser({ id: 1, email: "customer@local.test", name: "Demo Customer", role: "customer", password: "123456" });
  const vendor = makeUser({ id: 2, email: "vendor@local.test", name: "Demo Vendor", role: "vendor", password: "123456", walletBalance: "1200.00" });
  const admin = makeUser({ id: 3, email: "admin@local.test", name: "Admin User", role: "admin", password: "123456", walletBalance: "5000.00" });
  const delivery = makeUser({ id: 4, email: "delivery@local.test", name: "Delivery Partner", role: "delivery_partner", password: "123456", walletBalance: "900.00" });
  return {
    users: [customer, vendor, admin, delivery],
    categories,
    stores,
    products,
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
    coupons: [
      { id: 1, code: "LOCAL20", title: "20% off", description: "Save 20% up to Rs 150", discountType: "percent", discountValue: "20.00", maxDiscount: "150.00", minOrderValue: "199.00", isActive: true, usedCount: 0 },
      { id: 2, code: "FREESHIP", title: "Free delivery", description: "Flat Rs 49 off delivery", discountType: "fixed", discountValue: "49.00", maxDiscount: "49.00", minOrderValue: "299.00", isActive: true, usedCount: 0 },
    ],
    banners: [
      { id: 1, title: "Mega Savings Festival", subtitle: "Mobiles, fashion, home and grocery deals", imageUrl: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=1200&q=80", href: "/search" },
      { id: 2, title: "Fresh groceries in minutes", subtitle: "Daily essentials from nearby stores", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80", href: "/search?categoryId=2" },
      { id: 3, title: "Seller specials live now", subtitle: "New products, limited stock and fast dispatch", imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80", href: "/search?sort=rating" },
    ],
    nextIds: { user: 4, address: 2, order: 1, cartItem: 1, product: products.length + 1, coupon: 3, review: 2, return: 1 },
  };
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
    return JSON.parse(raw);
  } catch {
    const seeded = initialMockState();
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveMockState(state: MockRecord) {
  window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
}

function publicUser(user: MockRecord) {
  const { password: _password, isActive: _isActive, ...safeUser } = user;
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

function makeMockError(status: number, error: string, method: string, url: string): never {
  const response = new Response(JSON.stringify({ error }), {
    status,
    statusText: error,
    headers: { "content-type": "application/json" },
  });
  throw new ApiError(response, { error }, { method, url });
}

function getTokenUser(state: MockRecord, token: string | null) {
  const id = token?.startsWith("mock-token-") ? Number(token.replace("mock-token-", "")) : NaN;
  return state.users.find((user: MockRecord) => user.id === id) ?? null;
}

function productWithStore(state: MockRecord, product: MockRecord) {
  return {
    ...product,
    category: state.categories.find((category: MockRecord) => category.id === product.categoryId) ?? null,
    store: state.stores.find((store: MockRecord) => store.id === product.storeId) ?? null,
  };
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

function mockTrackingPayload(order: MockRecord) {
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
    deliveryOtp: String(1000 + (order.id % 9000)),
    deliveryPartner: tracking.deliveryPartner ?? null,
    ...locations,
    route: [locations.storeLocation, locations.partnerLocation, locations.customerLocation],
    timeline: tracking.timeline ?? [],
  };
}

function mockMovePartner(order: MockRecord, lat: number, lng: number) {
  order.tracking = order.tracking ?? {};
  order.tracking.partnerLocation = { lat, lng, updatedAt: mockNow() };
  if (order.tracking.deliveryPartner) {
    order.tracking.deliveryPartner.location = { lat, lng, updatedAt: mockNow() };
  }
}

async function tryMockFetch<T>(input: RequestInfo | URL, options: CustomFetchOptions, method: string): Promise<T | undefined> {
  const state = getMockState();
  if (!state) return undefined;
  const urlText = resolveUrl(input);
  const url = new URL(urlText, "http://local-commerce.test");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return undefined;

  const token = _authTokenGetter ? await _authTokenGetter() : null;
  const currentUser = getTokenUser(state, token);
  const body = parseMockBody(options);
  const requireUser = () => currentUser ?? makeMockError(401, "Please login first", method, path);
  const ok = (data: unknown) => data as T;

  if (path === "/api/healthz") return ok({ ok: true, status: "ok" });
  if (path === "/api/auth/register" && method === "POST") {
    if (!body.name || !body.password || (!body.email && !body.phone)) makeMockError(400, "Name, password and email or phone are required", method, path);
    const existing = state.users.find((user: MockRecord) => (body.email && user.email === body.email) || (body.phone && user.phone === body.phone));
    if (existing) makeMockError(400, "User with this email or phone already exists", method, path);
    const user = makeUser({ ...body, id: state.nextIds.user++, role: ["customer", "vendor", "delivery_partner"].includes(body.role) ? body.role : "customer" });
    state.users.push(user);
    state.addresses[String(user.id)] = [];
    saveMockState(state);
    return ok({ token: `mock-token-${user.id}`, user: publicUser(user) });
  }
  if (path === "/api/auth/login" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    if (!user || user.password !== body.password) makeMockError(401, "Invalid credentials. Try customer@local.test / 123456", method, path);
    return ok({ token: `mock-token-${user.id}`, user: publicUser(user) });
  }
  if (path === "/api/auth/otp-login" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    if (!user || body.otp !== "123456") makeMockError(401, "Invalid OTP. Demo OTP is 123456", method, path);
    return ok({ token: `mock-token-${user.id}`, user: publicUser(user) });
  }
  if (path === "/api/auth/forgot-password" && method === "POST") {
    const user = state.users.find((item: MockRecord) => (body.email && item.email === body.email) || (body.phone && item.phone === body.phone));
    if (!user) makeMockError(404, "Account not found", method, path);
    if (body.otp !== "123456" || !body.password || String(body.password).length < 6) makeMockError(400, "Valid OTP and 6-character password required", method, path);
    user.password = body.password;
    user.updatedAt = mockNow();
    saveMockState(state);
    return ok({ message: "Password updated successfully", user: publicUser(user) });
  }
  if (path === "/api/auth/logout" && method === "POST") return ok({ message: "Logged out successfully" });
  if (path === "/api/auth/me") {
    const user = requireUser();
    if (method === "PATCH") {
      Object.assign(user, body, { updatedAt: mockNow() });
      saveMockState(state);
    }
    return ok(publicUser(user));
  }

  if (path === "/api/categories") return ok(state.categories);
  if (path === "/api/stores") {
    const limit = Number(url.searchParams.get("limit") ?? state.stores.length);
    return ok(state.stores.slice(0, limit));
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
    const sort = url.searchParams.get("sort") ?? url.searchParams.get("sortBy") ?? "popular";
    if (q) items = items.filter((item: MockRecord) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
    if (categoryId) items = items.filter((item: MockRecord) => item.categoryId === categoryId);
    if (storeId) items = items.filter((item: MockRecord) => item.storeId === storeId);
    if (featured === "true") items = items.filter((item: MockRecord) => item.isFeatured);
    if (sort === "price_asc") items.sort((a: MockRecord, b: MockRecord) => Number(a.price) - Number(b.price));
    if (sort === "price_desc") items.sort((a: MockRecord, b: MockRecord) => Number(b.price) - Number(a.price));
    if (sort === "rating" || sort === "popular") items.sort((a: MockRecord, b: MockRecord) => Number(b.rating) - Number(a.rating));
    const total = items.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 40);
    return ok({ items: items.slice(offset, offset + limit), total, hasMore: offset + limit < total });
  }
  const productReviewMatch = path.match(/^\/api\/products\/(\d+)\/reviews$/);
  if (productReviewMatch) return ok(state.reviews.filter((item: MockRecord) => item.productId === Number(productReviewMatch[1])));
  const productMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const product = state.products.find((item: MockRecord) => item.id === Number(productMatch[1]));
    if (!product) makeMockError(404, "Product not found", method, path);
    return ok(productWithStore(state, product));
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
    const key = String(user.id);
    const current = state.carts[key] ?? [];
    const sameStore = current.filter((item: MockRecord) => state.products.find((productItem: MockRecord) => productItem.id === item.productId)?.storeId === product.storeId);
    const existing = sameStore.find((item: MockRecord) => item.productId === product.id);
    const requestedQty = Number(body.qty ?? 1);
    if (existing) {
      existing.qty = Math.max(0, requestedQty);
      if (existing.qty === 0) sameStore.splice(sameStore.indexOf(existing), 1);
    } else if (requestedQty > 0) {
      sameStore.push({ id: state.nextIds.cartItem++, productId: product.id, qty: requestedQty, price: product.price });
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
      const address = (state.addresses[String(user.id)] ?? []).find((item: MockRecord) => item.id === Number(body.addressId));
      if (!address) makeMockError(400, "Address not found", method, path);
      const coupon = state.coupons.find((item: MockRecord) => item.code === String(body.couponCode ?? "").toUpperCase());
      const subtotal = Number(cart.subtotal);
      const deliveryFee = Number(cart.deliveryFee);
      const discount = couponDiscount(coupon, subtotal);
      const walletUsed = body.useWallet ? Math.min(Number(user.walletBalance ?? 0), subtotal + deliveryFee - discount) : 0;
      user.walletBalance = (Number(user.walletBalance ?? 0) - walletUsed).toFixed(2);
      const order = {
        id: state.nextIds.order++,
        orderNumber: `LCH${Date.now().toString().slice(-7)}`,
        userId: user.id,
        storeId: cart.storeId,
        store: cart.store,
        addressId: address.id,
        address,
        addressSnapshot: address,
        items: cart.items.map((item: MockRecord) => ({ id: item.id, productId: item.productId, name: item.product.name, imageUrl: item.product.images?.[0], price: item.price, mrp: item.product.mrp, qty: item.qty, total: (Number(item.price) * item.qty).toFixed(2) })),
        status: "confirmed",
        paymentMethod: body.paymentMethod,
        paymentStatus: body.paymentMethod === "cod" ? "pending" : "paid",
        subtotal: subtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        couponCode: coupon?.code ?? null,
        couponDiscount: discount.toFixed(2),
        walletUsed: walletUsed.toFixed(2),
        total: Math.max(0, subtotal + deliveryFee - discount - walletUsed).toFixed(2),
        loyaltyPointsEarned: Math.floor(subtotal / 10),
        estimatedDeliveryMins: 40,
        createdAt: mockNow(),
        tracking: {
          orderId: 0,
          status: "confirmed",
          estimatedMins: 40,
          deliveryPartner: {
            id: 4,
            name: "Rahul Das",
            phone: "9000000000",
            vehicleType: "bike",
            vehicleNumber: "WB 20 LC 1024",
            rating: "4.8",
            photoUrl: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=160&q=80",
            location: { lat: Number(cart.store?.lat ?? 22.5726) + 0.006, lng: Number(cart.store?.lng ?? 88.3639) + 0.004 },
          },
          partnerLocation: { lat: Number(cart.store?.lat ?? 22.5726) + 0.006, lng: Number(cart.store?.lng ?? 88.3639) + 0.004 },
          timeline: [
            { status: "confirmed", message: "Order confirmed and delivery partner assigned", updatedAt: mockNow() },
            { status: "pending", message: "Order placed", updatedAt: mockNow() },
          ],
        },
      };
      order.tracking.orderId = order.id;
      state.orders.unshift(order);
      state.carts[String(user.id)] = [];
      state.notifications[String(user.id)] = [{ id: Date.now(), title: "Order confirmed", body: `Order #${order.orderNumber} is confirmed.`, isRead: false, createdAt: mockNow() }, ...(state.notifications[String(user.id)] ?? [])];
      saveMockState(state);
      return ok(order);
    }
    return ok(state.orders.filter((order: MockRecord) => currentUser?.role === "admin" || order.userId === user.id));
  }
  const orderCancelMatch = path.match(/^\/api\/orders\/(\d+)\/cancel$/);
  if (orderCancelMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderCancelMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    order.status = "cancelled";
    order.cancellationReason = body.reason ?? "Cancelled by customer";
    order.tracking.timeline.unshift({ status: "cancelled", message: order.cancellationReason, updatedAt: mockNow() });
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
    return ok(mockTrackingPayload(order));
  }
  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(orderMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    return ok(order);
  }

  if (path === "/api/coupons" || path === "/api/admin/coupons") return ok(state.coupons);
  if (path === "/api/coupons/validate" && method === "POST") {
    const coupon = state.coupons.find((item: MockRecord) => item.code === String(body.code ?? "").toUpperCase() && item.isActive);
    if (!coupon) makeMockError(400, "Invalid coupon", method, path);
    const discount = couponDiscount(coupon, Number(body.orderValue ?? body.orderTotal ?? 0));
    if (discount <= 0) makeMockError(400, `Minimum order value is Rs ${coupon.minOrderValue}`, method, path);
    return ok({ valid: true, code: coupon.code, discount: discount.toFixed(2), message: "Coupon applied" });
  }
  if (path === "/api/admin/coupons" && method === "POST") {
    const coupon = { id: state.nextIds.coupon++, usedCount: 0, isActive: true, ...body };
    state.coupons.unshift(coupon);
    saveMockState(state);
    return ok(coupon);
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
    const store = state.stores.find((item: MockRecord) => item.ownerId === user.id) ?? state.stores[0];
    if (method === "PATCH") {
      Object.assign(store, body);
      saveMockState(state);
    }
    return ok({ ...store, products: state.products.filter((item: MockRecord) => item.storeId === store.id) });
  }
  if (path === "/api/vendor/products") {
    const user = requireUser();
    const store = state.stores.find((item: MockRecord) => item.ownerId === user.id) ?? state.stores[0];
    if (method === "POST") {
      const product = {
        id: state.nextIds.product++,
        storeId: store.id,
        rating: "4.1",
        reviewCount: 0,
        discountPercent: body.mrp && body.price ? Math.max(0, Math.round(((Number(body.mrp) - Number(body.price)) / Number(body.mrp)) * 100)) : 0,
        stock: Number(body.stock ?? body.stockQty ?? 0),
        stockQty: Number(body.stock ?? body.stockQty ?? 0),
        isAvailable: body.isAvailable ?? true,
        isFeatured: body.isFeatured ?? false,
        createdAt: mockNow(),
        ...body,
      };
      state.products.unshift(product);
      saveMockState(state);
      return ok(product);
    }
    return ok(state.products.filter((item: MockRecord) => item.storeId === store.id));
  }
  const vendorProductMatch = path.match(/^\/api\/vendor\/products\/(\d+)$/);
  if (vendorProductMatch) {
    const user = requireUser();
    const store = state.stores.find((item: MockRecord) => item.ownerId === user.id) ?? state.stores[0];
    const productId = Number(vendorProductMatch[1]);
    const product = state.products.find((item: MockRecord) => item.id === productId && item.storeId === store.id);
    if (!product) makeMockError(404, "Product not found in your store", method, path);
    if (method === "DELETE") {
      state.products = state.products.filter((item: MockRecord) => item.id !== productId);
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
    const store = state.stores.find((item: MockRecord) => item.ownerId === user.id) ?? state.stores[0];
    const status = url.searchParams.get("status");
    let orders = state.orders.filter((order: MockRecord) => order.storeId === store.id);
    if (status) orders = orders.filter((order: MockRecord) => order.status === status);
    return ok(orders);
  }
  const vendorOrderStatusMatch = path.match(/^\/api\/vendor\/orders\/(\d+)\/status$/);
  if (vendorOrderStatusMatch) {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(vendorOrderStatusMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    order.status = body.status ?? order.status;
    order.tracking.status = order.status;
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
    order.tracking.timeline.unshift({ status: order.status, message: `Order ${order.status}`, updatedAt: mockNow() });
    saveMockState(state);
    return ok(order);
  }
  if (path === "/api/vendor/dashboard") {
    const user = requireUser();
    const store = state.stores.find((item: MockRecord) => item.ownerId === user.id) ?? state.stores[0];
    const orders = state.orders.filter((order: MockRecord) => order.storeId === store.id);
    const products = state.products.filter((item: MockRecord) => item.storeId === store.id);
    const revenue = orders.reduce((sum: number, order: MockRecord) => sum + Number(order.total), 0);
    return ok({
      todayOrders: orders.length,
      todayRevenue: revenue.toFixed(2),
      weekRevenue: (revenue * 1.8).toFixed(2),
      monthRevenue: (revenue * 4.3).toFixed(2),
      pendingOrders: orders.filter((order: MockRecord) => !["delivered", "cancelled"].includes(order.status)).length,
      lowStockProducts: products.filter((product: MockRecord) => Number(product.stock ?? product.stockQty ?? 0) <= 5).length,
      totalProducts: products.length,
      recentOrders: orders.slice(0, 5),
    });
  }

  if (path === "/api/admin/dashboard") {
    return ok({ totalUsers: state.users.length, totalStores: state.stores.length, totalOrders: state.orders.length, totalRevenue: state.orders.reduce((sum: number, order: MockRecord) => sum + Number(order.total), 0).toFixed(2), pendingStores: 0 });
  }
  if (path === "/api/admin/users") return ok(state.users.map(publicUser));
  if (path === "/api/admin/orders") return ok(state.orders);
  if (path === "/api/admin/stores") return ok(state.stores);
  if (path === "/api/admin/banners") return ok(state.banners);
  if (path === "/api/delivery/orders") {
    requireUser();
    return ok(state.orders.filter((order: MockRecord) => !["cancelled", "delivered"].includes(order.status)));
  }
  if (path === "/api/delivery/available-orders") {
    requireUser();
    return ok(state.orders.filter((order: MockRecord) => ["confirmed", "packed"].includes(order.status)));
  }
  if (path === "/api/delivery/location") {
    requireUser();
    const location = { lat: Number(body.lat ?? 22.5726), lng: Number(body.lng ?? 88.3639), updatedAt: mockNow() };
    state.orders.forEach((order: MockRecord) => {
      if (!["cancelled", "delivered"].includes(order.status)) mockMovePartner(order, location.lat, location.lng);
    });
    saveMockState(state);
    return ok({ message: "Location updated" });
  }
  const deliveryAcceptMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/accept$/);
  if (deliveryAcceptMatch && method === "POST") {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryAcceptMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    order.status = order.status === "confirmed" ? "packed" : order.status;
    order.tracking.status = order.status;
    order.tracking.timeline.unshift({ status: order.status, message: "Delivery partner accepted the order", updatedAt: mockNow() });
    saveMockState(state);
    return ok(order);
  }
  const deliveryRejectMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/reject$/);
  if (deliveryRejectMatch && method === "POST") {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryRejectMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    order.tracking.timeline.unshift({ status: order.status, message: "Delivery partner rejected the order", updatedAt: mockNow() });
    saveMockState(state);
    return ok({ message: "Order rejected" });
  }
  const deliveryStatusMatch = path.match(/^\/api\/delivery\/orders\/(\d+)\/status$/);
  if (deliveryStatusMatch && method === "PATCH") {
    requireUser();
    const order = state.orders.find((item: MockRecord) => item.id === Number(deliveryStatusMatch[1]));
    if (!order) makeMockError(404, "Order not found", method, path);
    order.status = body.status ?? order.status;
    order.tracking.status = order.status;
    const locations = mockOrderLocations(order);
    if (order.status === "picked_up") mockMovePartner(order, locations.storeLocation.lat + 0.01, locations.storeLocation.lng + 0.012);
    if (order.status === "on_the_way") mockMovePartner(order, (locations.storeLocation.lat + locations.customerLocation.lat) / 2, (locations.storeLocation.lng + locations.customerLocation.lng) / 2);
    if (order.status === "delivered") mockMovePartner(order, locations.customerLocation.lat, locations.customerLocation.lng);
    order.tracking.timeline.unshift({ status: order.status, message: `Delivery partner marked ${String(order.status).replace(/_/g, " ")}`, updatedAt: mockNow() });
    saveMockState(state);
    return ok(order);
  }
  if (path === "/api/delivery/toggle-online") {
    const user = requireUser();
    user.isOnline = !user.isOnline;
    saveMockState(state);
    return ok({ message: user.isOnline ? "You are online" : "You are offline" });
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
