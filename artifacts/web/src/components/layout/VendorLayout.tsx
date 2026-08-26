import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Home, LayoutDashboard, Package, ShoppingBag, Store, LogOut, Menu, Wallet, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/", label: "Shop Home", icon: Home },
  { href: "/vendor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
  { href: "/vendor/stock", label: "Stock", icon: Boxes },
  { href: "/vendor/products", label: "Products", icon: Package },
  { href: "/vendor/store", label: "Store Settings", icon: Store },
  { href: "/vendor/wallet", label: "Wallet", icon: Wallet },
];

export function VendorLayout({ children }: { children: ReactNode }) {
  const { user, confirmLogout } = useAuth();
  const [location] = useLocation();

  const navItems = (mobile = false) => (
    <nav className={mobile ? "space-y-1" : "flex-1 p-3 space-y-1"}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === href : href === "/vendor" ? location === href : location.startsWith(href);
        const item = (
          <div
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-primary text-white" : "text-muted-foreground hover:bg-gray-100"
            }`}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
        );
        return (
          <Link key={href} href={href}>
            {mobile ? <SheetClose asChild>{item}</SheetClose> : item}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell bg-gray-50 md:flex md:flex-row">
      <header className="sticky top-0 z-40 border-b bg-white px-3 py-3 shadow-sm md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => window.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link href="/">
              <div className="flex min-w-0 items-center gap-2">
                <img src="/app-logo.png" alt="Chowdhary Mart" className="h-9 w-9 rounded-xl object-cover" />
                <div className="min-w-0">
                <div className="truncate text-base font-bold text-primary">Chowdhary Mart</div>
                <div className="text-xs text-muted-foreground">Seller Panel</div>
                </div>
              </div>
            </Link>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Open seller menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="app-scroll-panel w-[86vw] max-w-xs p-0">
              <div className="border-b bg-primary p-5 text-primary-foreground">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <img src="/app-logo.png" alt="Chowdhary Mart" className="h-10 w-10 rounded-xl bg-white object-cover" />
                  Chowdhary Mart
                </div>
                <div className="text-xs opacity-80">Seller Panel</div>
              </div>
              <div className="p-3">{navItems(true)}</div>
              <div className="mt-auto border-t p-3">
                <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.name}</div>
                <SheetClose asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-red-500" onClick={confirmLogout} data-testid="btn-logout-mobile">
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <aside className="fixed inset-y-0 z-10 hidden w-56 flex-col border-r bg-white md:flex">
        <div className="p-5 border-b">
          <Button variant="ghost" size="sm" className="mb-3 w-full justify-start text-muted-foreground" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Link href="/">
            <Button variant="outline" size="sm" className="mb-3 w-full justify-start">
              <Home className="mr-2 h-4 w-4" /> Shop Home
            </Button>
          </Link>
          <Link href="/">
          <div className="flex items-center gap-2 text-lg font-bold text-primary">
            <img src="/app-logo.png" alt="Chowdhary Mart" className="h-10 w-10 rounded-xl object-cover" />
            Chowdhary Mart
          </div>
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">Vendor Panel</div>
        </div>
        {navItems()}
        <div className="p-3 border-t">
          <div className="text-xs text-muted-foreground px-3 mb-2 truncate">{user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-red-500" onClick={confirmLogout} data-testid="btn-logout">
            <LogOut className="w-4 h-4 mr-2" />Sign Out
          </Button>
        </div>
      </aside>
      <main className="app-content mobile-bottom-safe min-w-0 px-3 py-4 sm:px-4 md:ml-56 md:p-6">
        {children}
      </main>
    </div>
  );
}
