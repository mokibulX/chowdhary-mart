import { ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { customFetch, getGetCartQueryKey, useGetCart } from "@workspace/api-client-react";
import {
  Bell,
  Camera,
  ChevronDown,
  Grid2X2,
  Headphones,
  Heart,
  Home,
  ImagePlus,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  Mic,
  Navigation,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  User,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getSavedDeliveryLocation, lookupPincode, nearestDeliveryLocation, PINCODE_LOCATIONS, saveDeliveryLocation, type DeliveryLocation } from "@/lib/pincode";
import { getBrowserLocation } from "@/lib/live-location";
import { useI18n } from "@/lib/i18n";
import { PickupLocationPicker, type PickupLocation } from "@/components/PickupLocationPicker";

interface CustomerLayoutProps {
  children: ReactNode;
}

const MOBILE_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Categories", icon: Grid2X2 },
  { href: "/search", label: "Search", icon: Search },
  { href: "/orders", label: "Orders", icon: Package, auth: true },
  { href: "/profile", label: "Profile", icon: User, auth: true },
];

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [voiceListening, setVoiceListening] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("cm_recent_searches") || "[]").slice(0, 5);
    } catch {
      return [];
    }
  });
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation>(() => getSavedDeliveryLocation());
  const [locationOpen, setLocationOpen] = useState(false);
  const [pincodeInput, setPincodeInput] = useState(deliveryLocation.pincode);
  const [pincodeError, setPincodeError] = useState("");
  const [locatingGps, setLocatingGps] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<any[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const cameraSearchRef = useRef<HTMLInputElement | null>(null);
  const gallerySearchRef = useRef<HTMLInputElement | null>(null);

  const { data: cart } = useGetCart({
    query: { enabled: !!user, queryKey: getGetCartQueryKey() },
  });
  const cartItemCount = cart?.itemCount || 0;
  const zoneId = (deliveryLocation as DeliveryLocation & { zoneId?: number }).zoneId;

  const { data: suggestions, isFetching: loadingSuggestions } = useQuery({
    queryKey: ["/api/search/suggestions", debouncedSearch, zoneId],
    queryFn: () => customFetch<{ items: any[] }>(`/api/search/suggestions?q=${encodeURIComponent(debouncedSearch)}${zoneId ? `&zoneId=${zoneId}` : ""}&limit=8`),
    enabled: suggestOpen && debouncedSearch.trim().length >= 1,
  });
  const suggestionItems = suggestions?.items ?? [];

  const desktopNavLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Categories", icon: Grid2X2 },
    { href: "/search?category=grocery", label: "Grocery", icon: Store },
    { href: "/search?category=electronics", label: "Electronics", icon: Zap },
    { href: "/search?category=fashion", label: "Fashion", icon: Heart },
    ...(user ? [{ href: "/orders", label: "Orders", icon: Package }] : []),
    { href: "/help", label: "Help", icon: Headphones },
    ...(user?.role === "admin" ? [{ href: "/admin/dashboard", label: "Admin Panel", icon: Settings }] : []),
  ];

  const isRouteActive = (href: string, label?: string) => {
    if (href === "/") return location === "/";
    if (href.includes("?category=")) return location === href;
    if (label === "Categories") return location.startsWith("/search") && !location.includes("category=");
    return location.startsWith(href.split("?")[0]);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = search.trim();
    if (q) saveRecentSearch(q);
    setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    setSuggestOpen(false);
  };

  const saveRecentSearch = (value: string) => {
    const next = [value, ...recentSearches.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 5);
    setRecentSearches(next);
    localStorage.setItem("cm_recent_searches", JSON.stringify(next));
  };

  const openProductSuggestion = (item: any) => {
    saveRecentSearch(item.name);
    setSearch(item.name);
    setSuggestOpen(false);
    setLocation(`/product/${item.productId ?? item.id}`);
  };

  const handleSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen) return;
    if (event.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => Math.min(suggestionItems.length - 1, current + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => Math.max(0, current - 1));
    }
    if (event.key === "Enter" && suggestionItems[activeSuggestion]) {
      event.preventDefault();
      openProductSuggestion(suggestionItems[activeSuggestion]);
    }
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice typing is not supported in this browser. Please use Chrome or Android WebView.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    setVoiceListening(true);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setSearch(transcript);
        setSuggestOpen(true);
      }
    };
    recognition.onerror = () => setVoiceListening(false);
    recognition.onend = () => setVoiceListening(false);
    recognition.start();
  };

  const imageSearchKeyword = (file: File) => {
    const text = file.name.toLowerCase();
    const match = [
      [/tomato|tamatar/, "tomato"],
      [/potato|aloo|alu/, "potato"],
      [/onion|peyaj|piyaz/, "onion"],
      [/milk|dudh/, "milk"],
      [/rice|chal/, "rice"],
      [/shoe|chappal|sandal/, "chappal"],
      [/shirt|tshirt|kurti|dress|fashion|kapor|kapda/, "shirt"],
      [/phone|mobile|iphone|android/, "mobile"],
      [/headphone|earphone|airpod|earbud/, "headphones"],
      [/watch|smartwatch/, "smart watch"],
      [/bag|backpack/, "bag"],
    ].find(([pattern]) => (pattern as RegExp).test(text));
    return String(match?.[1] || "");
  };

  const handleImageSearch = (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const keyword = imageSearchKeyword(file);
    if (keyword) {
      setSearch(keyword);
      saveRecentSearch(keyword);
      setLocation(`/search?q=${encodeURIComponent(keyword)}&image=1`);
      setSuggestOpen(false);
      return;
    }
    const fallback = search.trim() || "fresh";
    setSearch(fallback);
    saveRecentSearch(fallback);
    setLocation(`/search?q=${encodeURIComponent(fallback)}&image=1`);
    setSuggestOpen(false);
  };

  useEffect(() => {
    const syncLocation = () => {
      const saved = getSavedDeliveryLocation();
      setDeliveryLocation(saved);
      setPincodeInput(saved.pincode);
    };
    window.addEventListener("delivery-location-change", syncLocation);
    return () => window.removeEventListener("delivery-location-change", syncLocation);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setActiveSuggestion(0);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!suggestOpen) return;
    const closeSearchSuggestions = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-search-root]")) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeSearchSuggestions);
    return () => document.removeEventListener("pointerdown", closeSearchSuggestions);
  }, [suggestOpen]);

  const applyLocation = (location: DeliveryLocation, closeDialog = true) => {
    saveDeliveryLocation(location);
    setDeliveryLocation(location);
    setPincodeInput(location.pincode);
    setPincodeError("");
    if (closeDialog) setLocationOpen(false);
  };

  const applyMapLocation = (point: PickupLocation) => {
    const fallbackNearest = nearestDeliveryLocation(point.lat, point.lng)?.location;
    applyLocation({
      pincode: point.pincode || fallbackNearest?.pincode || "",
      city: point.city || fallbackNearest?.city || "Selected city",
      state: point.state || fallbackNearest?.state || "",
      area: point.area || point.address || fallbackNearest?.area || "Selected map location",
      lat: point.lat,
      lng: point.lng,
      source: "map",
      capturedAt: new Date().toISOString(),
    });
  };

  const applyPincode = (value = pincodeInput, closeDialog = true) => {
    const found = lookupPincode(value);
    if (!found) {
      setPincodeError("Ei demo-te ei pincode serviceable noy. Nicher popular pincode try korun.");
      return;
    }
    applyLocation({ ...found, source: "pincode" }, closeDialog);
  };

  const getComponent = (components: any[] | undefined, type: string) =>
    components?.find((item) => item.types?.includes(type))?.long_name ?? "";

  const applyLiveGps = async () => {
    setLocatingGps(true);
    setPincodeError("");
    try {
      const gps = await getBrowserLocation();
      const nearest = nearestDeliveryLocation(gps.lat, gps.lng);
      let mapped: Partial<DeliveryLocation> = {};
      try {
        const data = await customFetch<any>(`/api/maps/geocode?latlng=${gps.lat},${gps.lng}`, { responseType: "json" });
        const result = data?.results?.[0];
        const components = result?.address_components ?? [];
        mapped = {
          pincode: getComponent(components, "postal_code") || nearest.location.pincode,
          city: getComponent(components, "locality") || getComponent(components, "administrative_area_level_2") || nearest.location.city,
          state: getComponent(components, "administrative_area_level_1") || nearest.location.state,
          area: result?.formatted_address || `Live GPS near ${nearest.location.area}`,
        };
      } catch {
        mapped = {};
      }
      applyLocation({
        ...nearest.location,
        ...mapped,
        lat: gps.lat,
        lng: gps.lng,
        source: "gps",
        accuracy: gps.accuracy,
        capturedAt: gps.capturedAt,
      });
    } catch (error) {
      setPincodeError((error as Error).message);
    } finally {
      setLocatingGps(false);
    }
  };

  const searchPlaces = async () => {
    const input = placeQuery.trim();
    if (input.length < 2) {
      setPincodeError("Address ba landmark-er minimum 2 letter din.");
      return;
    }
    setPlacesLoading(true);
    setPincodeError("");
    try {
      const data = await customFetch<any>(`/api/maps/places/autocomplete?input=${encodeURIComponent(input)}`, { responseType: "json" });
      setPlaceSuggestions(data?.predictions ?? []);
      if (!data?.predictions?.length) setPincodeError("Google Places kono suggestion paini.");
    } catch (error) {
      setPincodeError((error as { data?: { error?: string } })?.data?.error ?? "Google Places API configure korun.");
    } finally {
      setPlacesLoading(false);
    }
  };

  const applyPlace = async (place: any) => {
    setPlacesLoading(true);
    setPincodeError("");
    try {
      const address = place.description ?? place.structured_formatting?.main_text ?? placeQuery;
      const data = await customFetch<any>(`/api/maps/geocode?address=${encodeURIComponent(address)}`, { responseType: "json" });
      const result = data?.results?.[0];
      const loc = result?.geometry?.location;
      if (!loc) throw new Error("Google Geocoding location paini.");
      const components = result.address_components ?? [];
      const pin = components.find((item: any) => item.types?.includes("postal_code"))?.long_name ?? "";
      const city = components.find((item: any) => item.types?.includes("locality"))?.long_name
        ?? components.find((item: any) => item.types?.includes("administrative_area_level_2"))?.long_name
        ?? "Selected city";
      const state = components.find((item: any) => item.types?.includes("administrative_area_level_1"))?.long_name ?? "";
      applyLocation({
        pincode: pin,
        city,
        state,
        area: result.formatted_address ?? address,
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        source: "places",
        capturedAt: new Date().toISOString(),
      });
    } catch (error) {
      setPincodeError(error instanceof Error ? error.message : "Google Geocoding API configure korun.");
    } finally {
      setPlacesLoading(false);
    }
  };

  const renderSearchBox = ({ mobile = false }: { mobile?: boolean } = {}) => (
    <form data-search-root onSubmit={submitSearch} className="relative min-w-0 w-full">
      <input ref={cameraSearchRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleImageSearch(event.target.files?.[0])} />
      <input ref={gallerySearchRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleImageSearch(event.target.files?.[0])} />
      <div className={`relative flex items-center rounded-2xl bg-white text-gray-950 shadow-sm ring-1 ring-black/5 transition-all duration-200 focus-within:shadow-lg focus-within:shadow-blue-950/15 focus-within:ring-2 focus-within:ring-orange-300 ${mobile ? "h-12" : "h-11 xl:h-12"}`}>
        <Search className="ml-4 h-4 w-4 flex-shrink-0 text-gray-500" />
        <Input
          value={search}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={handleSearchKey}
          onChange={(event) => {
            setSearch(event.target.value);
            setSuggestOpen(true);
          }}
          placeholder={t("Search products, brands and local shops")}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-gray-950 shadow-none outline-none placeholder:text-gray-500 focus-visible:ring-0"
        />
        {search && (
          <button type="button" className="mr-2 rounded-full p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => { setSearch(""); setDebouncedSearch(""); }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className={`mr-1 rounded-full p-1.5 ${voiceListening ? "bg-orange-100 text-orange-600" : "text-gray-500 hover:bg-gray-100"}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={startVoiceSearch}
          aria-label="Voice search"
          title="Voice search"
        >
          <Mic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="mr-1 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => cameraSearchRef.current?.click()}
          aria-label="Camera product search"
          title="Camera product search"
        >
          <Camera className="h-4 w-4" />
        </button>
        {!mobile && (
          <button
            type="button"
            className="mr-1 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => gallerySearchRef.current?.click()}
            aria-label="Upload product photo"
            title="Upload product photo"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        )}
        <Button type="submit" size="sm" className="mr-1.5 hidden h-8 rounded-xl bg-orange-500 px-4 text-xs font-bold hover:bg-orange-600 lg:inline-flex">
          Search
        </Button>
      </div>
      {suggestOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-hidden rounded-2xl border bg-white text-gray-950 shadow-2xl shadow-blue-950/20 animate-in fade-in-0 zoom-in-95 duration-150">
          {debouncedSearch.length >= 1 ? (
            loadingSuggestions ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Searching nearby stock...</div>
            ) : suggestionItems.length ? (
              <div className="max-h-[430px] overflow-y-auto p-2">
                {suggestionItems.map((item, index) => (
                  <button
                    key={`${item.productId}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => openProductSuggestion(item)}
                    className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${index === activeSuggestion ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-gray-50">
                      {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-1" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{item.brand || item.category || "Product"} - {item.unit || "unit"} - {item.shopName}</p>
                      <p className="text-xs text-green-700">{item.inStock ? `${item.etaMins ?? 40} min delivery` : "Out of stock"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">Rs.{Number(item.price ?? 0).toFixed(0)}</p>
                      {Number(item.mrp ?? 0) > Number(item.price ?? 0) && <p className="text-xs text-muted-foreground line-through">Rs.{Number(item.mrp).toFixed(0)}</p>}
                      {Number(item.discountPercent ?? 0) > 0 && <p className="text-[11px] font-semibold text-green-600">{Math.round(Number(item.discountPercent))}% off</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-muted-foreground">No matching active nearby product found.</div>
            )
          ) : (
            <div className="p-3">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent searches</p>
              {[...recentSearches, "Milk", "Mobile", "Vegetables", "Chappal"].slice(0, 7).map((item) => (
                <button key={item} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(item); setSuggestOpen(true); }} className="mr-2 mt-2 rounded-full border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );

  const CartButton = ({ compact = false }: { compact?: boolean }) => (
    <Link href={user ? "/cart" : "/login"}>
      <Button variant="ghost" className={`relative rounded-xl text-white hover:bg-white/10 ${compact ? "h-10 px-2" : "h-10 px-3"}`} data-testid="link-cart">
        <ShoppingCart className="h-5 w-5" />
        {cartItemCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-yellow-300 px-1 text-[10px] font-bold text-gray-950 ring-2 ring-[#0757ee]">
            {cartItemCount}
          </span>
        )}
      </Button>
    </Link>
  );

  return (
    <div className="app-shell bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-blue-700/40 bg-gradient-to-r from-[#044bd8] via-[#0757ee] to-[#0b6cff] text-white shadow-lg shadow-blue-950/15">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 md:hidden">
          <div className="flex min-h-12 items-center gap-2">
            <MobileMenu user={user} logout={logout} setLocationOpen={setLocationOpen} deliveryLocation={deliveryLocation} />
            <BrandBlock compact />
            {user && <Link href="/notifications"><Button variant="ghost" size="icon" className="text-white hover:bg-white/10"><Bell className="h-5 w-5" /></Button></Link>}
            <CartButton compact />
          </div>
          <button type="button" onClick={() => setLocationOpen(true)} className="flex w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-left text-xs leading-tight shadow-inner shadow-white/5">
            <MapPin className="h-4 w-4 flex-shrink-0 text-yellow-200" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">Deliver to {deliveryLocation.area || "Live GPS"}</span>
              <span className="block truncate text-white/80">{deliveryLocation.pincode || "Select location"}</span>
            </span>
          </button>
          {renderSearchBox({ mobile: true })}
        </div>

        <div className="hidden md:block">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(150px,220px)_minmax(135px,190px)_minmax(220px,1fr)_minmax(0,auto)] items-center gap-2 px-4 py-3 xl:grid-cols-[minmax(190px,260px)_minmax(150px,210px)_minmax(300px,1fr)_minmax(0,auto)] xl:gap-3">
            <BrandBlock />
            <button type="button" onClick={() => setLocationOpen(true)} className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-left text-xs leading-tight shadow-inner shadow-white/5 transition-colors hover:bg-white/15">
              <MapPin className="h-4 w-4 flex-shrink-0 text-yellow-200" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-white/65">Deliver to</span>
                <span className="block truncate font-bold">{deliveryLocation.area || "Live GPS near you"}</span>
                <span className="block truncate text-white/80">{deliveryLocation.pincode || "Select pincode"}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-white/70" />
            </button>
            {renderSearchBox()}
            <div className="flex min-w-0 items-center justify-end gap-0.5 xl:gap-1">
              {user && <Link href="/notifications"><Button variant="ghost" size="sm" className="h-10 rounded-xl px-2 text-white hover:bg-white/10 2xl:px-3"><Bell className="h-5 w-5" /><span className="ml-2 hidden 2xl:inline">{t("Notifications")}</span></Button></Link>}
              {user && <Link href="/wishlist"><Button variant="ghost" size="sm" className="hidden h-10 rounded-xl px-2 text-white hover:bg-white/10 lg:inline-flex 2xl:px-3"><Heart className="h-5 w-5" /><span className="ml-2 hidden 2xl:inline">{t("Wishlist")}</span></Button></Link>}
              {user && <Link href="/orders"><Button variant="ghost" size="sm" className="hidden h-10 rounded-xl px-2 text-white hover:bg-white/10 lg:inline-flex 2xl:px-3"><Package className="h-5 w-5" /><span className="ml-2 hidden 2xl:inline">{t("Orders")}</span></Button></Link>}
              {user ? (
                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="h-10 max-w-[122px] overflow-hidden rounded-2xl bg-white/10 px-2 text-white hover:bg-white/15 xl:max-w-[155px] 2xl:px-3" data-testid="link-profile">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 ring-1 ring-white/25">
                      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
                    </span>
                    <span className="hidden max-w-[82px] truncate lg:inline xl:max-w-[100px]">{user.name}</span>
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login"><Button size="sm" className="rounded-full bg-white px-5 font-bold text-[#0f3f8f] shadow-sm hover:bg-gray-100">{t("Login")}</Button></Link>
              )}
              <CartButton />
            </div>
          </div>

          <div className="border-t border-white/10 bg-blue-950/12 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-2">
              <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
                {desktopNavLinks.map(({ href, label, icon: Icon }) => {
                  const active = isRouteActive(href, label);
                  return (
                    <Link key={`${href}-${label}`} href={href} className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${active ? "bg-white/16 text-white ring-1 ring-white/20" : "text-white/88 hover:bg-white/10 hover:text-white"}`}>
                      <Icon className="h-[18px] w-[18px]" />
                      <span>{t(label)}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="hidden shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 lg:flex">
                <Truck className="h-4 w-4 text-yellow-200" />
                5km local coverage
              </div>
            </div>
          </div>
        </div>
      </header>

      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> {t("Select delivery pincode")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
              <p className="font-semibold text-blue-950">{t("Delivery in 40 minutes")}</p>
              <p className="text-blue-700">Pincode dile area select hobe, ba live GPS diye exact location save korte parben.</p>
            </div>
            <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={applyLiveGps} disabled={locatingGps}>
              <Navigation className="h-4 w-4" />
              {locatingGps ? t("Getting live GPS...") : t("Use my live GPS location")}
            </Button>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <PickupLocationPicker
                mode="inline"
                initial={deliveryLocation.lat && deliveryLocation.lng ? {
                  lat: deliveryLocation.lat,
                  lng: deliveryLocation.lng,
                  address: deliveryLocation.area || "Selected delivery location",
                  distanceKm: null,
                  available: true,
                  pincode: deliveryLocation.pincode,
                  city: deliveryLocation.city,
                  state: deliveryLocation.state,
                  area: deliveryLocation.area,
                } : null}
                title="Select live delivery location"
                subtitle="GPS use korun, map move/tap korun. Pincode and nearby products will update automatically."
                confirmLabel="Use This Location"
                compact
                onClose={() => undefined}
                onConfirm={applyMapLocation}
              />
            </div>
            <div className="space-y-2 rounded-lg border bg-white p-3">
              <Label htmlFor="google-place">Search address / landmark</Label>
              <div className="flex gap-2">
                <Input id="google-place" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="Building, road, shop, landmark" />
                <Button type="button" variant="outline" onClick={searchPlaces} disabled={placesLoading}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {placeSuggestions.length > 0 && (
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {placeSuggestions.slice(0, 5).map((place) => (
                    <button key={place.place_id ?? place.description} type="button" className="w-full rounded-md border p-2 text-left text-xs hover:border-primary hover:bg-blue-50" onClick={() => applyPlace(place)}>
                      <span className="block font-semibold">{place.structured_formatting?.main_text ?? place.description}</span>
                      <span className="text-muted-foreground">{place.structured_formatting?.secondary_text ?? place.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {deliveryLocation.source === "gps" && (
              <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-xs text-green-800">
                Live GPS saved: {deliveryLocation.lat.toFixed(5)}, {deliveryLocation.lng.toFixed(5)}
                {deliveryLocation.accuracy ? ` - accuracy ${deliveryLocation.accuracy}m` : ""}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="delivery-pincode">{t("Pincode")}</Label>
              <div className="flex gap-2">
                <Input
                  id="delivery-pincode"
                  inputMode="numeric"
                  maxLength={6}
                  value={pincodeInput}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                    setPincodeInput(next);
                    setPincodeError("");
                    if (next.length === 6 && lookupPincode(next)) {
                      window.setTimeout(() => applyPincode(next), 0);
                    }
                  }}
                  placeholder="700156"
                />
                <Button type="button" onClick={() => applyPincode()} className="px-3">
                  <LocateFixed className="h-4 w-4" />
                </Button>
              </div>
              {pincodeError && <p className="text-xs text-red-500">{pincodeError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PINCODE_LOCATIONS.slice(0, 6).map((item) => (
                <button key={item.pincode} type="button" onClick={() => applyPincode(item.pincode)} className={`rounded-lg border p-3 text-left text-xs transition-colors ${deliveryLocation.pincode === item.pincode ? "border-primary bg-orange-50" : "bg-white hover:border-primary/40"}`}>
                  <span className="block font-semibold">{item.area}</span>
                  <span className="text-muted-foreground">{item.city} - {item.pincode}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main className="app-content mobile-bottom-safe mx-auto max-w-7xl px-3 py-4 md:px-5 md:py-6">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid max-w-full grid-cols-5 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        {MOBILE_LINKS.map(({ href, label, icon: Icon, auth }) => {
          const target = auth && !user ? "/login" : href;
          const active = href === "/" ? location === "/" : label === "Categories" ? location === "/search" : location.startsWith(href);
          return (
            <Link key={label} href={target} className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold ${active ? "text-[#0757ee]" : "text-gray-600"}`}>
              {active && <span className="absolute top-1 h-1 w-7 rounded-full bg-[#0757ee]" />}
              <Icon className="h-5 w-5 stroke-[2.2]" />
              {t(label)}
            </Link>
          );
        })}
      </nav>

      <footer className="mt-auto hidden border-t bg-[#111827] text-white md:block">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-xl font-bold">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-[#0f3f8f]"><Zap className="h-5 w-5" /></span>
              Chowdhary Mart
            </div>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
              Local marketplace for grocery, fashion, electronics and daily needs with 40 minute delivery coverage inside your service area.
            </p>
          </div>
          <FooterColumn title="Shop" links={[["Categories", "/search"], ["Offers", "/coupons"], ["Wishlist", "/wishlist"], ["Cart", "/cart"]]} />
          <FooterColumn title="Support" links={[["Help Center", "/help"], ["My Orders", "/orders"], ["My Returns", "/returns"], ["Privacy Settings", "/privacy"]]} />
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white/70">Policies</h3>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Delivery may vary by live location and stock. If delivery cannot be completed for operational reasons, the order acceptance policy still applies. Damaged items are return eligible.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
          &copy; {new Date().getFullYear()} Chowdhary Mart. Original marketplace experience with live local delivery.
        </div>
      </footer>
    </div>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl px-1 font-bold tracking-tight transition-colors hover:bg-white/10 md:flex-none">
      <span className={`${compact ? "h-10 w-10" : "h-11 w-11"} flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm`}>
        <img src="/app-logo.png" alt="Chowdhary Mart" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 max-w-full leading-tight">
        <span className={`block truncate italic ${compact ? "text-xl" : "text-2xl xl:text-3xl"}`}>Chowdhary Mart</span>
        <span className="block truncate text-xs font-semibold text-yellow-300">Local Plus - 40 min delivery</span>
      </span>
    </Link>
  );
}

function MobileMenu({
  user,
  logout,
  setLocationOpen,
  deliveryLocation,
}: {
  user: any;
  logout: () => void;
  setLocationOpen: (open: boolean) => void;
  deliveryLocation: DeliveryLocation;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <div className="mb-6 mt-4 flex items-center gap-2 text-xl font-bold text-primary">
          <img src="/app-logo.png" alt="Chowdhary Mart" className="h-9 w-9 rounded-xl object-contain" /> Chowdhary Mart
        </div>
        <button type="button" onClick={() => setLocationOpen(true)} className="mb-4 w-full rounded-lg bg-orange-50 p-3 text-left text-sm">
          <p className="font-semibold">{deliveryLocation.pincode ? `Delivering to ${deliveryLocation.area}` : "Select live delivery location"}</p>
          <p className="text-muted-foreground">{deliveryLocation.city} - {deliveryLocation.pincode}{deliveryLocation.source === "gps" ? " - Live GPS" : ""}</p>
        </button>
        <div className="flex flex-col gap-2">
          <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"><Home className="h-4 w-4" /> Home</Link>
          <Link href="/search" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"><Grid2X2 className="h-4 w-4" /> Categories</Link>
          {user && <Link href="/orders" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"><Package className="h-4 w-4" /> Orders</Link>}
          {user && <Link href="/wishlist" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"><Heart className="h-4 w-4" /> Wishlist</Link>}
          {user?.role === "admin" && <Link href="/admin/dashboard" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"><Settings className="h-4 w-4" /> Admin Dashboard</Link>}
        </div>
        {user && <Button variant="outline" className="mt-6 w-full" onClick={logout}>Sign out</Button>}
      </SheetContent>
    </Sheet>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-white/70">{title}</h3>
      <div className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <Link key={label} href={href} className="block text-sm text-white/70 hover:text-white">{label}</Link>
        ))}
      </div>
    </div>
  );
}
