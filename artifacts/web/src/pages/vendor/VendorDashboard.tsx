import { useGetVendorDashboard, getGetVendorDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, TrendingUp, Clock, Package } from "lucide-react";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
};

export default function VendorDashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading } = useGetVendorDashboard({
    query: { enabled: !!user, queryKey: getGetVendorDashboardQueryKey() },
  });

  const stats = [
    { label: "Today's Orders", value: dashboard?.todayOrders ?? 0, icon: ShoppingBag, color: "text-primary" },
    { label: "Today's Revenue", value: `₹${Number(dashboard?.todayRevenue ?? 0).toFixed(0)}`, icon: TrendingUp, color: "text-green-600" },
    { label: "Pending Orders", value: dashboard?.pendingOrders ?? 0, icon: Clock, color: "text-orange-500" },
    { label: "Total Products", value: dashboard?.totalProducts ?? 0, icon: Package, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Welcome back, {user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              {isLoading ? (
                <Skeleton className="h-12" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold">{value}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This Week</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-green-600">₹{Number(dashboard?.weekRevenue ?? 0).toFixed(0)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This Month</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">₹{Number(dashboard?.monthRevenue ?? 0).toFixed(0)}</p></CardContent>
          </Card>
        </div>
      )}

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Link href="/vendor/orders" className="text-sm text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !dashboard?.recentOrders?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {(dashboard.recentOrders as any[]).map((order: any) => (
                <Link key={order.id} href={`/vendor/orders`}>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">#{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {order.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="font-bold text-sm">₹{Number(order.total).toFixed(0)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
