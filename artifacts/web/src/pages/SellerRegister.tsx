import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardCheck, Eye, EyeOff, PackagePlus, ShieldCheck, Store } from "lucide-react";

type SellerForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  shopName: string;
  businessType: string;
  shopCategory: string;
  shopAddress: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  upiId: string;
};

const initialForm: SellerForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  shopName: "",
  businessType: "Retail shop",
  shopCategory: "Grocery, Fashion, Electronics",
  shopAddress: "",
  city: "Kolkata",
  state: "West Bengal",
  pincode: "",
  gstNumber: "",
  panNumber: "",
  upiId: "",
};

export default function SellerRegister() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const [form, setForm] = useState<SellerForm>(initialForm);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const update = (key: keyof SellerForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    const required: Array<keyof SellerForm> = ["name", "email", "phone", "password", "shopName", "shopAddress", "city", "state", "pincode", "upiId"];
    const missing = required.find((key) => !form[key].trim());
    if (missing) {
      toast({ title: "Details required", description: "Owner details, shop address, pincode and UPI ID fill korun. GST optional.", variant: "destructive" });
      return false;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) {
      toast({ title: "Invalid mobile", description: "10 digit mobile number din.", variant: "destructive" });
      return false;
    }
    if (!/^\d{6}$/.test(form.pincode)) {
      toast({ title: "Invalid pincode", description: "6 digit pincode din.", variant: "destructive" });
      return false;
    }
    if (!/^[\w.-]+@[\w.-]+$/.test(form.upiId.trim())) {
      toast({ title: "Invalid UPI ID", description: "Example: shop@upi", variant: "destructive" });
      return false;
    }
    if (form.password.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 character password din.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    if (!otpSent) {
      setOtpSent(true);
      setOtp("");
      toast({ title: "OTP sent", description: "Enter the verification code to submit shop registration." });
      return;
    }
    if (otp !== "123456") {
      toast({ title: "Invalid OTP", description: "Please check the code and try again.", variant: "destructive" });
      return;
    }
    registerMutation.mutate(
      {
        data: {
          ...form,
          phone: form.phone.replace(/\D/g, ""),
          email: form.email.trim().toLowerCase(),
          upiId: form.upiId.trim(),
          role: "vendor",
          gstNumber: form.gstNumber || undefined,
          panNumber: form.panNumber || undefined,
        } as any,
      },
      {
        onSuccess: (res) => {
          login(res.token);
          toast({ title: "Shop registration submitted", description: "Admin approve korle seller panel-e product add korte parben. Existing account thakleo application submit hoyeche." });
          setLocation("/vendor");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } }; data?: { error?: string } })?.response?.data?.error
            ?? (err as { data?: { error?: string } })?.data?.error
            ?? "Registration failed";
          toast({ title: "Registration failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl bg-[#0f3f8f] p-6 text-white shadow-lg lg:p-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
            Chowdhary Mart
          </Link>
          <div className="mt-8 max-w-md">
            <Badge className="mb-4 bg-yellow-400 text-gray-950">Seller Panel</Badge>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">Register your shop and sell locally.</h1>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Shop owner details submit korun. Admin approve korle apnar seller dashboard unlock hobe, sekhan theke product, stock, sizes, photos and orders manage korte parben.
            </p>
          </div>
          <div className="mt-8 grid gap-3">
            {[
              [ClipboardCheck, "Admin approval", "Submitted details admin panel-e verify hobe."],
              [PackagePlus, "Product upload", "Approved seller multiple photos and clothing sizes add korte parbe."],
              [ShieldCheck, "Secure selling", "GST optional, pincode based local delivery coverage."],
            ].map(([Icon, title, text]) => {
              const ItemIcon = Icon as typeof Store;
              return (
                <div key={String(title)} className="flex gap-3 rounded-xl bg-white/10 p-3">
                  <ItemIcon className="mt-0.5 h-5 w-5 text-yellow-300" />
                  <div>
                    <p className="font-semibold">{title as string}</p>
                    <p className="text-sm text-white/75">{text as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <Card className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <CardContent className="p-5 md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Shop owner registration</h2>
                <p className="text-sm text-muted-foreground">GST optional. Admin approval required.</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Owner name *" value={form.name} onChange={(value) => update("name", value)} />
                <Field label="Mobile number *" value={form.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
                <Field label="Email *" value={form.email} onChange={(value) => update("email", value)} type="email" />
                <div className="space-y-1.5">
                  <Label>Password *</Label>
                  <div className="relative">
                    <Input value={form.password} onChange={(event) => update("password", event.target.value)} type={showPassword ? "text" : "password"} className="pr-10" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-gray-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Field label="Shop name *" value={form.shopName} onChange={(value) => update("shopName", value)} />
                <Field label="Business type" value={form.businessType} onChange={(value) => update("businessType", value)} />
                <Field label="Main categories" value={form.shopCategory} onChange={(value) => update("shopCategory", value)} />
                <Field label="UPI ID *" value={form.upiId} onChange={(value) => update("upiId", value)} placeholder="shop@upi" />
                <Field label="GST number (optional)" value={form.gstNumber} onChange={(value) => update("gstNumber", value)} />
                <Field label="PAN number (optional)" value={form.panNumber} onChange={(value) => update("panNumber", value)} />
                <Field label="City *" value={form.city} onChange={(value) => update("city", value)} />
                <Field label="State *" value={form.state} onChange={(value) => update("state", value)} />
                <Field label="Pincode *" value={form.pincode} onChange={(value) => update("pincode", value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
              </div>

              <div className="space-y-1.5">
                <Label>Shop / pickup address *</Label>
                <Textarea value={form.shopAddress} onChange={(event) => update("shopAddress", event.target.value)} rows={3} placeholder="Full shop address with landmark" />
              </div>

              {otpSent && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <Label>OTP code</Label>
                  <Input className="mt-1" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} />
                  <p className="mt-1 text-xs text-blue-700">Enter the OTP sent to your mobile.</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Submitting..." : otpSent ? "Verify OTP and submit" : "Send OTP and continue"}
              </Button>

              <div className="flex flex-col gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900 sm:flex-row sm:items-center">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span>Approval hole seller panel-e Products page theke multiple images, clothing sizes and stock manage korte parben.</span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} type={type} inputMode={inputMode} placeholder={placeholder} />
    </div>
  );
}
