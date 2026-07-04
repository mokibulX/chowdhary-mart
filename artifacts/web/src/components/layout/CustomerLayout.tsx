import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { Bell, Grid2X2, Headphones, Heart, Home, LocateFixed, MapPin, Menu, Package, Search, ShoppingCart, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getSavedDeliveryLocation, lookupPincode, PINCODE_LOCATIONS, saveDeliveryLocation, type DeliveryLocation } from "@/lib/pincode";

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
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation>(() => getSavedDeliveryLocation());
  const [locationOpen, setLocationOpen] = useState(false);
  const [pincodeInput, setPincodeInput] = useState(deliveryLocation.pincode);
  const [pincodeError, setPincodeError] = useState("");
  const { data: cart } = useGetCart({
    query: { enabled: !!user, queryKey: getGetCartQueryKey() },
  });

  const cartItemCount = cart?.itemCount || 0;
  const navLinks = QUICK_LINKS.filter((item) => !item.auth || user);
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
    setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
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

  const applyPincode = (value = pincodeInput) => {
    const found = lookupPincode(value);
    if (!found) {
      setPincodeError("Ei demo-te ei pincode serviceable noy. Nicher popular pincode try korun.");
      return;
    }
    saveDeliveryLocation(found);
    setDeliveryLocation(found);
    setPincodeInput(found.pincode);
    setPincodeError("");
    setLocationOpen(false);
  };

  const NavLinks = () => (
    <>
      {navLinks.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <Link key={href} href={href} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${active ? "text-primary" : "hover:text-primary"}`}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-50 border-b bg-[#0757ee] text-white shadow-sm">
        <div className="mx-auto flex min-h-[112px] w-full max-w-7xl flex-wrap items-center gap-2 px-3 py-3 md:min-h-16 md:flex-nowrap md:gap-3 md:px-5 md:py-0">
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
                <p className="font-semibold">Delivering to {deliveryLocation.area}</p>
                <p className="text-muted-foreground">{deliveryLocation.city} - {deliveryLocation.pincode}</p>
              </button>
              <div className="flex flex-col gap-2">
                <NavLinks />
              </div>
              {user && (
                <Button variant="outline" className="mt-6 w-full" onClick={logout}>Sign out</Button>
              )}
            </SheetContent>
          </Sheet>

          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 font-bold tracking-tight md:min-w-fit md:flex-none">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-[#0f3f8f]">
              <Zap className="h-5 w-5" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xl italic">Chowdhary Mart</span>
              <span className="block text-xs font-semibold text-yellow-300">Local Plus</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="hidden max-w-[180px] items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-left text-xs leading-tight transition-colors hover:bg-white/15 lg:flex"
          >
            <MapPin className="h-4 w-4 flex-shrink-0 text-yellow-200" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{deliveryLocation.area}</span>
              <span className="block truncate text-white/80">{deliveryLocation.pincode}</span>
            </span>
          </button>

          <form onSubmit={submitSearch} className="relative order-last min-w-0 w-full md:order-none md:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for products, brands and sellers"
              className="h-12 rounded-2xl border-0 bg-white pl-9 text-base text-gray-950 shadow-none placeholder:text-gray-500 md:h-10 md:rounded-md md:text-sm"
            />
          </form>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLinks />
          </nav>

          <div className="flex min-w-fit items-center gap-1">
            {user && (
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="hidden text-white hover:bg-white/10 sm:flex md:hidden lg:flex">
                  <Bell className="mr-1 h-5 w-5" />
                  <span className="hidden lg:inline">Notifications</span>
                </Button>
              </Link>
            )}
            {user ? (
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="hidden text-white hover:bg-white/10 md:flex" data-testid="link-profile">
                  <User className="mr-2 h-4 w-4" />
                  {user.name}
                </Button>
              </Link>
            ) : (
              <Link href="/login"><Button size="sm" className="bg-white text-[#0f3f8f] hover:bg-gray-100">Login</Button></Link>
            )}
            {user && (
              <Link href="/cart">
                <Button variant="ghost" className="relative p-2 text-white hover:bg-white/10" data-testid="link-cart">
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
      </header>

      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Select delivery pincode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
              <p className="font-semibold text-blue-950">Delivery in 40 minutes</p>
              <p className="text-blue-700">Pincode dile app automatically area, city and map location set korbe.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-pincode">Pincode</Label>
              <div className="flex gap-2">
                <Input
                  id="delivery-pincode"
                  inputMode="numeric"
                  maxLength={6}
                  value={pincodeInput}
                  onChange={(event) => {
                    setPincodeInput(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setPincodeError("");
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

      <main className="mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-3 py-4 pb-20 md:px-5 md:py-6">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid max-w-full grid-cols-5 border-t bg-white md:hidden">
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
              {label}
            </Link>
          );
        })}
      </nav>

      <footer className="mt-auto hidden border-t bg-white py-8 md:block">
        <div className="mx-auto max-w-7xl px-5 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Chowdhary Mart. Original marketplace experience with live local delivery.
        </div>
      </footer>
    </div>
  );
}
