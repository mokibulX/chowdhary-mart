import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Store } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().min(10, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "vendor", "delivery_partner"]),
  referralCode: z.string().optional().or(z.literal("")),
  shopName: z.string().optional().or(z.literal("")),
  businessType: z.string().optional().or(z.literal("")),
  shopCategory: z.string().optional().or(z.literal("")),
  shopAddress: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal("")),
  gstNumber: z.string().optional().or(z.literal("")),
  panNumber: z.string().optional().or(z.literal("")),
  upiId: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

export default function Register() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { role: "customer" },
  });
  const role = watch("role");

  const onSubmit = (data: FormData) => {
    if (!data.email && !data.phone) {
      toast({ title: "Mobile required", description: "OTP account-er jonno mobile number din.", variant: "destructive" });
      return;
    }
    if (data.role === "vendor") {
      const missing = !data.shopName || !data.shopAddress || !data.city || !data.state || !data.pincode || !data.upiId;
      if (missing) {
        toast({ title: "Shop details required", description: "Shop name, address, city, state, pincode and UPI ID fill korun. GST optional.", variant: "destructive" });
        return;
      }
    }
    if (!otpSent) {
      setOtpSent(true);
      setOtp("");
      toast({ title: "OTP sent", description: "Enter the verification code to create your account." });
      return;
    }
    if (otp !== "123456") {
      toast({ title: "Invalid OTP", description: "Please check the code and try again.", variant: "destructive" });
      return;
    }
    registerMutation.mutate(
      {
        data: {
          name: data.name,
          email: data.email || undefined,
          phone: data.phone,
          password: data.password,
          role: data.role,
          shopName: data.shopName,
          businessType: data.businessType,
          shopCategory: data.shopCategory,
          shopAddress: data.shopAddress,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          gstNumber: data.gstNumber,
          panNumber: data.panNumber,
          upiId: data.upiId,
        } as any,
      },
      {
        onSuccess: (res) => {
          login(res.token);
          if (data.role === "vendor") {
            toast({ title: "Shop registration submitted", description: "Admin approve korle product add korte parben." });
            setLocation("/vendor");
            return;
          }
          toast({ title: "Welcome to Chowdhary Mart!", description: `Account created for ${res.user.name}` });
          setLocation("/");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Registration failed";
          toast({ title: "Registration failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-2">
          <div className="text-3xl font-bold text-primary mb-1">Chowdhary Mart</div>
          <CardTitle className="text-xl">Create account</CardTitle>
          <CardDescription>OTP verified local shopping account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" placeholder="Your name" {...register("name")} data-testid="input-name" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" type="email" placeholder="you@email.com" {...register("email")} data-testid="input-email" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" placeholder="10-digit mobile number" {...register("phone")} data-testid="input-phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min 6 characters" {...register("password")} data-testid="input-password" className="pr-10" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-gray-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Account type</Label>
              <Select onValueChange={(v) => setValue("role", v as "customer" | "vendor" | "delivery_partner")} defaultValue="customer">
                <SelectTrigger data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Shop owner / Seller</SelectItem>
                  <SelectItem value="delivery_partner">Delivery partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "vendor" && (
              <div className="rounded-xl border bg-blue-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Store className="h-5 w-5 text-blue-700" />
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
                  <FieldInput label="State *" name="state" register={register} placeholder="West Bengal" />
                  <FieldInput label="Pincode *" name="pincode" register={register} placeholder="700156" />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" placeholder="e.g. WELCOME50" {...register("referralCode")} data-testid="input-referral" />
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
                <p className="mt-1 text-xs text-blue-700">Enter the OTP sent to your mobile.</p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="btn-register">
              {registerMutation.isPending ? "Creating account..." : otpSent ? "Verify OTP and create account" : "Send OTP"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldInput({ label, name, register, placeholder }: { label: string; name: keyof FormData; register: ReturnType<typeof useForm<FormData>>["register"]; placeholder: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={String(name)}>{label}</Label>
      <Input id={String(name)} placeholder={placeholder} {...register(name)} />
    </div>
  );
}
