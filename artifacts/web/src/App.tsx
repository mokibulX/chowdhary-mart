import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
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

import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOrders from "@/pages/vendor/VendorOrders";
import VendorProducts from "@/pages/vendor/VendorProducts";
import VendorStore from "@/pages/vendor/VendorStore";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminStores from "@/pages/admin/AdminStores";
import AdminCoupons from "@/pages/admin/AdminCoupons";

import { CustomerLayout } from "@/components/layout/CustomerLayout";
import { VendorLayout } from "@/components/layout/VendorLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";

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
      <div className="min-h-screen flex items-center justify-center">
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

function CustomerRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <CustomerLayout>
      <Component />
    </CustomerLayout>
  );
}

function ProtectedCustomerRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <RequireAuth>
      <CustomerLayout>
        <Component />
      </CustomerLayout>
    </RequireAuth>
  );
}

function VendorRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <RequireAuth roles={["vendor", "admin"]}>
      <VendorLayout>
        <Component />
      </VendorLayout>
    </RequireAuth>
  );
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminLayout>
        <Component />
      </AdminLayout>
    </RequireAuth>
  );
}

function Router() {
  return (
    <Switch>
      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* Admin panel — must come before /a* to avoid conflicts */}
      <Route path="/admin">{() => <AdminRoute component={AdminDashboard} />}</Route>
      <Route path="/admin/users">{() => <AdminRoute component={AdminUsers} />}</Route>
      <Route path="/admin/orders">{() => <AdminRoute component={AdminOrders} />}</Route>
      <Route path="/admin/stores">{() => <AdminRoute component={AdminStores} />}</Route>
      <Route path="/admin/coupons">{() => <AdminRoute component={AdminCoupons} />}</Route>

      {/* Vendor panel */}
      <Route path="/vendor">{() => <VendorRoute component={VendorDashboard} />}</Route>
      <Route path="/vendor/orders">{() => <VendorRoute component={VendorOrders} />}</Route>
      <Route path="/vendor/products">{() => <VendorRoute component={VendorProducts} />}</Route>
      <Route path="/vendor/store">{() => <VendorRoute component={VendorStore} />}</Route>

      {/* Protected customer routes */}
      <Route path="/cart">{() => <ProtectedCustomerRoute component={Cart} />}</Route>
      <Route path="/checkout">{() => <ProtectedCustomerRoute component={Checkout} />}</Route>
      <Route path="/orders">{() => <ProtectedCustomerRoute component={Orders} />}</Route>
      <Route path="/orders/:orderId">{(params) => <ProtectedCustomerRoute component={() => <OrderDetail />} />}</Route>
      <Route path="/track/:orderId">{(params) => <ProtectedCustomerRoute component={() => <Track />} />}</Route>
      <Route path="/wishlist">{() => <ProtectedCustomerRoute component={Wishlist} />}</Route>
      <Route path="/profile">{() => <ProtectedCustomerRoute component={Profile} />}</Route>
      <Route path="/addresses">{() => <ProtectedCustomerRoute component={Addresses} />}</Route>
      <Route path="/wallet">{() => <ProtectedCustomerRoute component={Wallet} />}</Route>
      <Route path="/notifications">{() => <ProtectedCustomerRoute component={Notifications} />}</Route>

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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
