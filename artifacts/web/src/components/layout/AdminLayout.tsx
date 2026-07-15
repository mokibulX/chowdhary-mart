import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, LayoutDashboard, Users, ShoppingBag, Store, Tag, LogOut, Grid3X3, ShieldCheck, Menu, Wallet, MapPinned, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/approvals", label: "Shop Approvals", icon: ShieldCheck },
  { href: "/admin/zones", label: "Service Zones", icon: MapPinned },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/catalog", label: "Catalog CRUD", icon: Grid3X3 },
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
        const active = href === "/admin" ? location === href : location.startsWith(href);
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
              <div className="min-w-0">
                <div className="truncate text-base font-bold">Chowdhary Mart</div>
                <div className="text-xs text-slate-300">Admin Panel</div>
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
                <div className="text-lg font-bold">Chowdhary Mart</div>
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

      <aside className="fixed inset-y-0 z-10 hidden w-56 flex-col bg-slate-900 text-white md:flex">
        <div className="p-5 border-b border-slate-700">
          <Button variant="ghost" size="sm" className="mb-3 w-full justify-start text-slate-300 hover:text-white" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Link href="/">
            <div className="font-bold text-white text-lg">Chowdhary Mart</div>
          </Link>
          <div className="text-xs text-slate-400 mt-0.5">Admin Panel</div>
        </div>
        {navItems()}
        <div className="p-3 border-t border-slate-700">
          <div className="text-xs text-slate-400 px-3 mb-2 truncate">{user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-red-400" onClick={logout} data-testid="btn-logout">
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
