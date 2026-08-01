import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { Link, useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Bike, Eye, EyeOff, ShieldCheck, Store, UserRound } from "lucide-react";
import { testMode } from "@/lib/test-mode";
import { getFirstFormError, getFriendlyErrorMessage } from "@/lib/error-message";
import { IndiaStateDistrictSelects } from "@/components/IndiaLocationSelects";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().min(10, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Confirm your password"),
  role: z.enum(["customer", "vendor", "delivery_partner"]),
  referralCode: z.string().optional().or(z.literal("")),
  shopName: z.string().optional().or(z.literal("")),
  businessType: z.string().optional().or(z.literal("")),
  shopCategory: z.string().optional().or(z.literal("")),
  shopAddress: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal("")),
  gstNumber: z.string().optional().or(z.literal("")),
  panNumber: z.string().optional().or(z.literal("")),
  upiId: z.string().optional().or(z.literal("")),
  vehicleType: z.string().optional().or(z.literal("")),
  vehicleNumber: z.string().optional().or(z.literal("")),
  licenseNumber: z.string().optional().or(z.literal("")),
  termsAccepted: z.boolean().refine((value) => value, "Please accept the terms"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;
type RegisterResponse = { token: string; user: { name: string; role: string } };

export default function Register() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const authToast = (options: Parameters<typeof toast>[0]) => toast({ duration: 2000, ...options });
  const [registering, setRegistering] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const urlRole = new URLSearchParams(window.location.search).get("role");
  const initialRole = urlRole === "vendor" || urlRole === "delivery_partner" ? urlRole : "customer";
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { role: initialRole, termsAccepted: false },
  });
  const role = watch("role");
  const roleMeta = role === "vendor"
    ? { title: "Seller Registration", subtitle: "Submit your shop details. Admin approval unlocks the seller dashboard.", icon: Store }
    : role === "delivery_partner"
      ? { title: "Delivery Partner Registration", subtitle: "Verify mobile and vehicle details before deliveries are assigned.", icon: Bike }
      : { title: "Create Customer Account", subtitle: "Start shopping from verified nearby stores.", icon: UserRound };
  const RoleIcon = roleMeta.icon;

  const onSubmit = async (rawData: FormData) => {
    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      authToast({
        title: "Please complete the form",
        description: getFriendlyErrorMessage(parsed.error.issues, "Name, mobile, password and terms are required."),
        variant: "destructive",
      });
      return;
    }
    const data = parsed.data;
    if (!data.email && !data.phone) {
      authToast({ title: "Mobile required", description: "OTP account-er jonno mobile number din.", variant: "destructive" });
      return;
    }
    if (data.role === "vendor") {
      authToast({ title: "Secure seller registration", description: "Shop GPS and service zone select korte seller registration page open hocche." });
      setLocation("/seller/register");
      return;
    }
    if (data.role === "delivery_partner") {
      authToast({ title: "Secure delivery registration", description: "Delivery KYC, GPS and service zone select korte delivery registration page open hocche." });
      setLocation("/delivery/register");
      return;
    }
    if (!otpSent) {
      try {
        await customFetch("/api/auth/otp/send", {
          method: "POST",
          body: JSON.stringify({ phone: data.phone, email: data.email || undefined, purpose: "register" }),
        });
        setOtpSent(true);
        setOtp("");
        authToast({ title: "OTP sent", description: "Enter the verification code to create your account." });
      } catch (err) {
        authToast({ title: "OTP failed", description: getFriendlyErrorMessage(err, "OTP could not be sent. Please try again."), variant: "destructive" });
      }
      return;
    }
    if (otp.length < 4) {
      authToast({ title: "Invalid OTP", description: "Please check the code and try again.", variant: "destructive" });
      return;
    }
    setRegistering(true);
    try {
      const res = await customFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          email: data.email || undefined,
          phone: data.phone,
          otp,
          password: data.password,
          role: data.role,
          shopName: data.shopName,
          businessType: data.businessType,
          shopCategory: data.shopCategory,
          shopAddress: data.shopAddress,
          city: data.city,
          district: data.district,
          state: data.state,
          pincode: data.pincode,
          gstNumber: data.gstNumber,
          panNumber: data.panNumber,
          upiId: data.upiId,
          vehicleType: data.vehicleType,
          vehicleNumber: data.vehicleNumber,
          licenseNumber: data.licenseNumber,
        }),
      });
      login(res.token);
      authToast({ title: "Welcome to Chowdhary Mart!", description: `Account created for ${res.user.name}` });
      setLocation("/");
    } catch (err) {
      authToast({ title: "Registration failed", description: getFriendlyErrorMessage(err, "Could not create account. Please check the details."), variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  const onInvalid = (formErrors: unknown) => {
    authToast({
      title: "Please complete the form",
      description: getFirstFormError(formErrors, "Name, mobile, password and terms are required."),
      variant: "destructive",
    });
  };

  return (
    <div className="native-page-scroll relative min-h-[100dvh] overflow-x-hidden bg-[#f7f8fb] px-3 py-3 sm:px-4 sm:py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(249,115,22,.18),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(37,99,235,.14),transparent_28%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_48%,#eff6ff_100%)]" />
      <main className="relative mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden rounded-[32px] bg-gray-950 p-8 text-white shadow-2xl lg:block">
          <div className="flex items-center gap-3">
            <img src="/app-logo.png" alt="Chowdhary Mart" className="h-14 w-14 flex-shrink-0 rounded-2xl bg-white object-contain p-1" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">CHOWDHARY MART</p>
              <h1 className="text-2xl font-black">Secure account setup</h1>
            </div>
          </div>
          <div className="mt-12 space-y-4">
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">OTP verified</p>
            <h2 className="text-4xl font-black leading-tight">Customer, seller and rider registration in one clean flow.</h2>
            <p className="text-sm leading-6 text-white/65">Admin account creation is blocked from public signup. Seller and delivery dashboards stay locked until approval.</p>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/70 bg-white/95 p-3 shadow-xl backdrop-blur sm:rounded-[28px] sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-blue-600 text-white shadow-lg sm:h-14 sm:w-14">
              <RoleIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">CHOWDHARY MART</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">{roleMeta.title}</h1>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{roleMeta.subtitle}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4" autoComplete="off" noValidate>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <Label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Account type</Label>
              <Select value={role} onValueChange={(v) => { setValue("role", v as "customer" | "vendor" | "delivery_partner"); setOtpSent(false); setOtp(""); }}>
                <SelectTrigger className="h-12 rounded-2xl bg-white text-base font-bold" data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Seller / shop owner</SelectItem>
                  <SelectItem value="delivery_partner">Delivery partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" className="h-12 rounded-2xl" placeholder="Your name" {...register("name")} data-testid="input-name" autoComplete="off" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" className="h-12 rounded-2xl" type="email" placeholder="you@email.com" {...register("email")} data-testid="input-email" autoComplete="off" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" className="h-12 rounded-2xl" placeholder="10-digit mobile number" {...register("phone")} data-testid="input-phone" autoComplete="off" />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min 6 characters" {...register("password")} data-testid="input-password" className="h-12 rounded-2xl pr-10" autoComplete="new-password" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-gray-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="Re-enter password" {...register("confirmPassword")} className="h-12 rounded-2xl" autoComplete="new-password" />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>
            {role === "vendor" && (
              <div className="rounded-2xl border bg-blue-50 p-3 sm:p-4">
                <div className="mb-3 flex items-start gap-2">
                  <Store className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" />
                  <div>
                    <p className="font-semibold text-blue-950">Shop owner registration</p>
                    <p className="text-xs text-blue-700">Admin details verify kore approve korle seller panel unlock hobe. GST optional.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput label="Shop name *" name="shopName" register={register} placeholder="e.g. New Town Fresh Store" />
                  <FieldInput label="Business type" name="businessType" register={register} placeholder="Retail / Grocery / Electronics" />
                  <FieldInput label="Main category" name="shopCategory" register={register} placeholder="Grocery, Mobile, Fashion..." />
                  <FieldInput label="GST number (optional)" name="gstNumber" register={register} placeholder="Optional" />
                  <FieldInput label="PAN number" name="panNumber" register={register} placeholder="Optional for demo" />
                  <FieldInput label="UPI ID *" name="upiId" register={register} placeholder="shop@upi" />
                  <div className="sm:col-span-2">
                    <FieldInput label="Shop / pickup address *" name="shopAddress" register={register} placeholder="Full shop address" />
                  </div>
                  <FieldInput label="City *" name="city" register={register} placeholder="Kolkata" />
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                    <IndiaStateDistrictSelects
                      state={watch("state") || ""}
                      district={watch("district") || ""}
                      onStateChange={(state, district) => {
                        setValue("state", state, { shouldValidate: true, shouldDirty: true });
                        setValue("district", district, { shouldValidate: true, shouldDirty: true });
                      }}
                      onDistrictChange={(district) => setValue("district", district, { shouldValidate: true, shouldDirty: true })}
                    />
                    <input type="hidden" {...register("state")} />
                    <input type="hidden" {...register("district")} />
                  </div>
                  <FieldInput label="Pincode *" name="pincode" register={register} placeholder="700156" />
                </div>
              </div>
            )}
            {role === "delivery_partner" && (
              <div className="rounded-2xl border bg-emerald-50 p-3 sm:p-4">
                <div className="mb-3 flex items-start gap-2">
                  <Bike className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-emerald-950">Delivery partner verification</p>
                    <p className="text-xs text-emerald-700">Admin approval-er age dashboard locked thakbe.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput label="Vehicle type *" name="vehicleType" register={register} placeholder="Bike / Scooter / Bicycle" />
                  <FieldInput label="Vehicle number *" name="vehicleNumber" register={register} placeholder="WB 00 AB 1234" />
                  <FieldInput label="Licence number" name="licenseNumber" register={register} placeholder="Required for motor vehicle" />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" className="h-12 rounded-2xl" placeholder="e.g. WELCOME50" {...register("referralCode")} data-testid="input-referral" />
            </div>
            {otpSent && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <Label htmlFor="otp">OTP code</Label>
                <Input
                  id="otp"
                  className="mt-1"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter OTP"
                  data-testid="input-otp"
                />
                <p className="mt-1 text-xs text-blue-700">
                  Enter the OTP sent to your mobile.
                  {testMode.allowDemoOtp ? <span className="ml-1 font-bold">Demo OTP: {testMode.demoOtpCode}</span> : null}
                </p>
              </div>
            )}
            <label className="flex items-start gap-2 rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
              <input type="checkbox" className="mt-1 h-4 w-4" {...register("termsAccepted")} />
              <span>I agree to ChowdharyMart terms, privacy policy and 5km local delivery rules.</span>
            </label>
            {errors.termsAccepted && <p className="text-xs text-red-500">{errors.termsAccepted.message}</p>}
            <Button type="submit" className="h-12 w-full rounded-2xl text-base font-bold" disabled={registering} data-testid="btn-register">
              {registering ? "Creating account..." : otpSent ? "Verify OTP and create account" : "Send OTP"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function FieldInput({ label, name, register, placeholder }: { label: string; name: keyof FormData; register: ReturnType<typeof useForm<FormData>>["register"]; placeholder: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={String(name)}>{label}</Label>
      <Input id={String(name)} className="h-12 rounded-2xl" placeholder={placeholder} {...register(name)} />
    </div>
  );
}
