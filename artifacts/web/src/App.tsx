import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import SellerRegister from "@/pages/SellerRegister";
import DeliveryRegister from "@/pages/DeliveryPartnerRegistration";
import Search from "@/pages/Search";
import Store from "@/pages/Store";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Track from "@/pages/Track";
import Wishlist from "@/pages/Wishlist";
import Profile from "@/pages/Profile";
import Addresses from "@/pages/Addresses";
import Wallet from "@/pages/Wallet";
import Coupons from "@/pages/Coupons";
import Notifications from "@/pages/Notifications";
import HelpSupport from "@/pages/HelpSupport";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Returns from "@/pages/Returns";
import Language from "@/pages/Language";
import PrivacySettings from "@/pages/PrivacySettings";

import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOrders from "@/pages/vendor/VendorOrders";
import VendorProducts from "@/pages/vendor/VendorProducts";
import VendorStock from "@/pages/vendor/VendorStock";
import VendorStore from "@/pages/vendor/VendorStore";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminStores from "@/pages/admin/AdminStores";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminCatalog from "@/pages/admin/AdminCatalog";
import AdminApprovals from "@/pages/admin/AdminApprovals";
import AdminZones from "@/pages/admin/AdminZones";
import AdminHomepage from "@/pages/admin/AdminHomepage";
import DeliveryDashboard from "@/pages/delivery/DeliveryDashboard";

import { CustomerLayout } from "@/components/layout/CustomerLayout";
import { VendorLayout } from "@/components/layout/VendorLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { GlobalTranslator } from "@/components/GlobalTranslator";
import { GlobalIncomingOrderAlerts } from "@/components/GlobalIncomingOrderAlerts";
import { DemoModeBadge } from "@/components/DemoModeBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CircleUserRound, DollarSign, Home as HomeIcon, Package, Store as StoreIcon, WalletCards } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function canonicalRole(value: unknown) {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "seller") return "vendor";
  if (role === "rider" || role === "delivery") return "delivery_partner";
  return role;
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="app-shell items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const role = canonicalRole(user.role);
  if (roles && !roles.includes(role)) {
    if (role === "delivery_partner") setLocation("/delivery");
    else if (role === "vendor") setLocation("/vendor");
    else if (role === "admin") setLocation("/admin/dashboard");
    else setLocation("/");
    return null;
  }

  return <>{children}</>;
}

function DeliveryPartnerCustomerBlock({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="app-shell items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  const role = canonicalRole(user?.role);
  if (role === "delivery_partner") return <Redirect to="/delivery" />;
  if (role === "vendor") return <Redirect to="/vendor" />;
  return <>{children}</>;
}

function CustomerRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <DeliveryPartnerCustomerBlock>
      <CustomerLayout>
        <Component />
      </CustomerLayout>
    </DeliveryPartnerCustomerBlock>
  );
}

function ProtectedCustomerRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <RequireAuth roles={["customer", "admin"]}>
      <CustomerLayout>
        <Component />
      </CustomerLayout>
    </RequireAuth>
  );
}

function VendorRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <RequireAuth roles={["vendor", "admin"]}>
      <VendorLayout>
        <ApprovedVendorGate>
          <Component />
        </ApprovedVendorGate>
      </VendorLayout>
    </RequireAuth>
  );
}

function ApprovedVendorGate({ children }: { children: React.ReactNode }) {
  const { user, confirmLogout } = useAuth();
  const role = canonicalRole(user?.role);
  if (role === "admin" || (role === "vendor" && (user as any)?.vendorStatus === "approved")) {
    return <>{children}</>;
  }
  return (
    <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
      <StoreIcon className="mx-auto mb-4 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-bold">Shop approval pending</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your shop owner registration is submitted. Admin approval hole apni product add, order manage and store edit korte parben.
      </p>
      <Button className="mt-5" variant="outline" onClick={confirmLogout}>Sign out</Button>
    </div>
  );
}

function AdminRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminLayout>
        <Component />
      </AdminLayout>
    </RequireAuth>
  );
}

function DeliveryRoute({ component: Component }: { component: () => ReactElement }) {
  const dashboard = Component === DeliveryDashboard;
  return (
    <RequireAuth roles={["delivery_partner", "admin"]}>
      <ApprovedDeliveryGate>
        {dashboard ? <Component /> : <div className="min-h-screen bg-[#f6f7f9] pb-24">
          <header className="sticky top-0 z-40 border-b bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <Link href="/delivery" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-orange-50" aria-label="Back to delivery home"><ArrowLeft className="h-5 w-5" /></Link>
              <Link href="/delivery" className="font-bold text-slate-900">cMart Partner</Link>
              <Link href="/delivery" className="ml-auto text-sm font-semibold text-orange-600">Home</Link>
            </div>
          </header>
          <Component />
          <DeliveryMobileNav />
        </div>}
      </ApprovedDeliveryGate>
    </RequireAuth>
  );
}

function DeliveryMobileNav() {
  const itemClass = "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600 active:bg-orange-50 active:text-orange-600";
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden" aria-label="Delivery navigation">
    <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
      <Link href="/delivery" className={itemClass}><HomeIcon className="h-5 w-5" /><span>Home</span></Link>
      <a href="/delivery#orders" className={itemClass}><Package className="h-5 w-5" /><span>Orders</span></a>
      <a href="/delivery#earnings" className={itemClass}><DollarSign className="h-5 w-5" /><span>Earnings</span></a>
      <Link href="/delivery/wallet" className={itemClass}><WalletCards className="h-5 w-5" /><span>Wallet</span></Link>
      <Link href="/delivery/profile" className={itemClass}><CircleUserRound className="h-5 w-5" /><span>Profile</span></Link>
    </div>
  </nav>;
}

function ApprovedDeliveryGate({ children }: { children: React.ReactNode }) {
  const { user, confirmLogout } = useAuth();
  if (canonicalRole(user?.role) === "admin" || (user as any)?.deliveryStatus === "approved") return <>{children}</>;
  return (
    <div className="app-shell items-center justify-center bg-gray-50 p-4">
      <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
        <StoreIcon className="mx-auto mb-4 h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Delivery approval pending</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin approve korle delivery orders receive, OTP verify and live map panel use korte parben.
        </p>
        <Button className="mt-5" variant="outline" onClick={confirmLogout}>Sign out</Button>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/seller/login" component={Login} />
      <Route path="/rider/login" component={Login} />
      <Route path="/admin/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/seller/register" component={SellerRegister} />
      <Route path="/delivery/register" component={DeliveryRegister} />
      <Route path="/customer/home">{() => <CustomerRoute component={Home} />}</Route>

      {/* Admin panel — must come before /a* to avoid conflicts */}
      <Route path="/admin/dashboard">{() => <AdminRoute component={AdminDashboard} />}</Route>
      <Route path="/admin">{() => <AdminRoute component={AdminDashboard} />}</Route>
      <Route path="/admin/users">{() => <AdminRoute component={AdminUsers} />}</Route>
      <Route path="/admin/orders">{() => <AdminRoute component={AdminOrders} />}</Route>
      <Route path="/admin/approvals">{() => <AdminRoute component={AdminApprovals} />}</Route>
      <Route path="/admin/zones">{() => <AdminRoute component={AdminZones} />}</Route>
      <Route path="/admin/catalog">{() => <AdminRoute component={AdminCatalog} />}</Route>
      <Route path="/admin/homepage">{() => <AdminRoute component={AdminHomepage} />}</Route>
      <Route path="/admin/stores">{() => <AdminRoute component={AdminStores} />}</Route>
      <Route path="/admin/coupons">{() => <AdminRoute component={AdminCoupons} />}</Route>
      <Route path="/admin/wallet">{() => <AdminRoute component={Wallet} />}</Route>

      {/* Vendor panel */}
      <Route path="/seller/dashboard">{() => <VendorRoute component={VendorDashboard} />}</Route>
      <Route path="/vendor">{() => <VendorRoute component={VendorDashboard} />}</Route>
      <Route path="/vendor/orders">{() => <VendorRoute component={VendorOrders} />}</Route>
      <Route path="/vendor/products">{() => <VendorRoute component={VendorProducts} />}</Route>
      <Route path="/vendor/stock">{() => <VendorRoute component={VendorStock} />}</Route>
      <Route path="/vendor/store">{() => <VendorRoute component={VendorStore} />}</Route>
      <Route path="/vendor/wallet">{() => <VendorRoute component={Wallet} />}</Route>

      {/* Delivery partner panel */}
      <Route path="/rider/home">{() => <DeliveryRoute component={DeliveryDashboard} />}</Route>
      <Route path="/delivery">{() => <DeliveryRoute component={DeliveryDashboard} />}</Route>
      <Route path="/delivery/wallet">{() => <DeliveryRoute component={Wallet} />}</Route>
      <Route path="/delivery/profile">{() => <DeliveryRoute component={Profile} />}</Route>

      {/* Protected customer routes */}
      <Route path="/cart">{() => <ProtectedCustomerRoute component={Cart} />}</Route>
      <Route path="/checkout">{() => <ProtectedCustomerRoute component={Checkout} />}</Route>
      <Route path="/orders">{() => <ProtectedCustomerRoute component={Orders} />}</Route>
      <Route path="/orders/:orderId/confirmed">{(params) => <ProtectedCustomerRoute component={() => <OrderConfirmation />} />}</Route>
      <Route path="/orders/:orderId">{(params) => <ProtectedCustomerRoute component={() => <OrderDetail />} />}</Route>
      <Route path="/track/:orderId">{(params) => <ProtectedCustomerRoute component={() => <Track />} />}</Route>
      <Route path="/wishlist">{() => <ProtectedCustomerRoute component={Wishlist} />}</Route>
      <Route path="/profile">{() => <ProtectedCustomerRoute component={Profile} />}</Route>
      <Route path="/addresses">{() => <ProtectedCustomerRoute component={Addresses} />}</Route>
      <Route path="/wallet">{() => <ProtectedCustomerRoute component={Wallet} />}</Route>
      <Route path="/notifications">{() => <ProtectedCustomerRoute component={Notifications} />}</Route>
      <Route path="/help">{() => <ProtectedCustomerRoute component={HelpSupport} />}</Route>
      <Route path="/returns">{() => <ProtectedCustomerRoute component={Returns} />}</Route>
      <Route path="/language">{() => <ProtectedCustomerRoute component={Language} />}</Route>
      <Route path="/privacy">{() => <ProtectedCustomerRoute component={PrivacySettings} />}</Route>

      {/* Public customer routes */}
      <Route path="/coupons">{() => <CustomerRoute component={Coupons} />}</Route>
      <Route path="/search">{() => <CustomerRoute component={Search} />}</Route>
      <Route path="/store/:storeId">{(params) => <CustomerRoute component={() => <Store />} />}</Route>
      <Route path="/product/:productId">{(params) => <CustomerRoute component={() => <ProductDetail />} />}</Route>
      <Route path="/">{() => <CustomerRoute component={Home} />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <GlobalTranslator />
            <DemoModeBadge />
            <Router />
            <GlobalIncomingOrderAlerts />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
