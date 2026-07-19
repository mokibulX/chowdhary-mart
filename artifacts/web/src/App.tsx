import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
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
import DeliveryRegister from "@/pages/DeliveryRegister";
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
import { Store as StoreIcon } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

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

  if (roles && !roles.includes(user.role)) {
    setLocation("/");
    return null;
  }

  return <>{children}</>;
}

function CustomerRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <CustomerLayout>
      <Component />
    </CustomerLayout>
  );
}

function ProtectedCustomerRoute({ component: Component }: { component: () => ReactElement }) {
  return (
    <RequireAuth>
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
  const { user, logout } = useAuth();
  if (user?.role === "admin" || (user as any)?.vendorStatus === "approved" || !(user as any)?.vendorStatus) {
    return <>{children}</>;
  }
  return (
    <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
      <StoreIcon className="mx-auto mb-4 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-bold">Shop approval pending</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your shop owner registration is submitted. Admin approval hole apni product add, order manage and store edit korte parben.
      </p>
      <Button className="mt-5" variant="outline" onClick={logout}>Sign out</Button>
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
  return (
    <RequireAuth roles={["delivery_partner", "admin"]}>
      <ApprovedDeliveryGate>
        <Component />
      </ApprovedDeliveryGate>
    </RequireAuth>
  );
}

function ApprovedDeliveryGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (user?.role === "admin" || (user as any)?.deliveryStatus === "approved") return <>{children}</>;
  return (
    <div className="app-shell items-center justify-center bg-gray-50 p-4">
      <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
        <StoreIcon className="mx-auto mb-4 h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Delivery approval pending</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin approve korle delivery orders receive, OTP verify and live map panel use korte parben.
        </p>
        <Button className="mt-5" variant="outline" onClick={logout}>Sign out</Button>
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
      <Route path="/vendor/store">{() => <VendorRoute component={VendorStore} />}</Route>
      <Route path="/vendor/wallet">{() => <VendorRoute component={Wallet} />}</Route>

      {/* Delivery partner panel */}
      <Route path="/rider/home">{() => <DeliveryRoute component={DeliveryDashboard} />}</Route>
      <Route path="/delivery">{() => <DeliveryRoute component={DeliveryDashboard} />}</Route>
      <Route path="/delivery/wallet">{() => <DeliveryRoute component={Wallet} />}</Route>

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
