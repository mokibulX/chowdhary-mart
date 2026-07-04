import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { customFetch, useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ShieldCheck, Smartphone, Zap } from "lucide-react";

type AuthResponse = {
  token: string;
  user: { role: string; name: string };
};

type LoginMode = "password" | "otp" | "forgot";

function routeForRole(role: string) {
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor";
  if (role === "delivery_partner") return "/delivery";
  return "/";
}

function splitIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? { email: trimmed } : { phone: trimmed };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login: setAuthContext } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const [mode, setMode] = useState<LoginMode>("password");
  const [identifier, setIdentifier] = useState("customer@local.test");
  const [password, setPassword] = useState("123456");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const finishLogin = (res: AuthResponse) => {
    setAuthContext(res.token);
    toast({ title: "Welcome back!", description: `Signed in as ${res.user.name}` });
    setLocation(routeForRole(res.user.role));
  };

  const handlePasswordLogin = (event: React.FormEvent) => {
    event.preventDefault();
    loginMutation.mutate(
      { data: { ...splitIdentifier(identifier), password } },
      {
        onSuccess: finishLogin,
        onError: (err: unknown) => {
          const message = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
            ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Invalid credentials";
          toast({ title: "Login failed", description: message, variant: "destructive" });
        },
      },
    );
  };

  const handleSendOtp = () => {
    if (!identifier.trim()) {
      toast({ title: "Email or phone required", variant: "destructive" });
      return;
    }
    setOtpSent(true);
    setOtp("123456");
    toast({ title: "Demo OTP sent", description: "Use 123456 to continue." });
  };

  const handleOtpLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      handleSendOtp();
      return;
    }
    setBusy(true);
    try {
      const res = await customFetch<AuthResponse>("/api/auth/otp-login", {
        method: "POST",
        body: JSON.stringify({ ...splitIdentifier(identifier), otp }),
      });
      finishLogin(res);
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error ?? "OTP verification failed";
      toast({ title: "OTP failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      handleSendOtp();
      return;
    }
    setBusy(true);
    try {
      await customFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ ...splitIdentifier(identifier), otp, password: newPassword }),
      });
      toast({ title: "Password updated", description: "Now sign in with your new password." });
      setPassword(newPassword);
      setNewPassword("");
      setOtpSent(false);
      setOtp("");
      setMode("password");
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error ?? "Password reset failed";
      toast({ title: "Reset failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="bg-[#0f3f8f] text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#0f3f8f]">
            <Zap className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Chowdhary Mart</CardTitle>
          <CardDescription className="text-white/75">Sign in with password, OTP, or reset access securely.</CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <Tabs value={mode} onValueChange={(value) => { setMode(value as LoginMode); setOtpSent(false); setOtp(""); }} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="otp">OTP</TabsTrigger>
              <TabsTrigger value="forgot">Forgot</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <Field label="Email or phone" value={identifier} onChange={setIdentifier} placeholder="customer@local.test" icon={<Smartphone className="h-4 w-4" />} />
                <Field label="Password" value={password} onChange={setPassword} placeholder="123456" type="password" icon={<KeyRound className="h-4 w-4" />} />
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="otp">
              <form onSubmit={handleOtpLogin} className="space-y-4">
                <Field label="Email or phone" value={identifier} onChange={setIdentifier} placeholder="customer@local.test" icon={<Smartphone className="h-4 w-4" />} />
                {otpSent && <Field label="OTP code" value={otp} onChange={setOtp} placeholder="123456" inputMode="numeric" icon={<ShieldCheck className="h-4 w-4" />} />}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Verifying..." : otpSent ? "Verify OTP and sign in" : "Send OTP"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="forgot">
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <Field label="Email or phone" value={identifier} onChange={setIdentifier} placeholder="customer@local.test" icon={<Smartphone className="h-4 w-4" />} />
                {otpSent && (
                  <>
                    <Field label="OTP code" value={otp} onChange={setOtp} placeholder="123456" inputMode="numeric" icon={<ShieldCheck className="h-4 w-4" />} />
                    <Field label="New password" value={newPassword} onChange={setNewPassword} placeholder="Minimum 6 characters" type="password" icon={<KeyRound className="h-4 w-4" />} />
                  </>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Updating..." : otpSent ? "Reset password" : "Send reset OTP"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-5 rounded-lg bg-orange-50 p-3 text-xs text-orange-900">
            Demo accounts: customer@local.test, vendor@local.test, admin@local.test, delivery@local.test. Password/OTP: 123456.
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            New here? <Link href="/register" className="font-medium text-primary hover:underline">Create account</Link>
          </p>
        </CardContent>
      </Card>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          inputMode={inputMode}
          className="pl-9"
        />
      </div>
    </div>
  );
}
