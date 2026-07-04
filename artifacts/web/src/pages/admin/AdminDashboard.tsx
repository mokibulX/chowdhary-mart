import { useGetAdminDashboard, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingBag, TrendingUp, Store, Clock, Bike, Image, Grid3X3, BadgePercent } from "lucide-react";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading } = useGetAdminDashboard({
    query: { enabled: !!user, queryKey: getGetAdminDashboardQueryKey() },
  });

  const stats = [
    { label: "Total Users", value: dashboard?.totalUsers ?? 0, icon: Users, color: "text-blue-600", href: "/admin/users" },
    { label: "Total Orders", value: dashboard?.totalOrders ?? 0, icon: ShoppingBag, color: "text-primary", href: "/admin/orders" },
    { label: "Total Revenue", value: `₹${Number(dashboard?.totalRevenue ?? 0).toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-green-600", href: "/admin/orders" },
    { label: "Stores", value: dashboard?.totalStores ?? 0, icon: Store, color: "text-purple-600", href: "/admin/stores" },
    { label: "Today Orders", value: dashboard?.todayOrders ?? 0, icon: Clock, color: "text-orange-500", href: "/admin/orders" },
    { label: "Today Revenue", value: `₹${Number(dashboard?.todayRevenue ?? 0).toFixed(0)}`, icon: TrendingUp, color: "text-emerald-600", href: "/admin/orders" },
    { label: "Active Riders", value: dashboard?.activeDeliveryPartners ?? 0, icon: Bike, color: "text-cyan-600", href: "/admin/users" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Welcome, {user?.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                {isLoading ? (
                  <Skeleton className="h-12" />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-2xl font-bold">{value}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Marketplace controls</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Link href="/admin/coupons">
            <div className="rounded-lg border p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <BadgePercent className="mb-3 h-5 w-5 text-primary" />
              <p className="font-semibold">Discounts & coupons</p>
              <p className="text-sm text-muted-foreground">Create offers and campaign codes.</p>
            </div>
          </Link>
          <Link href="/admin#banners">
            <div id="banners" className="rounded-lg border p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <Image className="mb-3 h-5 w-5 text-blue-600" />
              <p className="font-semibold">Banners & ads</p>
              <p className="text-sm text-muted-foreground">Review active homepage promotions.</p>
            </div>
          </Link>
          <Link href="/admin#categories">
            <div id="categories" className="rounded-lg border p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <Grid3X3 className="mb-3 h-5 w-5 text-green-700" />
              <p className="font-semibold">Category experience</p>
              <p className="text-sm text-muted-foreground">Category images are shown on the customer home page.</p>
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Link href="/admin/orders" className="text-sm text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !dashboard?.recentOrders?.length ? (
            <p className="text-center py-6 text-muted-foreground text-sm">No orders yet</p>
          ) : (
            <div className="divide-y">
              {(dashboard.recentOrders as any[]).map((order: any) => (
                <div key={order.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">#{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.store?.name ?? "Store"} · {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="font-bold text-sm">₹{Number(order.total).toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
