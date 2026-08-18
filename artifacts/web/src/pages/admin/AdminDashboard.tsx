import { useGetAdminDashboard, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingBag, TrendingUp, Store, Clock, Bike, Image, Grid3X3, BadgePercent, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { WalletSummaryCard } from "@/components/WalletSummaryCard";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: dashboard, isLoading, isError, refetch } = useGetAdminDashboard({
    query: { enabled: !!user, queryKey: getGetAdminDashboardQueryKey(), refetchOnWindowFocus: true, refetchOnMount: "always" },
  });
  const { data: testControls } = useQuery({
    queryKey: ["/api/admin/test-controls"],
    queryFn: () => customFetch<any>("/api/admin/test-controls"),
    enabled: !!user,
  });
  const seedDemo = useMutation({
    mutationFn: () => customFetch<any>("/api/admin/test-controls/seed", { method: "POST" }),
    onSuccess: (data) => {
      toast({ title: "Demo mode ready", description: data.message });
      qc.invalidateQueries();
    },
    onError: (err: any) => toast({ title: "Demo seed failed", description: err?.data?.error ?? "Enable APP_TEST_MODE first.", variant: "destructive" }),
  });
  const clearDemo = useMutation({
    mutationFn: () => customFetch<any>("/api/admin/test-controls/data", { method: "DELETE" }),
    onSuccess: (data) => {
      toast({ title: "Demo data cleared", description: data.message });
      qc.invalidateQueries();
    },
    onError: (err: any) => toast({ title: "Cleanup failed", description: err?.data?.error ?? "Unable to clear demo data.", variant: "destructive" }),
  });

  const stats = [
    { label: "Total Users", value: dashboard?.totalUsers ?? 0, icon: Users, color: "text-blue-600", href: "/admin/users" },
    { label: "Total Orders", value: dashboard?.totalOrders ?? 0, icon: ShoppingBag, color: "text-primary", href: "/admin/orders" },
    { label: "Total Revenue", value: `₹${Number(dashboard?.totalRevenue ?? 0).toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-green-600", href: "/admin/orders" },
    { label: "Stores", value: dashboard?.totalStores ?? 0, icon: Store, color: "text-purple-600", href: "/admin/stores" },
    { label: "Pending Shops", value: (dashboard as any)?.pendingStores ?? 0, icon: ShieldCheck, color: "text-yellow-600", href: "/admin/approvals" },
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

      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <span>Unable to refresh dashboard statistics. Please try again.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div>
      )}

      <WalletSummaryCard href="/admin/wallet" title="Admin wallet" tone="dark" />

      {testControls?.testMode && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Demo/Test Controls
              <Badge className="bg-amber-600 text-white">DEMO MODE</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <InfoPill label="OTP" value={testControls.demoOtpEnabled ? "Demo 123456" : "Off"} />
              <InfoPill label="Payment" value={testControls.demoPaymentEnabled ? "Mock" : "Real only"} />
              <InfoPill label="Payout" value={testControls.demoPayoutEnabled ? "Mock" : "Real only"} />
              <InfoPill label="GPS" value={testControls.requireRealGps ? "Real required" : "Optional"} />
            </div>
            <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-950">
              OTP, KYC, payment and payout are simulated. Customer, seller and rider GPS must still come from the device.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => seedDemo.mutate()} disabled={seedDemo.isPending}>
                {seedDemo.isPending ? "Preparing..." : "Create demo users, shop, rider & products"}
              </Button>
              <Button type="button" variant="outline" onClick={() => clearDemo.mutate()} disabled={clearDemo.isPending}>
                {clearDemo.isPending ? "Clearing..." : "Clear demo data"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Link href="/admin/coupons">
            <div className="rounded-lg border p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <BadgePercent className="mb-3 h-5 w-5 text-primary" />
              <p className="font-semibold">Discounts & coupons</p>
              <p className="text-sm text-muted-foreground">Create offers and campaign codes.</p>
            </div>
          </Link>
          <Link href="/admin/approvals">
            <div className="rounded-lg border p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <ShieldCheck className="mb-3 h-5 w-5 text-yellow-600" />
              <p className="font-semibold">Shop owner approvals</p>
              <p className="text-sm text-muted-foreground">Approve sellers before product uploads.</p>
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <p className="font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-black text-amber-950">{value}</p>
    </div>
  );
}
