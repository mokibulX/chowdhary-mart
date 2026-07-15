import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { customFetch, useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { Bell, ChevronDown, Grid2X2, Headphones, Heart, Home, Loader2, LocateFixed, MapPin, Menu, Navigation, Package, Search, Settings, ShoppingCart, Store, Truck, User, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getSavedDeliveryLocation, lookupPincode, nearestDeliveryLocation, PINCODE_LOCATIONS, saveDeliveryLocation, type DeliveryLocation } from "@/lib/pincode";
import { getBrowserLocation } from "@/lib/live-location";
import { useI18n } from "@/lib/i18n";

interface CustomerLayoutProps {
  children: ReactNode;
}

const QUICK_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Categories", icon: Grid2X2 },
  { href: "/orders", label: "Orders", icon: Package, auth: true },
  { href: "/wishlist", label: "Wishlist", icon: Heart, auth: true },
  { href: "/help", label: "Help", icon: Headphones, auth: true },
];

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
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
  const { data: cart } = useGetCart({
    query: { enabled: !!user, queryKey: getGetCartQueryKey() },
  });
  const zoneId = (deliveryLocation as DeliveryLocation & { zoneId?: number }).zoneId;
  const { data: suggestions, isFetching: loadingSuggestions } = useQuery({
    queryKey: ["/api/search/suggestions", debouncedSearch, zoneId],
    queryFn: () => customFetch<{ items: any[] }>(`/api/search/suggestions?q=${encodeURIComponent(debouncedSearch)}${zoneId ? `&zoneId=${zoneId}` : ""}&limit=8`),
    enabled: suggestOpen && debouncedSearch.trim().length >= 1,
  });
  const suggestionItems = suggestions?.items ?? [];

  const cartItemCount = cart?.itemCount || 0;
  const navLinks = [
    ...QUICK_LINKS.filter((item) => !item.auth || user),
    ...(user?.role === "vendor" && ((user as any).vendorStatus === "approved" || !(user as any).vendorStatus)
      ? [{ href: "/vendor/products", label: "Seller", icon: Store }]
      : []),
  ];
  const bottomLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Categories", icon: Grid2X2 },
    { href: user ? "/notifications" : "/login", label: "Notifications", icon: Bell },
    { href: user ? "/profile" : "/login", label: "Account", icon: User },
    { href: user ? "/cart" : "/login", label: "Cart", icon: ShoppingCart, count: cartItemCount },
  ];

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

  const applyLocation = (location: DeliveryLocation, closeDialog = true) => {
    saveDeliveryLocation(location);
    setDeliveryLocation(location);
    setPincodeInput(location.pincode);
    setPincodeError("");
    if (closeDialog) setLocationOpen(false);
  };

  const applyPincode = (value = pincodeInput, closeDialog = true) => {
    const found = lookupPincode(value);
    if (!found) {
      setPincodeError("Ei demo-te ei pincode serviceable noy. Nicher popular pincode try korun.");
      return;
    }
    applyLocation({ ...found, source: "pincode" }, closeDialog);
  };

  const applyLiveGps = async () => {
    setLocatingGps(true);
    setPincodeError("");
    try {
      const gps = await getBrowserLocation();
      const nearest = nearestDeliveryLocation(gps.lat, gps.lng);
      const selected: DeliveryLocation = {
        ...nearest.location,
        area: `Live GPS near ${nearest.location.area}`,
        lat: gps.lat,
        lng: gps.lng,
        source: "gps",
        accuracy: gps.accuracy,
        capturedAt: gps.capturedAt,
      };
      applyLocation(selected);
    } catch (error) {
      setPincodeError((error as Error).message);
    } finally {
      setLocatingGps(false);
    }
  };

  const NavLinks = () => (
    <>
      {navLinks.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <Link key={href} href={href} className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all ${active ? "bg-white text-[#0757ee] shadow-sm" : "text-white/90 hover:bg-white/12 hover:text-white"}`}>
            <Icon className="h-4 w-4" /> {t(label)}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="app-shell bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-blue-700/40 bg-gradient-to-r from-[#044bd8] via-[#0757ee] to-[#0b6cff] text-white shadow-lg shadow-blue-950/15">
        <div className="mx-auto flex min-h-[112px] w-full max-w-7xl flex-wrap items-center gap-2 px-3 py-3 md:min-h-[78px] md:flex-nowrap md:gap-4 md:px-5 md:py-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <div className="mb-6 mt-4 flex items-center gap-2 text-xl font-bold text-primary">
                <Zap className="h-5 w-5" /> Chowdhary Mart
              </div>
              <button type="button" onClick={() => setLocationOpen(true)} className="mb-4 w-full rounded-lg bg-orange-50 p-3 text-left text-sm">
                <p className="font-semibold">{deliveryLocation.pincode ? `Delivering to ${deliveryLocation.area}` : "Select live delivery location"}</p>
                <p className="text-muted-foreground">{deliveryLocation.city} - {deliveryLocation.pincode}{deliveryLocation.source === "gps" ? " · Live GPS" : ""}</p>
              </button>
              <div className="flex flex-col gap-2">
                {user?.role === "vendor" && ((user as any).vendorStatus === "approved" || !(user as any).vendorStatus) && (
                  <button type="button" onClick={() => setLocation("/vendor/products")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5">
                    <Store className="h-4 w-4" /> Seller
                  </button>
                )}
                {user?.role === "admin" && (
                  <button type="button" onClick={() => setLocation("/admin")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5">
                    <Settings className="h-4 w-4" /> Admin Dashboard
                  </button>
                )}
                <NavLinks />
              </div>
              {user && (
                <Button variant="outline" className="mt-6 w-full" onClick={logout}>Sign out</Button>
              )}
            </SheetContent>
          </Sheet>

          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-1 font-bold tracking-tight transition-colors hover:bg-white/10 md:min-w-fit md:flex-none md:pr-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0f3f8f] shadow-sm">
              <Zap className="h-5 w-5" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xl italic md:text-2xl">Chowdhary Mart</span>
              <span className="block text-xs font-semibold text-yellow-300">Local Plus · 40 min delivery</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="hidden max-w-[220px] items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-left text-xs leading-tight shadow-inner shadow-white/5 transition-colors hover:bg-white/15 lg:flex"
          >
            <MapPin className="h-4 w-4 flex-shrink-0 text-yellow-200" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{deliveryLocation.pincode ? deliveryLocation.area : "Use live GPS"}</span>
              <span className="block truncate text-white/80">{deliveryLocation.pincode || "Select location"}</span>
            </span>
          </button>

          <form onSubmit={submitSearch} className="relative order-last min-w-0 w-full md:order-none md:flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={handleSearchKey}
              onChange={(event) => {
                setSearch(event.target.value);
                setSuggestOpen(true);
              }}
              placeholder={t("Search products, brands and local shops")}
              className="h-12 rounded-2xl border-0 bg-white pl-11 pr-11 text-base text-gray-950 shadow-md shadow-blue-950/15 placeholder:text-gray-500 md:h-12 md:rounded-full md:text-sm"
            />
            {search && (
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100" onClick={() => { setSearch(""); setDebouncedSearch(""); }}>
                <X className="h-4 w-4" />
              </button>
            )}
            {suggestOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[72vh] overflow-hidden rounded-2xl border bg-white text-gray-950 shadow-2xl shadow-blue-950/20">
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
                            <p className="line-clamp-1 text-xs text-muted-foreground">{item.brand || item.category || "Product"} · {item.unit || "unit"} · {item.shopName}</p>
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

          <nav className="hidden items-center gap-1 xl:flex">
            <NavLinks />
          </nav>

          <div className="flex min-w-fit items-center gap-1">
            {user?.role === "admin" && (
              <Button type="button" variant="ghost" size="sm" className="hidden rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15 md:flex" onClick={() => setLocation("/admin")} data-testid="link-admin">
                {t("Admin Panel")}
              </Button>
            )}
            {user?.role === "vendor" && ((user as any).vendorStatus === "approved" || !(user as any).vendorStatus) && (
              <Button type="button" variant="ghost" size="sm" className="hidden rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15 md:flex" onClick={() => setLocation("/vendor/products")} data-testid="link-seller">
                Seller
              </Button>
            )}
            {user && (
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="hidden rounded-full text-white hover:bg-white/10 sm:flex md:hidden lg:flex">
                  <Bell className="mr-1 h-5 w-5" />
                  <span className="hidden lg:inline">{t("Notifications")}</span>
                </Button>
              </Link>
            )}
            {user ? (
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="hidden max-w-[180px] rounded-full bg-white/10 text-white hover:bg-white/15 md:flex" data-testid="link-profile">
                  <User className="mr-2 h-4 w-4" />
                  <span className="truncate">{user.name}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Link href="/login"><Button size="sm" className="rounded-full bg-white px-5 font-bold text-[#0f3f8f] shadow-sm hover:bg-gray-100">{t("Login")}</Button></Link>
            )}
            {user && (
              <Link href="/cart">
                <Button variant="ghost" className="relative rounded-full p-2 text-white hover:bg-white/10" data-testid="link-cart">
                  <ShoppingCart className="h-5 w-5" />
                  {cartItemCount > 0 && (
                    <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-300 px-1 text-[10px] font-bold text-gray-950">
                      {cartItemCount}
                    </span>
                  )}
                </Button>
              </Link>
            )}
          </div>
        </div>
        <div className="hidden border-t border-white/10 bg-blue-950/12 backdrop-blur md:block xl:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-2">
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
              <NavLinks />
            </nav>
            <div className="hidden shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 lg:flex">
              <Truck className="h-4 w-4 text-yellow-200" />
              5km local coverage
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
            {deliveryLocation.source === "gps" && (
              <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-xs text-green-800">
                Live GPS saved: {deliveryLocation.lat.toFixed(5)}, {deliveryLocation.lng.toFixed(5)}
                {deliveryLocation.accuracy ? ` · accuracy ${deliveryLocation.accuracy}m` : ""}
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
                <button
                  key={item.pincode}
                  type="button"
                  onClick={() => applyPincode(item.pincode)}
                  className={`rounded-lg border p-3 text-left text-xs transition-colors ${deliveryLocation.pincode === item.pincode ? "border-primary bg-orange-50" : "bg-white hover:border-primary/40"}`}
                >
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

      <nav className="fixed inset-x-0 bottom-0 z-50 grid max-w-full grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottomLinks.map(({ href, label, icon: Icon, count }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={label} href={href} className={`relative flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium ${active ? "text-[#0757ee]" : "text-gray-600"}`}>
              <span className="relative">
                <Icon className="h-5 w-5" />
                {!!count && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-300 px-1 text-[10px] font-bold text-gray-950">{count}</span>
                )}
              </span>
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
