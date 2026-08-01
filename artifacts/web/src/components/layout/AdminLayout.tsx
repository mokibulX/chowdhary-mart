import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Home, LayoutDashboard, Users, ShoppingBag, Store, Tag, LogOut, Images, ShieldCheck, Menu, Wallet, MapPinned, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/", label: "Shop Home", icon: Home },
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/approvals", label: "Shop Approvals", icon: ShieldCheck },
  { href: "/admin/zones", label: "Service Zones", icon: MapPinned },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/catalog", label: "Catalog & Image Library", icon: Images },
  { href: "/admin/homepage", label: "Homepage Management", icon: PanelsTopLeft },
  { href: "/admin/stores", label: "Stores", icon: Store },
  { href: "/admin/coupons", label: "Coupons", icon: Tag },
  { href: "/admin/wallet", label: "Wallet", icon: Wallet },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const navItems = (mobile = false) => (
    <nav className={mobile ? "space-y-1" : "flex-1 p-3 space-y-1"}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === href : href === "/admin" ? location === href : location.startsWith(href);
        const item = (
          <div
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-primary text-white" : mobile ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-slate-800"
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
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 px-3 py-3 text-white shadow-sm md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => window.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link href="/">
              <div className="flex min-w-0 items-center gap-2">
                <img src="/app-logo.png" alt="Chowdhary Mart" className="h-9 w-9 rounded-xl bg-white object-cover" />
                <div className="min-w-0">
                <div className="truncate text-base font-bold">Chowdhary Mart</div>
                <div className="text-xs text-slate-300">Admin Panel</div>
                </div>
              </div>
            </Link>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-200 hover:bg-slate-800 hover:text-white" aria-label="Open admin menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="app-scroll-panel w-[86vw] max-w-xs p-0">
              <div className="border-b bg-slate-900 p-5 text-white">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <img src="/app-logo.png" alt="Chowdhary Mart" className="h-10 w-10 rounded-xl bg-white object-cover" />
                  Chowdhary Mart
                </div>
                <div className="text-xs text-slate-300">Admin Panel</div>
              </div>
              <div className="p-3">{navItems(true)}</div>
              <div className="mt-auto border-t p-3">
                <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.name}</div>
                <SheetClose asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-red-500" onClick={logout} data-testid="btn-logout-mobile">
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <aside className="app-scroll-panel sticky top-0 z-10 hidden h-[100dvh] w-72 shrink-0 flex-col overflow-y-auto bg-slate-950 text-white md:flex">
        <div className="border-b border-white/10 p-5">
          <Button variant="ghost" size="sm" className="mb-3 w-full justify-start rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Link href="/">
            <Button variant="outline" size="sm" className="mb-4 w-full justify-start rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20">
              <Home className="mr-2 h-4 w-4" /> Shop Home
            </Button>
          </Link>
          <Link href="/">
            <div className="flex items-center gap-3 text-white">
              <img src="/app-logo.png" alt="Chowdhary Mart" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1" />
              <div className="min-w-0">
                <div className="leading-tight text-xl font-black">Chowdhary Mart</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Admin Panel</div>
              </div>
            </div>
          </Link>
        </div>
        {navItems()}
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">{user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl text-slate-300 hover:bg-red-500/10 hover:text-red-300" onClick={logout} data-testid="btn-logout">
            <LogOut className="w-4 h-4 mr-2" />Sign Out
          </Button>
        </div>
      </aside>
      <main className="app-content mobile-bottom-safe min-w-0 flex-1 px-3 py-4 sm:px-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
