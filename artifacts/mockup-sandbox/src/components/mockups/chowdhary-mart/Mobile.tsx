import React, { useState, useEffect } from "react";
import {
  MapPin, Search, ShoppingCart, ChevronDown, ShoppingBag,
  Smartphone, Shirt, Headphones, Sofa, Sparkles, Pill, Carrot,
  Book, Star, Home as HomeIcon, LayoutGrid, FileText, User,
  Zap, Plus, Minus, Heart, Bell, ArrowLeft, ChevronRight,
  Package, Truck, CheckCircle, Clock, X, Tag, Wallet,
  Gift, Share2, Download, RotateCcw, RefreshCw, Phone,
  Settings, LogOut, MapPinned, CreditCard, Percent, Award,
  Filter, SlidersHorizontal, Eye, ShieldCheck, Store,
  Navigation, ChevronUp, Info, AlertCircle, Check, Copy,
  Bike, MessageSquare, Camera, Mic, Image as ImageIcon,
  TrendingUp, Flame, BadgePercent, Layers, Users, Globe
} from "lucide-react";

type Screen =
  | "home" | "search" | "product" | "cart" | "wishlist"
  | "orders" | "tracking" | "account" | "categories"
  | "notifications" | "addresses" | "wallet" | "coupons"
  | "referral" | "loyalty" | "vendor-stores" | "order-detail";

interface Product {
  id: number;
  name: string;
  brand: string;
  price: number;
  mrp: number;
  rating: number;
  reviews: number;
  weight: string;
  image: string;
  category: string;
  discount: number;
  inCart?: boolean;
  qty?: number;
  inWishlist?: boolean;
}

const PRODUCTS: Product[] = [
  { id: 1, name: "Amul Butter Pasteurised", brand: "Amul", price: 55, mrp: 60, rating: 4.7, reviews: 2341, weight: "100 g", image: "/__mockup/images/vegetables.png", category: "Grocery", discount: 8 },
  { id: 2, name: "Tata Salt Vacuum Evaporated", brand: "Tata", price: 22, mrp: 24, rating: 4.5, reviews: 8921, weight: "1 kg", image: "/__mockup/images/vegetables.png", category: "Grocery", discount: 8 },
  { id: 3, name: "Aashirvaad Atta Whole Wheat", brand: "ITC", price: 245, mrp: 275, rating: 4.6, reviews: 5120, weight: "5 kg", image: "/__mockup/images/vegetables.png", category: "Grocery", discount: 11 },
  { id: 4, name: "OnePlus Nord CE 3 Lite", brand: "OnePlus", price: 17999, mrp: 19999, rating: 4.3, reviews: 1450, weight: "1 unit", image: "/__mockup/images/smartphone.png", category: "Mobiles", discount: 10 },
  { id: 5, name: "Samsung Galaxy A34 5G", brand: "Samsung", price: 26999, mrp: 30999, rating: 4.4, reviews: 3200, weight: "1 unit", image: "/__mockup/images/smartphone.png", category: "Mobiles", discount: 13 },
  { id: 6, name: "Maggi 2-Minute Noodles", brand: "Nestle", price: 140, mrp: 156, rating: 4.5, reviews: 12500, weight: "12 pack", image: "/__mockup/images/vegetables.png", category: "Grocery", discount: 10 },
  { id: 7, name: "Colgate MaxFresh Gel", brand: "Colgate", price: 108, mrp: 130, rating: 4.4, reviews: 3400, weight: "150 g", image: "/__mockup/images/vegetables.png", category: "Beauty", discount: 17 },
  { id: 8, name: "Dove Beauty Bathing Bar", brand: "Dove", price: 98, mrp: 115, rating: 4.6, reviews: 6700, weight: "100 g × 3", image: "/__mockup/images/vegetables.png", category: "Beauty", discount: 15 },
];

const CATEGORIES = [
  { name: "Grocery", icon: <ShoppingCart className="w-6 h-6 text-orange-600" />, color: "bg-orange-100", count: 240 },
  { name: "Mobiles", icon: <Smartphone className="w-6 h-6 text-blue-600" />, color: "bg-blue-100", count: 85 },
  { name: "Fashion", icon: <Shirt className="w-6 h-6 text-pink-600" />, color: "bg-pink-100", count: 520 },
  { name: "Electronics", icon: <Headphones className="w-6 h-6 text-purple-600" />, color: "bg-purple-100", count: 130 },
  { name: "Pharmacy", icon: <Pill className="w-6 h-6 text-teal-600" />, color: "bg-teal-100", count: 310 },
  { name: "Vegetables", icon: <Carrot className="w-6 h-6 text-emerald-600" />, color: "bg-emerald-100", count: 95 },
  { name: "Beauty", icon: <Sparkles className="w-6 h-6 text-rose-600" />, color: "bg-rose-100", count: 200 },
  { name: "Stationery", icon: <Book className="w-6 h-6 text-indigo-600" />, color: "bg-indigo-100", count: 75 },
  { name: "Furniture", icon: <Sofa className="w-6 h-6 text-amber-600" />, color: "bg-amber-100", count: 60 },
  { name: "Appliances", icon: <Zap className="w-6 h-6 text-yellow-600" />, color: "bg-yellow-100", count: 90 },
];

const ORDERS = [
  {
    id: "ORD-8821034",
    date: "15 Jun 2026",
    status: "Delivered",
    statusColor: "text-emerald-600",
    statusBg: "bg-emerald-50",
    items: ["Amul Butter × 2", "Tata Salt × 1", "Maggi Noodles × 1"],
    total: 272,
    deliveredOn: "15 Jun, 2:45 PM",
    store: "Fresh Basket, Sector 15",
    canReturn: true,
    canReorder: true,
  },
  {
    id: "ORD-8809217",
    date: "10 Jun 2026",
    status: "Delivered",
    statusColor: "text-emerald-600",
    statusBg: "bg-emerald-50",
    items: ["OnePlus Nord CE 3 Lite × 1"],
    total: 17999,
    deliveredOn: "11 Jun, 11:20 AM",
    store: "Tech Hub, Sector 18",
    canReturn: true,
    canReorder: false,
  },
  {
    id: "ORD-8791002",
    date: "2 Jun 2026",
    status: "Cancelled",
    statusColor: "text-red-500",
    statusBg: "bg-red-50",
    items: ["Aashirvaad Atta × 1", "Colgate MaxFresh × 2"],
    total: 461,
    deliveredOn: "",
    store: "Daily Needs Store",
    canReturn: false,
    canReorder: true,
  },
];

const COUPONS = [
  { code: "CHOW10", desc: "10% off on orders above ₹299", discount: "10%", validity: "30 Jun 2026", color: "from-orange-500 to-orange-600" },
  { code: "FIRST50", desc: "₹50 off on your first order", discount: "₹50", validity: "31 Dec 2026", color: "from-blue-800 to-blue-900" },
  { code: "PHARMA20", desc: "20% off on pharmacy orders", discount: "20%", validity: "20 Jun 2026", color: "from-teal-600 to-teal-700" },
  { code: "WELCOME15", desc: "15% off on grocery orders", discount: "15%", validity: "15 Jul 2026", color: "from-indigo-600 to-indigo-700" },
];

const WALLET_TXNS = [
  { type: "credit", desc: "Refund for ORD-8791002", amount: 461, date: "3 Jun 2026" },
  { type: "debit", desc: "ORD-8809217 payment", amount: 17999, date: "10 Jun 2026" },
  { type: "credit", desc: "Referral bonus", amount: 100, date: "5 Jun 2026" },
  { type: "credit", desc: "Loyalty points redeemed", amount: 50, date: "7 Jun 2026" },
  { type: "debit", desc: "ORD-8821034 payment", amount: 272, date: "15 Jun 2026" },
];

const NOTIFS = [
  { icon: <Truck className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50", title: "Order Delivered!", body: "Your order ORD-8821034 has been delivered. Rate your experience!", time: "2h ago", unread: true },
  { icon: <BadgePercent className="w-5 h-5 text-orange-600" />, bg: "bg-orange-50", title: "Flash Sale Starts Now!", body: "Up to 60% off on Electronics. Limited time only!", time: "4h ago", unread: true },
  { icon: <Wallet className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-50", title: "Wallet Credited", body: "₹461 refunded to your Chowdhary Wallet for cancelled order.", time: "Yesterday", unread: false },
  { icon: <Gift className="w-5 h-5 text-pink-600" />, bg: "bg-pink-50", title: "Referral Bonus!", body: "Your friend Rahul joined using your referral. ₹100 added to wallet!", time: "3 days ago", unread: false },
  { icon: <Tag className="w-5 h-5 text-purple-600" />, bg: "bg-purple-50", title: "New Coupon Unlocked", body: "PHARMA20 — 20% off on pharmacy orders. Valid till 20 Jun.", time: "5 days ago", unread: false },
];

const ADDRESSES = [
  { id: 1, label: "Home", name: "Rajesh Chowdhary", line: "A-42, Sunshine Apartments, Sector 15, Noida, UP - 201301", phone: "9876543210", default: true },
  { id: 2, label: "Office", name: "Rajesh Chowdhary", line: "DLF Cyber Hub, Building 9, Gurugram, HR - 122002", phone: "9876543210", default: false },
];

const TRACKING_STEPS = [
  { label: "Order Placed", done: true, time: "2:10 PM" },
  { label: "Store Confirmed", done: true, time: "2:12 PM" },
  { label: "Preparing Order", done: true, time: "2:18 PM" },
  { label: "Packed & Ready", done: true, time: "2:28 PM" },
  { label: "Picked Up by Rider", done: true, time: "2:32 PM" },
  { label: "On the Way", done: true, time: "2:35 PM" },
  { label: "Arriving Soon", done: false, time: "" },
  { label: "Delivered", done: false, time: "" },
];

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const sz = size === "xs" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`${sz} ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"}`} />
      ))}
    </div>
  );
}

function ProductCard({ product, onTap, onAddCart, onToggleWishlist }: {
  product: Product;
  onTap: () => void;
  onAddCart: (id: number) => void;
  onToggleWishlist: (id: number) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col relative overflow-hidden" onClick={onTap}>
      <button
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
        onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }}
      >
        <Heart className={`w-4 h-4 ${product.inWishlist ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
      </button>
      <div className="absolute top-2 left-2 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{product.discount}% OFF</div>
      <div className="h-24 flex items-center justify-center p-2 bg-slate-50 rounded-t-xl">
        <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain mix-blend-multiply" />
      </div>
      <div className="p-2.5 flex flex-col flex-1">
        <div className="text-[9px] text-slate-500 mb-0.5 font-medium uppercase tracking-wide">{product.brand}</div>
        <h4 className="font-semibold text-slate-800 text-[11px] leading-tight line-clamp-2 mb-1 flex-1">{product.name}</h4>
        <div className="text-[9px] text-slate-400 mb-1.5">{product.weight}</div>
        <div className="flex items-center gap-1 mb-2">
          <StarRating rating={product.rating} size="xs" />
          <span className="text-[9px] text-slate-400">({product.reviews.toLocaleString()})</span>
        </div>
        <div className="flex items-center gap-1 mb-2">
          <span className="font-bold text-slate-900 text-sm">₹{product.price}</span>
          <span className="text-[10px] text-slate-400 line-through">₹{product.mrp}</span>
        </div>
        <button
          className="w-full py-1.5 rounded-lg bg-blue-900 text-white text-xs font-bold"
          onClick={(e) => { e.stopPropagation(); onAddCart(product.id); }}
        >
          {product.inCart ? "Added ✓" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

export function Mobile() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeTab, setActiveTab] = useState<"home" | "categories" | "orders" | "account">("home");
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<typeof ORDERS[0] | null>(null);
  const [cartItems, setCartItems] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [notifCount] = useState(2);
  const [walletBalance] = useState(611);
  const [loyaltyPoints] = useState(1240);
  const [selectedImg, setSelectedImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [timerSecs, setTimerSecs] = useState(3 * 3600 + 42 * 60 + 17);
  const [darkMode] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTimerSecs(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % 3), 3500);
    return () => clearInterval(t);
  }, []);

  const formatTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const addToCart = (id: number) => {
    setProducts(ps => ps.map(p => p.id === id ? { ...p, inCart: true, qty: (p.qty || 0) + 1 } : p));
    setCartItems(prev => {
      const exists = prev.find(p => p.id === id);
      if (exists) return prev.map(p => p.id === id ? { ...p, qty: (p.qty || 1) + 1 } : p);
      const prod = products.find(p => p.id === id);
      if (prod) return [...prev, { ...prod, qty: 1, inCart: true }];
      return prev;
    });
  };

  const toggleWishlist = (id: number) => {
    setProducts(ps => ps.map(p => p.id === id ? { ...p, inWishlist: !p.inWishlist } : p));
  };

  const changeCartQty = (id: number, delta: number) => {
    setCartItems(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, qty: Math.max(0, (p.qty || 1) + delta) } : p);
      return updated.filter(p => (p.qty || 0) > 0);
    });
  };

  const cartTotal = cartItems.reduce((s, p) => s + p.price * (p.qty || 1), 0);
  const cartDiscount = appliedCoupon === "CHOW10" ? Math.round(cartTotal * 0.1) : appliedCoupon === "FIRST50" ? 50 : 0;
  const cartFinal = Math.max(0, cartTotal - cartDiscount + (cartTotal > 299 ? 0 : 49));
  const wishlistItems = products.filter(p => p.inWishlist);
  const filteredProducts = searchQuery.length > 1
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.brand.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const navTo = (s: Screen, tab?: "home" | "categories" | "orders" | "account") => {
    setScreen(s);
    if (tab) setActiveTab(tab);
  };

  const banners = [
    { title: "Grocery Sale", sub: "Up to 40% off on daily essentials", cta: "Shop Now", bg: "from-orange-500 to-orange-700", img: "/__mockup/images/chowdhary-banner.png" },
    { title: "Electronics Fest", sub: "Latest gadgets at unbeatable prices", cta: "Explore", bg: "from-blue-800 to-indigo-900", img: "/__mockup/images/smartphone.png" },
    { title: "Fresh Vegetables", sub: "Farm to door in 12 minutes", cta: "Order Now", bg: "from-emerald-600 to-teal-700", img: "/__mockup/images/vegetables.png" },
  ];

  // ─── Screens ───────────────────────────────────────────────────────────────

  const HomeScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Delivery Banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2 flex items-center justify-center gap-2 text-white text-xs font-bold">
        <Zap className="w-3.5 h-3.5 fill-white" />
        Delivery in 12 minutes — Stores within 5 km
      </div>

      {/* Hero Carousel */}
      <div className="px-3 pt-3 pb-2">
        <div className={`bg-gradient-to-br ${banners[bannerIdx].bg} rounded-2xl p-4 relative overflow-hidden h-36 shadow-md`}>
          <div className="absolute -right-8 -top-8 w-28 h-28 bg-white/10 rounded-full blur-xl" />
          <div className="relative z-10">
            <div className="text-white/70 text-[10px] font-semibold uppercase tracking-widest mb-1">Featured</div>
            <h2 className="text-white text-xl font-black mb-1 leading-tight">{banners[bannerIdx].title}</h2>
            <p className="text-white/80 text-xs mb-3">{banners[bannerIdx].sub}</p>
            <button className="bg-white text-blue-900 text-xs font-bold px-4 py-1.5 rounded-full shadow">{banners[bannerIdx].cta}</button>
          </div>
          <img src={banners[bannerIdx].img} alt="banner" className="absolute right-2 bottom-0 h-28 object-contain opacity-60 mix-blend-luminosity" />
        </div>
        <div className="flex justify-center gap-1.5 mt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === bannerIdx ? "bg-orange-500 w-5" : "bg-slate-300 w-1.5"}`} />
          ))}
        </div>
      </div>

      {/* Offer Strip */}
      <div className="mx-3 mb-3 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 flex items-center gap-2">
        <Tag className="w-4 h-4 text-yellow-600 shrink-0" />
        <span className="text-xs font-semibold text-yellow-800">Use <span className="font-black">CHOW10</span> for 10% off · Free delivery on orders above ₹299</span>
      </div>

      {/* Categories */}
      <div className="px-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 text-base">Shop by Category</h3>
          <button className="text-xs font-bold text-orange-600" onClick={() => navTo("categories", "categories")}>See all</button>
        </div>
        <div className="grid grid-cols-5 gap-y-3">
          {CATEGORIES.slice(0, 10).map((cat, i) => (
            <div key={i} className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => navTo("categories", "categories")}>
              <div className={`w-12 h-12 rounded-xl ${cat.color} flex items-center justify-center shadow-sm`}>{cat.icon}</div>
              <span className="text-[9px] font-semibold text-slate-700 text-center leading-tight">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flash Sale */}
      <div className="px-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <h3 className="font-bold text-slate-800 text-base">Flash Sale</h3>
          </div>
          <div className="flex items-center gap-1 bg-slate-900 text-white text-xs font-mono font-bold px-2 py-1 rounded-lg">
            <Clock className="w-3 h-3" />{formatTimer(timerSecs)}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
          {products.filter(p => p.discount >= 10).map(product => (
            <div key={product.id} className="min-w-[120px] max-w-[120px] shrink-0">
              <ProductCard
                product={product}
                onTap={() => { setSelectedProduct(product); setScreen("product"); setSelectedImg(0); setQty(1); }}
                onAddCart={addToCart}
                onToggleWishlist={toggleWishlist}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Nearby Stores */}
      <div className="px-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <MapPinned className="w-4 h-4 text-blue-800" />
            <h3 className="font-bold text-slate-800 text-base">Stores Near You</h3>
          </div>
          <button className="text-xs font-bold text-orange-600" onClick={() => navTo("vendor-stores")}>See all</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
          {[
            { name: "Fresh Basket", dist: "0.6 km", time: "8 min", rating: 4.8, open: true, type: "Grocery & Dairy" },
            { name: "Daily Needs", dist: "1.2 km", time: "11 min", rating: 4.5, open: true, type: "Grocery & More" },
            { name: "Tech Hub", dist: "2.1 km", time: "15 min", rating: 4.6, open: false, type: "Electronics" },
          ].map((store, i) => (
            <div key={i} className="min-w-[150px] max-w-[150px] bg-white rounded-xl p-3 border border-slate-100 shadow-sm shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Store className="w-4 h-4 text-orange-600" />
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${store.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{store.open ? "OPEN" : "CLOSED"}</span>
              </div>
              <div className="font-bold text-slate-800 text-xs mb-0.5">{store.name}</div>
              <div className="text-[10px] text-slate-500 mb-1">{store.type}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="text-[10px] font-semibold text-slate-700">{store.rating}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <MapPin className="w-3 h-3" />{store.dist}
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-700 font-semibold">
                <Clock className="w-3 h-3" /> {store.time} delivery
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending Products */}
      <div className="px-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <h3 className="font-bold text-slate-800 text-base">Trending Now</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {products.slice(0, 6).map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onTap={() => { setSelectedProduct(product); setScreen("product"); setSelectedImg(0); setQty(1); }}
              onAddCart={addToCart}
              onToggleWishlist={toggleWishlist}
            />
          ))}
        </div>
      </div>

      {/* Loyalty Banner */}
      <div className="mx-3 mb-4 bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl p-4 text-white flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Award className="w-6 h-6 text-yellow-300" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-sm">You have {loyaltyPoints} points!</div>
          <div className="text-xs text-white/80">Redeem for ₹{Math.floor(loyaltyPoints / 10)} off your next order</div>
        </div>
        <button className="bg-white text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full" onClick={() => navTo("loyalty")}>Redeem</button>
      </div>

      {/* Bottom space */}
      <div className="h-4" />
    </div>
  );

  const SearchScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-3 py-3 sticky top-0 bg-white z-10 border-b border-slate-100">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products, brands, categories..."
            className="w-full bg-slate-100 pl-9 pr-10 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
            <Mic className="w-4 h-4 text-orange-500" />
            <Camera className="w-4 h-4 text-slate-400" />
          </div>
        </div>
        {searchQuery && (
          <div className="flex items-center gap-2 mt-2 overflow-x-auto scrollbar-hide">
            {["All", "Grocery", "Mobiles", "Beauty", "Electronics"].map(f => (
              <button key={f} className="shrink-0 px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">{f}</button>
            ))}
          </div>
        )}
      </div>

      {!searchQuery ? (
        <div className="px-3 pt-3">
          <h4 className="font-bold text-slate-700 text-sm mb-2">Popular Searches</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            {["Amul Butter", "OnePlus", "Atta 5kg", "Colgate", "Samsung", "Maggi", "Dove Soap", "Aashirvaad"].map(s => (
              <button key={s} onClick={() => setSearchQuery(s)} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-full border border-slate-200">
                {s}
              </button>
            ))}
          </div>
          <h4 className="font-bold text-slate-700 text-sm mb-2">Browse Categories</h4>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat, i) => (
              <div key={i} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                <div className={`w-8 h-8 rounded-lg ${cat.color} flex items-center justify-center`}>{React.cloneElement(cat.icon as React.ReactElement, { className: "w-4 h-4" })}</div>
                <div>
                  <div className="font-semibold text-slate-800 text-xs">{cat.name}</div>
                  <div className="text-[9px] text-slate-400">{cat.count} products</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <Search className="w-12 h-12 text-slate-200 mb-3" />
          <div className="font-bold text-slate-700 mb-1">No results for "{searchQuery}"</div>
          <div className="text-sm text-slate-400">Try searching for something else</div>
        </div>
      ) : (
        <div className="px-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">{filteredProducts.length} results</span>
            <button className="flex items-center gap-1 text-xs font-semibold text-slate-700 border border-slate-200 px-2 py-1 rounded-lg">
              <SlidersHorizontal className="w-3 h-3" /> Filter
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onTap={() => { setSelectedProduct(product); setScreen("product"); setSelectedImg(0); setQty(1); }}
                onAddCart={addToCart}
                onToggleWishlist={toggleWishlist}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const ProductScreen = () => {
    if (!selectedProduct) return null;
    const variants = ["Standard", "Premium", "Value Pack"];
    const reviews = [
      { name: "Priya M.", rating: 5, text: "Excellent quality, very fresh. Delivered in just 10 mins!", time: "2 days ago" },
      { name: "Rohit K.", rating: 4, text: "Good product but packaging could be better. Overall satisfied.", time: "1 week ago" },
      { name: "Sunita P.", rating: 5, text: "Always buy from Chowdhary Mart. Best prices and super fast!", time: "2 weeks ago" },
    ];
    return (
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Image Gallery */}
        <div className="relative bg-slate-50">
          <div className="h-52 flex items-center justify-center p-6">
            <img src={selectedProduct.image} alt={selectedProduct.name} className="max-h-full max-w-full object-contain mix-blend-multiply" />
          </div>
          <button className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center" onClick={() => toggleWishlist(selectedProduct.id)}>
            <Heart className={`w-4 h-4 ${selectedProduct.inWishlist ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
          </button>
          <button className="absolute top-3 right-14 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center">
            <Share2 className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex gap-1.5 justify-center pb-3">
            {[0, 1, 2].map(i => (
              <div key={i} onClick={() => setSelectedImg(i)} className={`w-10 h-10 border-2 rounded-lg overflow-hidden cursor-pointer ${selectedImg === i ? "border-orange-500" : "border-slate-200"}`}>
                <img src={selectedProduct.image} alt="" className="w-full h-full object-contain mix-blend-multiply p-1" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 pt-3">
          {/* Brand + Name */}
          <div className="text-xs text-orange-600 font-bold uppercase tracking-wider mb-1">{selectedProduct.brand}</div>
          <h2 className="font-black text-slate-900 text-base leading-snug mb-2">{selectedProduct.name}</h2>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {selectedProduct.rating} <Star className="w-3 h-3 fill-white" />
            </div>
            <span className="text-xs text-slate-500">{selectedProduct.reviews.toLocaleString()} ratings</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-blue-700 font-semibold">Verified</span>
          </div>

          {/* Price */}
          <div className="flex items-end gap-2 mb-3">
            <span className="text-2xl font-black text-slate-900">₹{selectedProduct.price}</span>
            <span className="text-sm text-slate-400 line-through mb-0.5">₹{selectedProduct.mrp}</span>
            <span className="text-sm font-bold text-green-600 mb-0.5">{selectedProduct.discount}% off</span>
          </div>

          {/* Variants */}
          <div className="mb-4">
            <div className="text-xs font-bold text-slate-700 mb-2">Select Variant</div>
            <div className="flex gap-2">
              {variants.map((v, i) => (
                <button key={i} onClick={() => setSelectedVariant(i)} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${selectedVariant === i ? "border-blue-900 bg-blue-900 text-white" : "border-slate-200 text-slate-700"}`}>{v}</button>
              ))}
            </div>
          </div>

          {/* Delivery Info */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-600 shrink-0 fill-emerald-600" />
            <div>
              <div className="text-xs font-bold text-emerald-800">Express Delivery Available</div>
              <div className="text-[10px] text-emerald-700">Delivered in <span className="font-bold">12 minutes</span> from Fresh Basket (0.6 km)</div>
            </div>
          </div>

          {/* Offers */}
          <div className="mb-4">
            <div className="font-bold text-slate-800 text-sm mb-2">Available Offers</div>
            <div className="space-y-2">
              {[
                { icon: <CreditCard className="w-3.5 h-3.5 text-blue-600" />, text: "10% instant discount on HDFC Bank Credit Cards" },
                { icon: <Tag className="w-3.5 h-3.5 text-green-600" />, text: "Use CHOW10 for extra 10% off (max ₹50)" },
                { icon: <Wallet className="w-3.5 h-3.5 text-purple-600" />, text: "Earn ₹5 cashback in Chowdhary Wallet" },
              ].map((offer, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  {offer.icon}<span>{offer.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Specifications */}
          <div className="mb-4">
            <div className="font-bold text-slate-800 text-sm mb-2">Specifications</div>
            <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              {[["Brand", selectedProduct.brand], ["Weight", selectedProduct.weight], ["Category", selectedProduct.category], ["Sold by", "Fresh Basket · 4.8★"], ["Returns", "7 day easy returns"]].map(([k, v], i) => (
                <div key={i} className={`flex px-3 py-2 text-xs ${i % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
                  <span className="text-slate-500 w-28 shrink-0">{k}</span>
                  <span className="font-medium text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-slate-800 text-sm">Customer Reviews</div>
              <div className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                {selectedProduct.rating} <Star className="w-3 h-3 fill-white" />
              </div>
            </div>
            <div className="space-y-3">
              {reviews.map((r, i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-800">{r.name}</span>
                    <span className="text-[10px] text-slate-400">{r.time}</span>
                  </div>
                  <StarRating rating={r.rating} size="xs" />
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related Products */}
          <div className="mb-4">
            <div className="font-bold text-slate-800 text-sm mb-2">You May Also Like</div>
            <div className="flex gap-2 overflow-x-auto -mx-3 px-3 scrollbar-hide pb-1">
              {products.filter(p => p.id !== selectedProduct.id).slice(0, 4).map(p => (
                <div key={p.id} className="min-w-[110px] max-w-[110px] shrink-0">
                  <ProductCard
                    product={p}
                    onTap={() => { setSelectedProduct(p); setSelectedImg(0); setQty(1); window.scrollTo(0, 0); }}
                    onAddCart={addToCart}
                    onToggleWishlist={toggleWishlist}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] bg-white border-t border-slate-100 px-3 py-3 z-50 flex gap-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-9 h-10 flex items-center justify-center text-slate-600"><Minus className="w-3.5 h-3.5" /></button>
            <span className="w-7 text-center font-bold text-sm">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} className="w-9 h-10 flex items-center justify-center text-slate-600"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <button className="flex-1 bg-orange-50 border border-orange-200 text-orange-600 font-bold text-sm py-2.5 rounded-xl" onClick={() => addToCart(selectedProduct.id)}>
            Add to Cart
          </button>
          <button className="flex-1 bg-blue-900 text-white font-bold text-sm py-2.5 rounded-xl">
            Buy Now
          </button>
        </div>
      </div>
    );
  };

  const CartScreen = () => (
    <div className="flex-1 overflow-y-auto pb-32">
      {cartItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <ShoppingCart className="w-14 h-14 text-slate-200 mb-3" />
          <div className="font-bold text-slate-700 text-lg mb-1">Your cart is empty</div>
          <div className="text-sm text-slate-400 mb-4">Add items to start shopping</div>
          <button className="bg-blue-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm" onClick={() => navTo("home", "home")}>Browse Products</button>
        </div>
      ) : (
        <div className="px-3 pt-3">
          <div className="text-xs text-slate-500 mb-3">{cartItems.length} item{cartItems.length > 1 ? "s" : ""} in cart</div>

          {/* Store Info */}
          <div className="flex items-center gap-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
            <Store className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-emerald-800">Fresh Basket · 0.6 km away</div>
              <div className="text-[10px] text-emerald-700">Estimated delivery: 12 minutes</div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2 mb-4">
            {cartItems.map(item => (
              <div key={item.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                <div className="w-14 h-14 bg-slate-50 rounded-lg flex items-center justify-center shrink-0">
                  <img src={item.image} alt={item.name} className="max-h-full max-w-full object-contain mix-blend-multiply" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-xs line-clamp-2 mb-0.5">{item.name}</div>
                  <div className="text-[10px] text-slate-400 mb-1">{item.weight}</div>
                  <div className="font-bold text-slate-900 text-sm">₹{item.price * (item.qty || 1)}</div>
                </div>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden shrink-0">
                  <button onClick={() => changeCartQty(item.id, -1)} className="w-7 h-7 flex items-center justify-center text-slate-600 bg-slate-50">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center font-bold text-xs">{item.qty || 1}</span>
                  <button onClick={() => changeCartQty(item.id, 1)} className="w-7 h-7 flex items-center justify-center text-slate-600 bg-slate-50">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery Address */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-800" />
                <span className="font-bold text-sm text-slate-800">Delivery Address</span>
              </div>
              <button className="text-xs font-bold text-orange-600" onClick={() => navTo("addresses")}>Change</button>
            </div>
            <div className="text-xs text-slate-700 font-semibold">{ADDRESSES[0].label} — {ADDRESSES[0].name}</div>
            <div className="text-xs text-slate-500 leading-relaxed">{ADDRESSES[0].line}</div>
          </div>

          {/* Coupon */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-sm text-slate-800">Apply Coupon</span>
            </div>
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-bold text-green-700">{appliedCoupon} applied</span>
                </div>
                <button onClick={() => setAppliedCoupon(null)} className="text-[10px] text-red-500 font-semibold">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={e => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code"
                  className="flex-1 bg-slate-100 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                />
                <button
                  className="bg-blue-900 text-white text-xs font-bold px-3 py-2 rounded-lg"
                  onClick={() => {
                    if (couponInput === "CHOW10" || couponInput === "FIRST50") {
                      setAppliedCoupon(couponInput);
                      setCouponInput("");
                    }
                  }}
                >Apply</button>
              </div>
            )}
          </div>

          {/* Wallet */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-sm text-slate-800">Chowdhary Wallet</span>
              </div>
              <span className="text-sm font-bold text-purple-700">₹{walletBalance} available</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">Use wallet balance</span>
              <div className="w-10 h-5 bg-purple-600 rounded-full flex items-center justify-end pr-0.5">
                <div className="w-4 h-4 bg-white rounded-full shadow" />
              </div>
            </div>
          </div>

          {/* Bill Summary */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 mb-4 shadow-sm">
            <div className="font-bold text-sm text-slate-800 mb-3">Bill Summary</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600"><span>MRP Total</span><span>₹{cartItems.reduce((s, p) => s + p.mrp * (p.qty || 1), 0)}</span></div>
              <div className="flex justify-between text-green-600 font-semibold"><span>Product Discount</span><span>- ₹{cartItems.reduce((s, p) => s + (p.mrp - p.price) * (p.qty || 1), 0)}</span></div>
              {cartDiscount > 0 && <div className="flex justify-between text-green-600 font-semibold"><span>Coupon ({appliedCoupon})</span><span>- ₹{cartDiscount}</span></div>}
              <div className="flex justify-between text-slate-600"><span>Delivery Fee</span><span className={cartTotal > 299 ? "text-green-600 font-semibold" : ""}>{cartTotal > 299 ? "FREE" : "₹49"}</span></div>
              <div className="border-t border-slate-100 pt-2 flex justify-between font-black text-slate-900 text-sm"><span>Total Payable</span><span>₹{cartFinal}</span></div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 mb-4 shadow-sm">
            <div className="font-bold text-sm text-slate-800 mb-3">Payment Method</div>
            <div className="space-y-2">
              {[
                { label: "UPI / GPay / PhonePe", sub: "Instant · No charges", selected: true },
                { label: "Credit / Debit Card", sub: "Visa, Mastercard, Rupay", selected: false },
                { label: "Net Banking", sub: "All major banks", selected: false },
                { label: "Cash on Delivery", sub: "Pay when delivered", selected: false },
              ].map((m, i) => (
                <div key={i} className={`flex items-center gap-2 p-2.5 rounded-xl border ${m.selected ? "border-blue-800 bg-blue-50" : "border-slate-100"}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${m.selected ? "border-blue-800" : "border-slate-300"}`}>
                    {m.selected && <div className="w-2 h-2 rounded-full bg-blue-800" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">{m.label}</div>
                    <div className="text-[10px] text-slate-400">{m.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] bg-white border-t border-slate-100 px-3 py-3 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <button
            className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-between px-4 shadow-lg"
            onClick={() => navTo("tracking")}
          >
            <span className="text-white/70 text-xs">{cartItems.length} items · ₹{cartFinal}</span>
            <span>Place Order →</span>
          </button>
        </div>
      )}
    </div>
  );

  const WishlistScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      {wishlistItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="w-14 h-14 text-slate-200 mb-3" />
          <div className="font-bold text-slate-700 text-lg mb-1">Wishlist is empty</div>
          <div className="text-sm text-slate-400 mb-4">Save products you love for later</div>
          <button className="bg-blue-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm" onClick={() => navTo("home", "home")}>Browse Products</button>
        </div>
      ) : (
        <>
          <div className="text-xs text-slate-500 mb-3">{wishlistItems.length} saved item{wishlistItems.length > 1 ? "s" : ""}</div>
          <div className="grid grid-cols-2 gap-2">
            {wishlistItems.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onTap={() => { setSelectedProduct(product); setScreen("product"); setSelectedImg(0); setQty(1); }}
                onAddCart={addToCart}
                onToggleWishlist={toggleWishlist}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  const OrdersScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
        {["All Orders", "Delivered", "Cancelled", "In Progress"].map((tab, i) => (
          <button key={i} className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full ${i === 0 ? "bg-blue-900 text-white" : "bg-slate-100 text-slate-700"}`}>{tab}</button>
        ))}
      </div>
      <div className="space-y-3">
        {ORDERS.map((order, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm" onClick={() => { setSelectedOrder(order); navTo("order-detail"); }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-bold text-xs text-slate-800">{order.id}</div>
                <div className="text-[10px] text-slate-400">{order.date} · {order.store}</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.statusBg} ${order.statusColor}`}>{order.status}</span>
            </div>
            <div className="text-xs text-slate-600 mb-2 leading-relaxed">{order.items.join(", ")}</div>
            <div className="flex items-center justify-between border-t border-slate-50 pt-2">
              <div className="font-bold text-sm text-slate-900">₹{order.total.toLocaleString()}</div>
              <div className="flex gap-2">
                {order.canReorder && (
                  <button className="text-[10px] font-bold text-blue-700 border border-blue-200 px-2 py-1 rounded-lg bg-blue-50"
                    onClick={(e) => { e.stopPropagation(); addToCart(1); }}>
                    Reorder
                  </button>
                )}
                {order.canReturn && (
                  <button className="text-[10px] font-bold text-orange-600 border border-orange-200 px-2 py-1 rounded-lg bg-orange-50"
                    onClick={e => e.stopPropagation()}>
                    Return
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const OrderDetailScreen = () => {
    if (!selectedOrder) return null;
    return (
      <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
        <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="font-black text-slate-800 text-sm">{selectedOrder.id}</div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedOrder.statusBg} ${selectedOrder.statusColor}`}>{selectedOrder.status}</span>
          </div>
          <div className="text-xs text-slate-500">{selectedOrder.date} · {selectedOrder.store}</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
          <div className="font-bold text-slate-800 text-sm mb-2">Items Ordered</div>
          {selectedOrder.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0">
              <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-700">{item}</span>
            </div>
          ))}
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
            <span className="font-bold text-sm text-slate-800">Total Paid</span>
            <span className="font-black text-slate-900 text-base">₹{selectedOrder.total.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
          <div className="font-bold text-slate-800 text-sm mb-2">Delivery Details</div>
          <div className="text-xs text-slate-600 leading-relaxed">{ADDRESSES[0].line}</div>
          {selectedOrder.deliveredOn && <div className="mt-1 text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Delivered on {selectedOrder.deliveredOn}</div>}
        </div>
        <div className="flex gap-2">
          {selectedOrder.canReturn && (
            <button className="flex-1 border border-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> Return / Refund
            </button>
          )}
          <button className="flex-1 border border-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5">
            <Download className="w-4 h-4" /> Download Invoice
          </button>
          {selectedOrder.status === "Delivered" && (
            <button className="flex-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5" onClick={() => setShowRatingModal(true)}>
              <Star className="w-4 h-4" /> Rate Order
            </button>
          )}
        </div>
      </div>
    );
  };

  const TrackingScreen = () => {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => { const t = setInterval(() => setElapsed(e => e + 1), 2000); return () => clearInterval(t); }, []);
    const doneCount = TRACKING_STEPS.filter(s => s.done).length;
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Map Placeholder */}
        <div className="relative bg-gradient-to-br from-slate-200 to-slate-300 h-48 overflow-hidden">
          {/* Simulated map */}
          <div className="absolute inset-0" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.3'%3E%3Cpath d='M0 0h20v1H0V0zm0 20h20v1H0V20zM20 0v20h1V0h-1zm-1 0v20h-1V0h1z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          {/* Store marker */}
          <div className="absolute top-1/3 left-1/3 flex flex-col items-center">
            <div className="bg-blue-800 text-white rounded-full px-2 py-0.5 text-[9px] font-bold shadow mb-0.5">Store</div>
            <MapPin className="w-5 h-5 text-blue-800 fill-blue-800" />
          </div>
          {/* Rider marker (animated) */}
          <div className="absolute flex flex-col items-center" style={{ top: `${38 + (elapsed % 5) * 3}%`, left: `${50 + (elapsed % 4) * 2}%`, transition: "all 2s ease" }}>
            <div className="bg-orange-500 text-white rounded-full px-2 py-0.5 text-[9px] font-bold shadow mb-0.5">Rider</div>
            <div className="bg-orange-500 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Bike className="w-4 h-4 text-white" />
            </div>
          </div>
          {/* Destination marker */}
          <div className="absolute bottom-1/4 right-1/4 flex flex-col items-center">
            <div className="bg-emerald-600 text-white rounded-full px-2 py-0.5 text-[9px] font-bold shadow mb-0.5">You</div>
            <MapPin className="w-5 h-5 text-emerald-600 fill-emerald-600" />
          </div>
          {/* ETA Overlay */}
          <div className="absolute top-3 left-3 bg-white rounded-xl shadow-lg px-3 py-2">
            <div className="text-xs text-slate-500">Arriving in</div>
            <div className="font-black text-xl text-blue-900">4 min</div>
          </div>
          <div className="absolute top-3 right-3 bg-white rounded-xl shadow-lg px-2 py-1.5 flex items-center gap-1.5">
            <Navigation className="w-3 h-3 text-orange-500" />
            <span className="text-[10px] font-bold text-slate-700">0.3 km away</span>
          </div>
        </div>

        {/* Rider Info */}
        <div className="mx-3 -mt-4 bg-white rounded-2xl shadow-lg border border-slate-100 p-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-black text-lg shrink-0 border-2 border-white shadow">R</div>
          <div className="flex-1">
            <div className="font-bold text-slate-800 text-sm">Ramesh Kumar</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Bike className="w-3 h-3" /> Bike · DL 4C AX 5521
            </div>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-semibold text-slate-700">4.9 rating · 1,240 deliveries</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center">
              <Phone className="w-4 h-4 text-emerald-700" />
            </button>
            <button className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-700" />
            </button>
          </div>
        </div>

        {/* Live Stats */}
        <div className="flex gap-2 mx-3 mt-3">
          {[
            { label: "Distance", value: "0.3 km", icon: <Navigation className="w-3.5 h-3.5 text-blue-600" /> },
            { label: "ETA", value: "4 min", icon: <Clock className="w-3.5 h-3.5 text-orange-500" /> },
            { label: "Speed", value: "18 km/h", icon: <Zap className="w-3.5 h-3.5 text-emerald-600" /> },
          ].map((stat, i) => (
            <div key={i} className="flex-1 bg-white border border-slate-100 rounded-xl p-2 text-center shadow-sm">
              <div className="flex justify-center mb-0.5">{stat.icon}</div>
              <div className="font-black text-slate-900 text-xs">{stat.value}</div>
              <div className="text-[9px] text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Progress Steps */}
        <div className="mx-3 mt-3 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
          <div className="font-bold text-sm text-slate-800 mb-3">Order Progress ({doneCount}/{TRACKING_STEPS.length})</div>
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100" />
            <div className="space-y-3">
              {TRACKING_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3 relative">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 border-2 shrink-0 ${step.done ? "bg-emerald-500 border-emerald-500" : i === doneCount ? "bg-orange-500 border-orange-500 animate-pulse" : "bg-white border-slate-200"}`}>
                    {step.done ? <Check className="w-3 h-3 text-white" /> : <div className="w-2 h-2 rounded-full bg-slate-300" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-xs font-semibold ${step.done ? "text-slate-800" : i === doneCount ? "text-orange-600 font-bold" : "text-slate-400"}`}>{step.label}</div>
                  </div>
                  {step.time && <div className="text-[10px] text-slate-400">{step.time}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-3 mt-3 mb-2 bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs text-blue-700 font-medium">Live location updates every 2 seconds via real-time tracking</span>
        </div>
      </div>
    );
  };

  const AccountScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Profile Header */}
      <div className="bg-gradient-to-br from-blue-900 to-indigo-900 px-4 pt-4 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-2xl border-2 border-white shadow">R</div>
          <div>
            <div className="font-black text-white text-base">Rajesh Chowdhary</div>
            <div className="text-blue-200 text-xs">+91 98765 43210</div>
            <div className="flex items-center gap-1 mt-0.5">
              <Award className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-300 text-[10px] font-bold">Gold Member · {loyaltyPoints} pts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 -mt-4">
        {/* Quick Stats */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-3 mb-4 grid grid-cols-3 divide-x divide-slate-100">
          {[
            { label: "Orders", value: ORDERS.length, icon: <Package className="w-4 h-4 text-blue-700" /> },
            { label: "Wishlist", value: wishlistItems.length, icon: <Heart className="w-4 h-4 text-red-500" /> },
            { label: "Wallet", value: `₹${walletBalance}`, icon: <Wallet className="w-4 h-4 text-purple-600" /> },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 py-1">
              {stat.icon}
              <div className="font-black text-slate-900 text-base">{stat.value}</div>
              <div className="text-[10px] text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Menu Items */}
        {[
          { label: "My Orders", icon: <Package className="w-4 h-4 text-blue-700" />, bg: "bg-blue-50", action: () => navTo("orders", "orders") },
          { label: "Wishlist", icon: <Heart className="w-4 h-4 text-red-500" />, bg: "bg-red-50", action: () => setScreen("wishlist") },
          { label: "Chowdhary Wallet", icon: <Wallet className="w-4 h-4 text-purple-600" />, bg: "bg-purple-50", action: () => navTo("wallet") },
          { label: "Loyalty Points", icon: <Award className="w-4 h-4 text-yellow-600" />, bg: "bg-yellow-50", action: () => navTo("loyalty") },
          { label: "Saved Addresses", icon: <MapPin className="w-4 h-4 text-emerald-600" />, bg: "bg-emerald-50", action: () => navTo("addresses") },
          { label: "Coupons & Offers", icon: <Tag className="w-4 h-4 text-orange-600" />, bg: "bg-orange-50", action: () => navTo("coupons") },
          { label: "Referral Program", icon: <Share2 className="w-4 h-4 text-indigo-600" />, bg: "bg-indigo-50", action: () => navTo("referral") },
          { label: "Notifications", icon: <Bell className="w-4 h-4 text-slate-600" />, bg: "bg-slate-100", action: () => navTo("notifications") },
          { label: "Settings", icon: <Settings className="w-4 h-4 text-slate-600" />, bg: "bg-slate-100", action: () => {} },
          { label: "Help & Support", icon: <MessageSquare className="w-4 h-4 text-teal-600" />, bg: "bg-teal-50", action: () => {} },
          { label: "Sign Out", icon: <LogOut className="w-4 h-4 text-red-500" />, bg: "bg-red-50", action: () => {} },
        ].map((item, i) => (
          <button key={i} className="w-full flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3 py-3 mb-2 shadow-sm text-left" onClick={item.action}>
            <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center shrink-0`}>{item.icon}</div>
            <span className="flex-1 font-semibold text-slate-800 text-sm">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  );

  const CategoriesScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="mb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input placeholder="Search categories..." className="w-full bg-slate-100 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none" />
        </div>
      </div>
      <div className="space-y-2">
        {CATEGORIES.map((cat, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 ${cat.color} rounded-xl flex items-center justify-center`}>{cat.icon}</div>
            <div className="flex-1">
              <div className="font-bold text-slate-800 text-sm">{cat.name}</div>
              <div className="text-xs text-slate-400">{cat.count} products available nearby</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );

  const NotificationsScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{NOTIFS.filter(n => n.unread).length} unread</span>
        <button className="text-xs font-bold text-orange-600">Mark all read</button>
      </div>
      <div className="space-y-2">
        {NOTIFS.map((notif, i) => (
          <div key={i} className={`flex gap-3 bg-white border rounded-xl p-3 shadow-sm ${notif.unread ? "border-blue-200 bg-blue-50/30" : "border-slate-100"}`}>
            <div className={`w-9 h-9 ${notif.bg} rounded-xl flex items-center justify-center shrink-0`}>{notif.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="font-bold text-xs text-slate-800">{notif.title}</div>
                {notif.unread && <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 ml-1" />}
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{notif.body}</div>
              <div className="text-[10px] text-slate-400 mt-1">{notif.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const AddressesScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="space-y-3 mb-4">
        {ADDRESSES.map((addr) => (
          <div key={addr.id} className={`bg-white border rounded-xl p-3 shadow-sm ${addr.default ? "border-blue-300" : "border-slate-100"}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${addr.default ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{addr.label}</span>
                {addr.default && <span className="text-[10px] text-emerald-600 font-semibold">Default</span>}
              </div>
              <button className="text-xs font-bold text-orange-600">Edit</button>
            </div>
            <div className="font-semibold text-xs text-slate-800">{addr.name}</div>
            <div className="text-xs text-slate-500 leading-relaxed">{addr.line}</div>
            <div className="text-xs text-slate-500 mt-0.5">+91 {addr.phone}</div>
          </div>
        ))}
      </div>
      <button className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-600 font-semibold text-sm">
        <Plus className="w-4 h-4" /> Add New Address
      </button>
    </div>
  );

  const WalletScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="bg-gradient-to-br from-purple-700 to-indigo-800 px-4 pt-5 pb-8 text-white">
        <div className="text-sm text-white/70 mb-1">Chowdhary Wallet Balance</div>
        <div className="text-4xl font-black mb-1">₹{walletBalance.toLocaleString()}</div>
        <div className="text-xs text-white/60">Valid forever · No expiry</div>
        <div className="flex gap-3 mt-4">
          <button className="flex-1 bg-white/20 border border-white/30 text-white font-bold py-2 rounded-xl text-sm">Add Money</button>
          <button className="flex-1 bg-white text-purple-800 font-bold py-2 rounded-xl text-sm">Withdraw</button>
        </div>
      </div>
      <div className="px-3 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-3">
          <div className="font-bold text-slate-800 text-sm mb-3">Transaction History</div>
          <div className="space-y-3">
            {WALLET_TXNS.map((txn, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${txn.type === "credit" ? "bg-emerald-100" : "bg-red-100"}`}>
                  {txn.type === "credit" ? <Plus className="w-4 h-4 text-emerald-600" /> : <Minus className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-800">{txn.desc}</div>
                  <div className="text-[10px] text-slate-400">{txn.date}</div>
                </div>
                <span className={`font-bold text-sm ${txn.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>
                  {txn.type === "credit" ? "+" : "-"}₹{txn.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const CouponsScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="mb-3 bg-slate-100 rounded-xl flex items-center gap-2 px-3 py-2">
        <input
          placeholder="Enter coupon code"
          className="flex-1 bg-transparent text-sm focus:outline-none font-medium"
          onChange={e => setCouponInput(e.target.value.toUpperCase())}
          value={couponInput}
        />
        <button className="bg-blue-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Apply</button>
      </div>
      <div className="font-bold text-slate-800 text-sm mb-2">Available Coupons</div>
      <div className="space-y-3">
        {COUPONS.map((c, i) => (
          <div key={i} className={`bg-gradient-to-r ${c.color} rounded-2xl overflow-hidden shadow-md`}>
            <div className="flex">
              <div className="flex-1 p-4 text-white">
                <div className="font-black text-2xl mb-0.5">{c.discount}</div>
                <div className="text-sm font-bold mb-0.5">{c.desc}</div>
                <div className="text-white/70 text-[10px]">Valid till {c.validity}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-4 border-l border-white/20">
                <div className="text-white/80 text-[9px] font-bold uppercase tracking-widest mb-1">Code</div>
                <div className="font-black text-white text-sm bg-white/20 px-2 py-1 rounded-lg">{c.code}</div>
                <button
                  className="text-white/80 text-[10px] font-semibold mt-2 flex items-center gap-0.5"
                  onClick={() => {
                    setCopiedCoupon(c.code);
                    setTimeout(() => setCopiedCoupon(null), 1500);
                  }}
                >
                  {copiedCoupon === c.code ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const LoyaltyScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-4 pt-5 pb-8 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-6 h-6 text-yellow-200" />
          <span className="font-bold text-sm text-yellow-200">Gold Member</span>
        </div>
        <div className="text-4xl font-black mb-1">{loyaltyPoints.toLocaleString()}</div>
        <div className="text-sm text-white/80 mb-3">Loyalty Points = ₹{Math.floor(loyaltyPoints / 10)} wallet value</div>
        <div className="bg-white/20 rounded-xl p-3">
          <div className="text-xs text-white/80 mb-1">Next tier: Platinum (2000 pts needed)</div>
          <div className="bg-white/30 rounded-full h-2 overflow-hidden">
            <div className="bg-white h-2 rounded-full" style={{ width: `${(loyaltyPoints / 3000) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="px-3 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-3 mb-4">
          <div className="font-bold text-slate-800 text-sm mb-3">Redeem Points</div>
          <div className="grid grid-cols-2 gap-2">
            {[100, 250, 500, 1000].map(pts => (
              <button key={pts} disabled={loyaltyPoints < pts} className={`border rounded-xl p-3 text-center ${loyaltyPoints >= pts ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50 opacity-50"}`}>
                <div className="font-black text-amber-600 text-lg">{pts} pts</div>
                <div className="text-xs text-slate-600">= ₹{pts / 10} off</div>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
          <div className="font-bold text-slate-800 text-sm mb-2">How to earn more</div>
          <div className="space-y-2">
            {[
              { label: "Each ₹100 spent", pts: "+10 pts" },
              { label: "Refer a friend", pts: "+100 pts" },
              { label: "Write a review", pts: "+5 pts" },
              { label: "Birthday bonus", pts: "+500 pts" },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span className="text-slate-600">{item.label}</span>
                <span className="font-bold text-amber-600">{item.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const ReferralScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white text-center mb-4 shadow-lg">
        <Users className="w-10 h-10 text-white/80 mx-auto mb-2" />
        <div className="font-black text-2xl mb-1">Invite & Earn</div>
        <div className="text-white/80 text-sm mb-4">Get ₹100 for each friend who joins and places their first order</div>
        <div className="bg-white/20 border border-white/30 rounded-xl p-3 mb-3">
          <div className="text-white/70 text-[10px] mb-1 uppercase tracking-widest font-bold">Your Referral Code</div>
          <div className="font-black text-2xl tracking-widest">CHOW-RAJESH</div>
        </div>
        <button
          className="w-full bg-white text-indigo-700 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          onClick={() => { setReferralCopied(true); setTimeout(() => setReferralCopied(false), 1500); }}
        >
          {referralCopied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy & Share Code</>}
        </button>
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="font-bold text-slate-800 text-sm mb-3">Your Referral Stats</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[{ label: "Invited", value: "8" }, { label: "Joined", value: "5" }, { label: "Earned", value: "₹500" }].map((s, i) => (
            <div key={i} className="bg-indigo-50 rounded-xl p-2">
              <div className="font-black text-indigo-700 text-xl">{s.value}</div>
              <div className="text-[10px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <div className="font-bold text-slate-800 text-sm mb-2">How it works</div>
        <div className="space-y-3">
          {[
            { n: "1", text: "Share your referral code with friends" },
            { n: "2", text: "Friend signs up using your code" },
            { n: "3", text: "Friend places their first order" },
            { n: "4", text: "You earn ₹100 in Chowdhary Wallet!" },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs font-bold">{step.n}</div>
              <span className="text-sm text-slate-600">{step.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const VendorStoresScreen = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-3 pt-3">
      <div className="flex items-center gap-2 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
        <MapPin className="w-4 h-4 text-blue-700 shrink-0" />
        <span className="text-xs font-semibold text-blue-800">Showing stores within 5 km of Sector 15, Noida</span>
      </div>
      <div className="space-y-3">
        {[
          { name: "Fresh Basket", type: "Grocery & Dairy", dist: "0.6 km", time: "8 min", rating: 4.8, reviews: 1240, open: true, offers: "Min order ₹99" },
          { name: "Daily Needs Store", type: "Grocery & FMCG", dist: "1.2 km", time: "11 min", rating: 4.5, reviews: 870, open: true, offers: "Free delivery above ₹199" },
          { name: "Tech Hub", type: "Electronics & Gadgets", dist: "2.1 km", time: "15 min", rating: 4.6, reviews: 320, open: false, offers: "10% off on first order" },
          { name: "Medplus Pharmacy", type: "Pharmacy & Health", dist: "2.8 km", time: "18 min", rating: 4.7, reviews: 560, open: true, offers: "Min order ₹49" },
          { name: "Fashion Hub", type: "Clothing & Accessories", dist: "3.5 km", time: "22 min", rating: 4.3, reviews: 190, open: true, offers: "Free returns within 7 days" },
        ].map((store, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                <Store className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="font-bold text-slate-800 text-sm">{store.name}</div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${store.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{store.open ? "OPEN" : "CLOSED"}</span>
                </div>
                <div className="text-xs text-slate-500 mb-1">{store.type}</div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-0.5 text-amber-600 font-semibold"><Star className="w-3 h-3 fill-amber-400" /> {store.rating} ({store.reviews})</span>
                  <span className="flex items-center gap-0.5 text-slate-500"><MapPin className="w-3 h-3" /> {store.dist}</span>
                  <span className="flex items-center gap-0.5 text-blue-700 font-semibold"><Clock className="w-3 h-3" /> {store.time}</span>
                </div>
                <div className="mt-1 text-[10px] text-orange-600 font-semibold flex items-center gap-1">
                  <Tag className="w-3 h-3" /> {store.offers}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Screen header titles ─────────────────────────────────────────────────
  const getTitle = () => {
    switch (screen) {
      case "home": return null;
      case "search": return "Search";
      case "product": return selectedProduct?.name.slice(0, 22) + "…" || "Product";
      case "cart": return `Cart (${cartItems.length})`;
      case "wishlist": return "Wishlist";
      case "orders": return "My Orders";
      case "order-detail": return selectedOrder?.id || "Order Detail";
      case "tracking": return "Live Tracking";
      case "account": return "My Account";
      case "categories": return "All Categories";
      case "notifications": return "Notifications";
      case "addresses": return "Saved Addresses";
      case "wallet": return "Chowdhary Wallet";
      case "coupons": return "Coupons & Offers";
      case "loyalty": return "Loyalty Points";
      case "referral": return "Referral Program";
      case "vendor-stores": return "Nearby Stores";
      default: return "";
    }
  };

  const showBack = !["home", "search", "categories", "orders", "account"].includes(screen);
  const handleBack = () => {
    if (screen === "product") { setScreen("home"); return; }
    if (screen === "order-detail") { setScreen("orders"); return; }
    if (screen === "tracking") { setScreen("cart"); return; }
    if (screen === "wishlist" || screen === "wallet" || screen === "coupons" || screen === "loyalty" || screen === "referral" || screen === "notifications" || screen === "addresses" || screen === "vendor-stores") {
      setScreen("account"); return;
    }
    setScreen("home");
  };

  return (
    <div
      className="min-h-screen bg-slate-50 font-sans w-full max-w-[390px] mx-auto flex flex-col relative overflow-hidden border-x border-slate-200 shadow-2xl"
      style={{ height: "100vh" }}
    >
      {/* Top Header */}
      {screen === "home" ? (
        <header className="bg-white border-b border-slate-100 px-3 pt-3 pb-2 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-blue-900 p-1.5 rounded-lg shrink-0">
              <ShoppingBag className="w-4 h-4 text-orange-400" />
            </div>
            <span className="font-black text-blue-900 text-base">Chowdhary Mart</span>
            <div className="flex items-center gap-0.5 ml-1 cursor-pointer">
              <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">Sector 15, Noida</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="relative" onClick={() => navTo("notifications")}>
                <Bell className="w-5 h-5 text-slate-600" />
                {notifCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{notifCount}</span>}
              </button>
              <button className="relative" onClick={() => navTo("cart")}>
                <ShoppingCart className="w-5 h-5 text-slate-600" />
                {cartItems.length > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{cartItems.length}</span>}
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              readOnly
              onClick={() => navTo("search")}
              placeholder="Search for atta, dal, soap, mobiles..."
              className="w-full bg-slate-100 pl-9 pr-16 py-2.5 rounded-xl text-sm cursor-pointer focus:outline-none placeholder:text-slate-400"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
              <Mic className="w-4 h-4 text-orange-500" />
              <Camera className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border-b border-slate-100 px-3 py-3 flex items-center gap-3 sticky top-0 z-40 shadow-sm">
          {showBack && (
            <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100">
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
          )}
          <span className="font-bold text-slate-800 text-sm flex-1 truncate">{getTitle()}</span>
          {screen === "cart" && (
            <button className="text-xs font-bold text-orange-600" onClick={() => setScreen("wishlist")}>
              <Heart className="w-5 h-5" />
            </button>
          )}
          {screen === "home" || screen === "product" ? (
            <button className="relative" onClick={() => navTo("cart")}>
              <ShoppingCart className="w-5 h-5 text-slate-600" />
              {cartItems.length > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{cartItems.length}</span>}
            </button>
          ) : null}
        </header>
      )}

      {/* Screen Content */}
      {screen === "home" && <HomeScreen />}
      {screen === "search" && <SearchScreen />}
      {screen === "product" && <ProductScreen />}
      {screen === "cart" && <CartScreen />}
      {screen === "wishlist" && <WishlistScreen />}
      {screen === "orders" && <OrdersScreen />}
      {screen === "order-detail" && <OrderDetailScreen />}
      {screen === "tracking" && <TrackingScreen />}
      {screen === "account" && <AccountScreen />}
      {screen === "categories" && <CategoriesScreen />}
      {screen === "notifications" && <NotificationsScreen />}
      {screen === "addresses" && <AddressesScreen />}
      {screen === "wallet" && <WalletScreen />}
      {screen === "coupons" && <CouponsScreen />}
      {screen === "loyalty" && <LoyaltyScreen />}
      {screen === "referral" && <ReferralScreen />}
      {screen === "vendor-stores" && <VendorStoresScreen />}

      {/* Bottom Tab Bar */}
      {["home", "categories", "orders", "account"].includes(screen) && (
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-around py-2">
            {[
              { tab: "home" as const, label: "Home", icon: <HomeIcon />, screen: "home" as Screen },
              { tab: "categories" as const, label: "Categories", icon: <LayoutGrid />, screen: "categories" as Screen },
              { tab: "orders" as const, label: "Orders", icon: <FileText />, screen: "orders" as Screen },
              { tab: "account" as const, label: "Account", icon: <User />, screen: "account" as Screen },
            ].map(item => (
              <button
                key={item.tab}
                className="flex flex-col items-center gap-0.5 py-1 px-3"
                onClick={() => navTo(item.screen, item.tab)}
              >
                {React.cloneElement(item.icon as React.ReactElement, {
                  className: `w-5 h-5 ${activeTab === item.tab ? "text-blue-900" : "text-slate-400"}`
                })}
                <span className={`text-[10px] font-semibold ${activeTab === item.tab ? "text-blue-900" : "text-slate-400"}`}>{item.label}</span>
                {activeTab === item.tab && <div className="w-4 h-0.5 bg-orange-500 rounded-full mt-0.5" />}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowRatingModal(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="font-black text-slate-800 text-base mb-1 text-center">Rate Your Experience</div>
            <div className="text-xs text-slate-500 mb-4 text-center">How was your order from Fresh Basket?</div>
            <div className="flex justify-center gap-3 mb-4">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setUserRating(s)}>
                  <Star className={`w-8 h-8 ${s <= userRating ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"}`} />
                </button>
              ))}
            </div>
            <textarea className="w-full bg-slate-100 rounded-xl p-3 text-sm focus:outline-none resize-none" rows={3} placeholder="Tell us about your experience..." />
            <button className="w-full mt-3 bg-blue-900 text-white font-bold py-3 rounded-xl text-sm" onClick={() => setShowRatingModal(false)}>
              Submit Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
