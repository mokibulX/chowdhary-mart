import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Users, ShoppingBag, Store, Tag, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/stores", label: "Stores", icon: Store },
  { href: "/admin/coupons", label: "Coupons", icon: Tag },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-5 border-b border-slate-700">
          <Link href="/">
            <div className="font-bold text-white text-lg">Chowdhary Mart</div>
          </Link>
          <div className="text-xs text-slate-400 mt-0.5">Admin Panel</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${active ? "bg-primary text-white" : "text-slate-300 hover:bg-slate-800"}`} data-testid={`nav-${label.toLowerCase()}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <div className="text-xs text-slate-400 px-3 mb-2 truncate">{user?.name}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-red-400" onClick={logout} data-testid="btn-logout">
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
