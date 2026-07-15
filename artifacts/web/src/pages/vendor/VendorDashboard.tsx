import { customFetch, useGetVendorDashboard, getGetVendorDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, TrendingUp, Clock, Package, Power, Store } from "lucide-react";
import { Link } from "wouter";
import { WalletSummaryCard } from "@/components/WalletSummaryCard";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
};

export default function VendorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: dashboard, isLoading } = useGetVendorDashboard({
    query: { enabled: !!user, queryKey: getGetVendorDashboardQueryKey() },
  });
  const store = (dashboard as any)?.store;
  const isStoreOpen = store?.isOpen !== false;

  const stats = [
    { label: "Today's Orders", value: dashboard?.todayOrders ?? 0, icon: ShoppingBag, color: "text-primary" },
    { label: "Today's Revenue", value: `₹${Number(dashboard?.todayRevenue ?? 0).toFixed(0)}`, icon: TrendingUp, color: "text-green-600" },
    { label: "Pending Orders", value: dashboard?.pendingOrders ?? 0, icon: Clock, color: "text-orange-500" },
    { label: "Total Products", value: dashboard?.totalProducts ?? 0, icon: Package, color: "text-purple-600" },
  ];

  const toggleStore = async () => {
    try {
      await customFetch("/api/vendor/store", {
        method: "PATCH",
        body: JSON.stringify({ isOpen: !isStoreOpen }),
      });
      qc.invalidateQueries({ queryKey: getGetVendorDashboardQueryKey() });
      toast({ title: !isStoreOpen ? "Store activated" : "Store deactivated", description: !isStoreOpen ? "Customers can order your products now." : "Customers will see: Seller is not active." });
    } catch (error) {
      toast({ title: "Store status update failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Welcome back, {user?.name}</p>
      </div>

      <Card className={isStoreOpen ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 ${isStoreOpen ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">{store?.name ?? "Your store"}</p>
              <p className={`text-sm ${isStoreOpen ? "text-green-800" : "text-red-800"}`}>
                {isStoreOpen ? "Active. Customers can order your products." : "Inactive. Customers will see: Seller is not active."}
              </p>
            </div>
          </div>
          <Button onClick={toggleStore} variant={isStoreOpen ? "destructive" : "default"} disabled={isLoading}>
            <Power className="mr-2 h-4 w-4" /> {isStoreOpen ? "Deactivate store" : "Activate store"}
          </Button>
        </CardContent>
      </Card>

      {!isLoading && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <WalletSummaryCard href="/vendor/wallet" title="Seller wallet" />
          <Card className="border-blue-100 bg-blue-50">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="text-sm text-blue-800">Online payments</p>
                <p className="text-xl font-bold text-blue-900">Rs.{Number((dashboard as any)?.onlineRevenue ?? 0).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700">COD orders</p>
                <p className="text-xl font-bold text-gray-900">Rs.{Number((dashboard as any)?.codRevenue ?? 0).toFixed(0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
