import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { customFetch, useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ChevronDown, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Smartphone, Store, Truck, UserRound } from "lucide-react";
import { testMode } from "@/lib/test-mode";

type AuthResponse = {
  token: string;
  user: { role: string; name: string };
};

type LoginMode = "password" | "otp" | "forgot";
type LoginRole = "customer" | "vendor" | "delivery_partner" | "admin";
type DemoAccount = { role: LoginRole; label: string; email: string; password: string };

const env = import.meta.env as Record<string, string | undefined>;
const demoAccounts: DemoAccount[] = [
  { role: "customer" as LoginRole, label: "Login as Customer", email: env.VITE_DEMO_CUSTOMER_EMAIL || "customer.demo@chowdharymart.test", password: env.VITE_DEMO_CUSTOMER_PASSWORD || "Demo@Customer123" },
  { role: "vendor" as LoginRole, label: "Login as Seller", email: env.VITE_DEMO_SELLER_EMAIL || "seller.demo@chowdharymart.test", password: env.VITE_DEMO_SELLER_PASSWORD || "Demo@Seller123" },
  { role: "delivery_partner" as LoginRole, label: "Login as Delivery Partner", email: env.VITE_DEMO_RIDER_EMAIL || "rider.demo@chowdharymart.test", password: env.VITE_DEMO_RIDER_PASSWORD || "Demo@Rider123" },
];
const adminDemoAccount: DemoAccount = { role: "admin", label: "Login as Admin", email: env.VITE_DEMO_ADMIN_EMAIL || "admin.demo@chowdharymart.test", password: env.VITE_DEMO_ADMIN_PASSWORD || "Demo@Admin123" };

const roleContent: Record<LoginRole, { heading: string; subtitle: string; icon: typeof UserRound; accent: string }> = {
  customer: { heading: "Customer Login", subtitle: "Login to shop from your nearby local stores.", icon: UserRound, accent: "from-orange-500 to-amber-400" },
  vendor: { heading: "Seller Login", subtitle: "Manage your products, orders and store.", icon: Store, accent: "from-blue-600 to-cyan-500" },
  delivery_partner: { heading: "Delivery Partner Login", subtitle: "Go online, accept orders and start delivering.", icon: Truck, accent: "from-green-600 to-emerald-400" },
  admin: { heading: "Admin Control Panel", subtitle: "Secure access for authorised administrators only.", icon: LockKeyhole, accent: "from-slate-950 to-slate-700" },
};

function routeForRole(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "vendor") return "/seller/dashboard";
  if (role === "delivery_partner") return "/rider/home";
  return "/customer/home";
}

function splitIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? { email: trimmed.toLowerCase() } : { phone: trimmed.replace(/\D/g, "") };
}

function roleFromPath(path: string): LoginRole {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/seller")) return "vendor";
  if (path.startsWith("/rider")) return "delivery_partner";
  return "customer";
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const { login: setAuthContext } = useAuth();
  const { toast } = useToast();
  const authToast = (options: Parameters<typeof toast>[0]) => toast({ duration: 2000, ...options });
  const loginMutation = useLogin();
  const initialRole = roleFromPath(location);
  const [role, setRole] = useState<LoginRole>(initialRole);
  const [mode, setMode] = useState<LoginMode>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const [success, setSuccess] = useState(false);
  const content = roleContent[role];
  const RoleIcon = content.icon;
  const isAdminLogin = role === "admin";
  const visibleDemoAccounts = isAdminLogin && env.VITE_SHOW_ADMIN_DEMO_ON_ADMIN_LOGIN === "true" ? [adminDemoAccount] : demoAccounts;
  const canSubmit = useMemo(() => {
    if (mode === "password") return Boolean(identifier.trim() && password);
    if (mode === "otp") return Boolean(identifier.trim() && (!otpSent || otp.length >= 4));
    return Boolean(identifier.trim() && (!otpSent || (otp.length >= 4 && newPassword.length >= 6 && newPassword === confirmPassword)));
  }, [confirmPassword, identifier, mode, newPassword, otp, otpSent, password]);

  const finishLogin = (res: AuthResponse) => {
    setSuccess(true);
    setAuthContext(res.token);
    authToast({ title: "Login successful", description: `Signed in as ${res.user.name}` });
    window.setTimeout(() => setLocation(routeForRole(res.user.role)), 450);
  };

  const handlePasswordLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const adminEmail = String(env.VITE_ADMIN_EMAIL || "").replace(/^"|"$/g, "").trim().toLowerCase();
    const resolvedRole: LoginRole = adminEmail && identifier.trim().toLowerCase() === adminEmail ? "admin" : role;
    loginMutation.mutate(
      { data: { ...splitIdentifier(identifier), password, rememberMe, roleHint: resolvedRole } as any },
      {
        onSuccess: finishLogin,
        onError: (err: unknown) => {
          const message = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
            ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Network connection failed. Please try again.";
          authToast({ title: "Login failed", description: message, variant: "destructive" });
        },
      },
    );
  };

  const fillDemo = (account: DemoAccount) => {
    setMode("password");
    setRole(account.role);
    setOtpSent(false);
    setOtp("");
    setIdentifier(account.email);
    setPassword(account.password);
    authToast({ title: "Demo account filled", description: "Tap Login to continue in demo mode." });
  };

  const handleRoleChange = (value: LoginRole) => {
    setRole(value);
    setMode("password");
    setIdentifier("");
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSendOtp = async (purpose: "login" | "forgot") => {
    if (!identifier.trim()) {
      authToast({ title: "Email or phone required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await customFetch("/api/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ ...splitIdentifier(identifier), purpose }),
      });
      setOtpSent(true);
      setOtp("");
      authToast({ title: "OTP sent", description: "Enter the verification code to continue." });
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error ?? "OTP send failed";
      authToast({ title: "OTP failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleOtpLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      void handleSendOtp("login");
      return;
    }
    setBusy(true);
    try {
      const res = await customFetch<AuthResponse>("/api/auth/otp-login", {
        method: "POST",
        body: JSON.stringify({ ...splitIdentifier(identifier), otp, roleHint: role }),
      });
      finishLogin(res);
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error ?? "OTP verification failed";
      authToast({ title: "OTP failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      void handleSendOtp("forgot");
      return;
    }
    if (newPassword !== confirmPassword) {
      authToast({ title: "Password mismatch", description: "New password and confirm password must match.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await customFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ ...splitIdentifier(identifier), otp, password: newPassword }),
      });
      authToast({ title: "Password updated", description: "Now sign in with your new password." });
      setPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setOtpSent(false);
      setOtp("");
      setMode("password");
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error ?? "Password reset failed";
      authToast({ title: "Reset failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const signingIn = loginMutation.isPending || busy || success;

  return (
    <div className="native-page-scroll relative flex min-h-[100dvh] items-center justify-center bg-[#f7f8fb] px-3 py-4 sm:px-4 sm:py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(249,115,22,.18),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(37,99,235,.16),transparent_28%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_45%,#eff6ff_100%)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,.18)_1px,transparent_1px)] bg-[size:28px_28px] opacity-50" />

      <main className="relative z-10 grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden min-h-[620px] overflow-hidden rounded-[32px] bg-gray-950 p-8 text-white shadow-2xl lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white">
                <img src="/app-logo.png" alt="Chowdhary Mart" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">CHOWDHARY MART</p>
                <h1 className="text-2xl font-black">Local commerce hub</h1>
              </div>
            </div>
            <div className="mt-12">
              <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">Secure login</p>
              <h2 className="text-4xl font-black leading-tight">Fast shopping, seller tools and live delivery in one place.</h2>
              <p className="mt-4 text-sm leading-6 text-white/65">Role-aware access, OTP recovery and mobile-first authentication for ChowdharyMart.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {["Secure sessions", "Role redirects", "Demo mode"].map((item) => (
              <div key={item} className="rounded-2xl bg-white/10 p-3 font-semibold text-white/75">{item}</div>
            ))}
          </div>
        </section>

        <section className="w-full rounded-[28px] border border-white/70 bg-white/88 p-4 shadow-2xl backdrop-blur sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${content.accent} text-white shadow-lg`}>
              {success ? <CheckCircle2 className="h-7 w-7" /> : <RoleIcon className="h-7 w-7" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">CHOWDHARY MART</p>
              <h1 className="truncate text-2xl font-black">{content.heading}</h1>
              <p className="text-sm text-muted-foreground">{content.subtitle}</p>
            </div>
          </div>

          {!isAdminLogin ? (
            <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <Label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Login type</Label>
              <Select value={role} onValueChange={(value) => handleRoleChange(value as LoginRole)}>
                <SelectTrigger className="h-12 rounded-2xl bg-white text-base font-bold">
                  <SelectValue placeholder="Choose account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Seller / shop owner</SelectItem>
                  <SelectItem value="delivery_partner">Delivery partner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {role === "vendor" && <p className="mt-2 text-xs font-medium text-blue-700">Seller dashboard opens only after admin approval.</p>}
              {role === "delivery_partner" && <p className="mt-2 text-xs font-medium text-emerald-700">Delivery dashboard opens only after verification and admin approval.</p>}
            </div>
          ) : (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              Admin route is protected. Failed attempts are tracked and temporarily locked after repeated failures.
            </div>
          )}

          {testMode.enabled && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              Testing build — OTP and payments are simulated. GPS location is live from this device.
              {testMode.allowDemoOtp ? <span className="ml-1 font-black">Demo OTP: {testMode.demoOtpCode}</span> : null}
            </div>
          )}

          {testMode.demoAccountsEnabled && visibleDemoAccounts.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
              <button type="button" className="flex w-full items-center justify-between px-3 py-3 text-sm font-bold text-amber-950" onClick={() => setShowDemo((value) => !value)}>
                Demo Accounts <ChevronDown className={`h-4 w-4 transition ${showDemo ? "rotate-180" : ""}`} />
              </button>
              {showDemo && (
                <div className="grid gap-2 border-t border-amber-200 p-3">
                  {visibleDemoAccounts.map((account) => (
                    <Button key={account.email} type="button" variant="outline" className="h-11 justify-start rounded-xl bg-white" onClick={() => fillDemo(account)}>
                      {account.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Tabs value={mode} onValueChange={(value) => { setMode(value as LoginMode); setOtpSent(false); setOtp(""); }} className="space-y-4">
            <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl bg-gray-100 p-1">
              <TabsTrigger className="rounded-xl" value="password">Password</TabsTrigger>
              <TabsTrigger className="rounded-xl" value="otp">OTP</TabsTrigger>
              <TabsTrigger className="rounded-xl" value="forgot">Forgot</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handlePasswordLogin} className="space-y-4" autoComplete="off">
                <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} placeholder="Enter email or mobile number" icon={<Smartphone className="h-4 w-4" />} autoComplete="off" />
                <Field label="Password" value={password} onChange={setPassword} placeholder="Enter password" type="password" icon={<KeyRound className="h-4 w-4" />} autoComplete="new-password" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                    Remember me
                  </label>
                  <button type="button" className="font-semibold text-primary" onClick={() => setMode("forgot")}>Forgot password?</button>
                </div>
                <Button type="submit" className="h-12 w-full rounded-2xl text-base font-bold active:scale-[0.99]" disabled={!canSubmit || signingIn}>
                  {success ? "Success" : signingIn ? "Signing in..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="otp">
              <form onSubmit={handleOtpLogin} className="space-y-4" autoComplete="off">
                <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} placeholder="Enter email or mobile number" icon={<Smartphone className="h-4 w-4" />} autoComplete="off" />
                {otpSent && (
                  <>
                    <Field label="OTP code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter OTP" inputMode="numeric" icon={<ShieldCheck className="h-4 w-4" />} autoComplete="one-time-code" />
                    {testMode.allowDemoOtp && <p className="text-xs font-semibold text-amber-700">Demo OTP: {testMode.demoOtpCode}</p>}
                  </>
                )}
                <Button type="submit" className="h-12 w-full rounded-2xl text-base font-bold" disabled={!canSubmit || signingIn}>
                  {busy ? "Verifying..." : otpSent ? "Verify OTP and login" : "Send OTP"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="forgot">
              <form onSubmit={handleForgotPassword} className="space-y-4" autoComplete="off">
                <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} placeholder="Enter email or mobile number" icon={<Smartphone className="h-4 w-4" />} autoComplete="off" />
                {otpSent && (
                  <>
                    <Field label="OTP code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter OTP" inputMode="numeric" icon={<ShieldCheck className="h-4 w-4" />} autoComplete="one-time-code" />
                    {testMode.allowDemoOtp && <p className="text-xs font-semibold text-amber-700">Demo OTP: {testMode.demoOtpCode}</p>}
                    <Field label="New password" value={newPassword} onChange={setNewPassword} placeholder="Minimum 6 characters" type="password" icon={<KeyRound className="h-4 w-4" />} autoComplete="new-password" />
                    <Field label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter new password" type="password" icon={<KeyRound className="h-4 w-4" />} autoComplete="new-password" />
                  </>
                )}
                <Button type="submit" className="h-12 w-full rounded-2xl text-base font-bold" disabled={!canSubmit || signingIn}>
                  {busy ? "Updating..." : otpSent ? "Reset password" : "Send reset OTP"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-5 grid gap-2 text-center text-sm">
            {role !== "admin" && (
              <p className="text-muted-foreground">
                New here? <Link href={`/register?role=${role}`} className="font-medium text-primary hover:underline">Create account</Link>
              </p>
            )}
            {role === "vendor" && <Link href="/seller/register" className="font-semibold text-[#0f3f8f] hover:underline">Register your shop</Link>}
            {role === "delivery_partner" && <Link href="/delivery/register" className="font-semibold text-gray-900 hover:underline">Register as delivery partner</Link>}
            {role === "admin" && <Link href="/login" className="font-semibold text-muted-foreground hover:text-primary">Back to customer login</Link>}
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  icon,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  icon: React.ReactNode;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={isPassword && visible ? "text" : type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          name={`cm-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          className={isPassword ? "h-12 rounded-2xl bg-white pl-11 pr-12 shadow-sm transition focus-visible:ring-2" : "h-12 rounded-2xl bg-white pl-11 shadow-sm transition focus-visible:ring-2"}
        />
        {isPassword && (
          <button
            type="button"
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-100"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
