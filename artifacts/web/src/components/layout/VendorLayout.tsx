import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Package, ShoppingBag, Store, LogOut, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/vendor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
  { href: "/vendor/products", label: "Products", icon: Package },
  { href: "/vendor/store", label: "Store Settings", icon: Store },
];

export function VendorLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col fixed h-full z-10">
        <div className="p-5 border-b">
          <Link href="/">
            <div className="font-bold text-primary text-lg">Chowdhary Mart</div>
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">Vendor Panel</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/vendor" ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${active ? "bg-primary text-white" : "text-muted-foreground hover:bg-gray-100"}`} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <div className="text-xs text-muted-foreground px-3 mb-2 truncate">{user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-red-500" onClick={logout} data-testid="btn-logout">
            <LogOut className="w-4 h-4 mr-2" />Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 ml-56 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}
