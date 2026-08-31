import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, ClipboardCheck, Eye, EyeOff, LocateFixed, MapPin, PackagePlus, ShieldCheck, Store, Upload, UserRound } from "lucide-react";
import { isDemoOtp, testMode } from "@/lib/test-mode";
import { fileToDataUrl, getCurrentIndianLocation } from "@/lib/live-location";
import { PickupLocationPicker, type PickupLocation } from "@/components/PickupLocationPicker";
import { getFriendlyErrorMessage } from "@/lib/error-message";
import { IndiaStateDistrictSelects } from "@/components/IndiaLocationSelects";
import { DEFAULT_LOCATION } from "@/lib/default-location";

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
  district: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  upiId: string;
  lat: string;
  lng: string;
  selectedZoneId: string;
  ownerPhoto: string;
  shopFrontPhoto: string;
};
type RegisterResponse = { token: string };

const initialForm: SellerForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  shopName: "",
  businessType: "Retail shop",
  shopCategory: "",
  shopAddress: "",
  city: DEFAULT_LOCATION.city,
  district: DEFAULT_LOCATION.district,
  state: DEFAULT_LOCATION.state,
  pincode: DEFAULT_LOCATION.pincode,
  gstNumber: "",
  panNumber: "",
  upiId: "",
  lat: String(DEFAULT_LOCATION.lat),
  lng: String(DEFAULT_LOCATION.lng),
  selectedZoneId: "",
  ownerPhoto: "",
  shopFrontPhoto: "",
};

export default function SellerRegister() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const authToast = (options: Parameters<typeof toast>[0]) => toast({ duration: 2000, ...options });
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState<SellerForm>(initialForm);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentialFieldsReady, setCredentialFieldsReady] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const formLat = Number(form.lat);
  const formLng = Number(form.lng);
  const currentPickupLocation: PickupLocation | null = form.lat && form.lng && Number.isFinite(formLat) && Number.isFinite(formLng)
    ? {
        lat: formLat,
        lng: formLng,
        address: form.shopAddress || `${formLat.toFixed(6)}, ${formLng.toFixed(6)}`,
        distanceKm: null,
        available: true,
      }
    : null;

  useEffect(() => {
    setForm({ ...initialForm });
    setOtpSent(false);
    setOtp("");
    setCredentialFieldsReady(false);
  }, []);

  const update = (key: keyof SellerForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectedCategories = form.shopCategory
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const availableCategoryOptions = Array.from(new Set([...categoryOptions, ...selectedCategories]));

  const toggleCategory = (category: string) => {
    setForm((current) => {
      const selected = current.shopCategory.split(",").map((value) => value.trim()).filter(Boolean);
      const exists = selected.some((value) => value.toLowerCase() === category.toLowerCase());
      const next = exists
        ? selected.filter((value) => value.toLowerCase() !== category.toLowerCase())
        : [...selected, category];
      return { ...current, shopCategory: next.join(", ") };
    });
  };

  useEffect(() => {
    if (!form.lat || !form.lng) return;
    setZoneBusy(true);
    customFetch<{ items: any[] }>(`/api/public/service-zones?type=seller&lat=${encodeURIComponent(form.lat)}&lng=${encodeURIComponent(form.lng)}`)
      .then((res) => setZones(res.items ?? []))
      .catch(() => setZones([]))
      .finally(() => setZoneBusy(false));
  }, [form.lat, form.lng]);

  useEffect(() => {
    let active = true;
    customFetch<any>("/api/categories")
      .then((response) => {
        const rows = Array.isArray(response)
          ? response
          : response?.categories ?? response?.items ?? response?.data ?? [];
        const names = rows
          .map((item: any) =>
            typeof item === "string" ? item : item?.name ?? item?.title ?? item?.category ?? item?.label,
          )
          .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
          .map((name) => name.trim());
        if (active) setCategoryOptions([...new Set(names)]);
      })
      .catch(() => {
        if (active) setCategoryOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const captureGps = async () => {
    setGpsBusy(true);
    try {
      const gps = await getCurrentIndianLocation();
      setForm((current) => ({
        ...current,
        lat: String(gps.lat),
        lng: String(gps.lng),
        shopAddress: gps.address || current.shopAddress,
        city: gps.city || current.city,
        district: gps.district || current.district,
        state: gps.state || current.state,
        pincode: gps.pincode || current.pincode,
      }));
      authToast({ title: "Current location added", description: "Address, district, city, state, pincode and GPS were filled automatically." });
    } catch (error) {
      authToast({ title: "GPS permission needed", description: getFriendlyErrorMessage(error, "Could not get live location."), variant: "destructive" });
    } finally {
      setGpsBusy(false);
    }
  };

  const setPhoto = async (key: "ownerPhoto" | "shopFrontPhoto", file?: File) => {
    if (!file) return;
    try {
      const imageByName = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
      if (!file.type.startsWith("image/") && !imageByName) throw new Error("Only image files are allowed.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Image must be under 20 MB.");
      const dataUrl = await fileToDataUrl(file);
      update(key, dataUrl);
      authToast({ title: "Photo added", description: key === "ownerPhoto" ? "Seller photo is ready for admin review." : "Shop front photo is ready for admin review." });
    } catch (error) {
      authToast({ title: "Photo upload failed", description: getFriendlyErrorMessage(error, "Please choose a clear JPG, PNG or WEBP image."), variant: "destructive" });
    }
  };

  const validate = () => {
    const required: Array<keyof SellerForm> = ["name", "email", "phone", "password", "shopName", "shopAddress", "city", "district", "state", "pincode", "upiId"];
    const missing = required.find((key) => !form[key].trim());
    if (missing) {
      authToast({ title: "Complete required details", description: "Owner name, email, mobile, password, shop name, address, pincode and UPI ID are required.", variant: "destructive" });
      return false;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) {
      authToast({ title: "Invalid mobile", description: "10 digit mobile number din.", variant: "destructive" });
      return false;
    }
    if (!/^\d{6}$/.test(form.pincode)) {
      authToast({ title: "Invalid pincode", description: "6 digit pincode din.", variant: "destructive" });
      return false;
    }
    if (!/^[\w.-]+@[\w.-]+$/.test(form.upiId.trim())) {
      authToast({ title: "Invalid UPI ID", description: "Example: shop@upi", variant: "destructive" });
      return false;
    }
    if (!form.lat || !form.lng) {
      authToast({ title: "Live GPS required", description: "Shop zone select korar age current GPS location nin.", variant: "destructive" });
      return false;
    }
    if (!form.selectedZoneId) {
      authToast({ title: "Service zone required", description: "Admin-created active service zone select korun.", variant: "destructive" });
      return false;
    }
    if (!form.ownerPhoto || !form.shopFrontPhoto) {
      authToast({ title: "Photos required", description: "Add a clear seller photo and a photo of the shop front for admin verification.", variant: "destructive" });
      return false;
    }
    const selected = zones.find((zone) => String(zone.id) === form.selectedZoneId);
    if (selected && !selected.insideServiceZone) {
      authToast({ title: "Outside service zone", description: "Your shop location is outside the selected service zone.", variant: "destructive" });
      return false;
    }
    if (form.password.length < 6) {
      authToast({ title: "Password too short", description: "Minimum 6 character password din.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    if (!otpSent) {
      try {
        await customFetch("/api/auth/otp/send", {
          method: "POST",
          body: JSON.stringify({ phone: form.phone.replace(/\D/g, ""), email: form.email.trim().toLowerCase(), purpose: "register" }),
        });
        setOtpSent(true);
        setOtp("");
        authToast({ title: "OTP sent", description: testMode.allowDemoOtp ? `Demo OTP: ${testMode.demoOtpCode}` : "Enter the verification code to submit shop registration." });
      } catch (error) {
        authToast({ title: "OTP failed", description: getFriendlyErrorMessage(error, "OTP could not be sent. Please try again."), variant: "destructive" });
      }
      return;
    }
    if (!isDemoOtp(otp)) {
      authToast({ title: "Invalid OTP", description: "Please check the code and try again.", variant: "destructive" });
      return;
    }
    setRegistering(true);
    try {
      const res = await customFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          phone: form.phone.replace(/\D/g, ""),
          email: form.email.trim().toLowerCase(),
          otp,
          upiId: form.upiId.trim(),
          role: "vendor",
          gstNumber: form.gstNumber || undefined,
          panNumber: form.panNumber || undefined,
          selectedZoneId: Number(form.selectedZoneId),
          shopLatitude: Number(form.lat),
          shopLongitude: Number(form.lng),
          avatarUrl: form.ownerPhoto,
          bannerUrl: form.shopFrontPhoto,
        }),
      });
      login(res.token);
      authToast({ title: "Shop registration submitted", description: "Admin approve korle seller panel-e product add korte parben. Existing account thakleo application submit hoyeche." });
      setLocation("/vendor");
    } catch (err) {
      authToast({ title: "Registration failed", description: getFriendlyErrorMessage(err, "Could not submit shop registration. Please check the details."), variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="native-page-scroll min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-orange-50 via-white to-blue-50 pb-24 sm:px-4 sm:py-6">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => window.history.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">Chowdhary Mart Seller</p>
            <h1 className="truncate text-base font-bold">Shop registration</h1>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-3 sm:px-0 lg:grid-cols-[0.9fr_1.1fr] lg:gap-5 lg:py-0">
        <section className="hidden rounded-2xl bg-[#0f3f8f] p-6 text-white shadow-lg lg:block lg:p-8">
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

        <Card className="min-w-0 overflow-hidden rounded-[24px] border bg-white/95 shadow-xl sm:rounded-[26px]">
          <CardContent className="p-3 sm:p-5 md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight sm:text-xl">Shop owner registration</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">GST optional. Admin approval required.</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4" autoComplete="off" name="seller-registration" data-form-type="other">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Owner name *" value={form.name} onChange={(value) => update("name", value)} />
                <Field label="Mobile number *" value={form.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
                <Field label="Email *" value={form.email} onChange={(value) => update("email", value)} type="email" autoComplete="off" readOnly={!credentialFieldsReady} onFocus={() => setCredentialFieldsReady(true)} />
                <div className="space-y-1.5">
                  <Label>Password *</Label>
                  <div className="relative">
                    <Input
                      id="seller-registration-password"
                      name="seller-registration-password"
                      value={form.password}
                      onChange={(event) => update("password", event.target.value)}
                      onFocus={() => setCredentialFieldsReady(true)}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      readOnly={!credentialFieldsReady}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      spellCheck={false}
                      className="h-12 rounded-2xl pr-10"
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-gray-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Field label="Shop name *" value={form.shopName} onChange={(value) => update("shopName", value)} />
                <Field label="Business type" value={form.businessType} onChange={(value) => update("businessType", value)} />
                <div className="space-y-1.5">
                  <label htmlFor="seller-main-categories" className="block text-sm font-medium">
                    Main categories
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      id="seller-main-categories"
                      className="flex min-h-[56px] w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
                      onClick={() => setCategoryMenuOpen((open) => !open)}
                      aria-haspopup="listbox"
                      aria-expanded={categoryMenuOpen}
                    >
                      <span className={selectedCategories.length ? "leading-6" : "leading-6 text-slate-500"}>
                        {selectedCategories.length ? selectedCategories.join(", ") : "Select existing categories"}
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${categoryMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {categoryMenuOpen && (
                      <div
                        className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                        role="listbox"
                        aria-label="Main categories"
                      >
                        {availableCategoryOptions.length ? availableCategoryOptions.map((category) => {
                          const selected = selectedCategories.some((value) => value.toLowerCase() === category.toLowerCase());
                          return (
                            <button
                              type="button"
                              key={category}
                              role="option"
                              aria-selected={selected}
                              onClick={() => toggleCategory(category)}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${selected ? "bg-orange-50 text-orange-700" : "hover:bg-slate-50"}`}
                            >
                              <span>{category}</span>
                              {selected && <CheckCircle2 className="h-4 w-4" />}
                            </button>
                          );
                        }) : <p className="px-3 py-2 text-sm text-slate-500">No categories available</p>}
                      </div>
                    )}
                  </div>
                  <input type="hidden" name="shopCategory" value={form.shopCategory} />
                </div>
                <Field label="UPI ID *" value={form.upiId} onChange={(value) => update("upiId", value)} placeholder="shop@upi" />
                <Field label="GST number (optional)" value={form.gstNumber} onChange={(value) => update("gstNumber", value)} />
                <Field label="PAN number (optional)" value={form.panNumber} onChange={(value) => update("panNumber", value)} />
                <Field label="City *" value={form.city} onChange={(value) => update("city", value)} />
                <IndiaStateDistrictSelects
                  state={form.state}
                  district={form.district}
                  onStateChange={(state, district) => setForm((current) => ({ ...current, state, district }))}
                  onDistrictChange={(district) => update("district", district)}
                />
                <Field label="Pincode *" value={form.pincode} onChange={(value) => update("pincode", value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
                <Field label="Latitude" value={form.lat} onChange={(value) => update("lat", value)} />
                <Field label="Longitude" value={form.lng} onChange={(value) => update("lng", value)} />
              </div>

              <div className="rounded-3xl border bg-gray-50 p-3 sm:p-4">
                <div className="mb-3">
                  <p className="font-bold">Verification photos</p>
                  <p className="text-xs text-muted-foreground">Admin will review both photos before approving the seller dashboard.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SellerPhotoInput
                    label="Seller / owner photo *"
                    value={form.ownerPhoto}
                    icon={<UserRound className="h-5 w-5" />}
                    camera="user"
                    onFile={(file) => setPhoto("ownerPhoto", file)}
                  />
                  <SellerPhotoInput
                    label="Shop front photo *"
                    value={form.shopFrontPhoto}
                    icon={<Store className="h-5 w-5" />}
                    camera="environment"
                    onFile={(file) => setPhoto("shopFrontPhoto", file)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border bg-white p-2 shadow-sm sm:p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold">Exact shop pickup point</p>
                    <p className="text-xs text-muted-foreground">Delivery partner ei pin-e giye item receive korbe.</p>
                  </div>
                  <Badge className={currentPickupLocation ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                    {currentPickupLocation ? "Selected" : "Required"}
                  </Badge>
                </div>
                <PickupLocationPicker
                  mode="inline"
                  initial={currentPickupLocation}
                  locateFirst={!currentPickupLocation}
                  title="Set exact shop location"
                  subtitle="GPS use korun, map move korun, ba tap kore pickup pin set korun."
                  confirmLabel="Use This Shop Pickup Point"
                  compact
                  onClose={() => undefined}
                  onConfirm={(location) => {
                    setForm((current) => ({
                      ...current,
                      lat: String(location.lat),
                      lng: String(location.lng),
                      shopAddress: location.address,
                      city: location.city || current.city,
                      district: location.district || current.district,
                      state: location.state || current.state,
                      pincode: location.pincode || current.pincode,
                    }));
                    authToast({ title: "Shop pickup point selected", description: location.address });
                  }}
                />
              </div>

              <div className="rounded-2xl border bg-orange-50 p-3 sm:p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold text-orange-950">Service zone</p>
                    <p className="text-xs text-orange-800">Only admin-created active seller zones can be selected.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full rounded-xl sm:w-auto" onClick={captureGps} disabled={gpsBusy}>
                    <LocateFixed className="mr-2 h-4 w-4" /> {gpsBusy ? "Reading..." : "Use GPS"}
                  </Button>
                </div>
                {!form.lat || !form.lng ? (
                  <p className="rounded-xl bg-white p-3 text-sm text-muted-foreground">Use current GPS first to load nearest zones.</p>
                ) : zoneBusy ? (
                  <p className="rounded-xl bg-white p-3 text-sm">Loading nearest zones...</p>
                ) : zones.length === 0 ? (
                  <p className="rounded-xl bg-white p-3 text-sm text-red-700">No active seller registration zone found near this GPS.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {zones.map((zone) => (
                      <button key={zone.id} type="button" onClick={() => update("selectedZoneId", String(zone.id))} className={`rounded-xl border bg-white p-3 text-left transition ${form.selectedZoneId === String(zone.id) ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{zone.name}</p>
                            <p className="text-xs text-muted-foreground">{zone.code} - {zone.approximateArea}</p>
                          </div>
                          <Badge className={zone.insideServiceZone ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                            {zone.insideServiceZone ? "Inside" : "Outside"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" /> {zone.distanceKm ?? "--"} km from centre - Delivery {zone.deliveryMinutes} min</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Shop / pickup address *</Label>
                <Textarea value={form.shopAddress} onChange={(event) => update("shopAddress", event.target.value)} rows={3} placeholder="Full shop address with landmark" />
              </div>

              {otpSent && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <Label>OTP code</Label>
                  <Input className="mt-1" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} />
                  <p className="mt-1 text-xs text-blue-700">
                    Enter the OTP sent to your mobile.
                    <span className="ml-1 font-bold">Demo OTP: {testMode.demoOtpCode || "123456"}</span>
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={registering}>
                {registering ? "Submitting..." : otpSent ? "Verify OTP and submit" : "Send OTP and continue"}
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

function SellerPhotoInput({ label, value, icon, camera, onFile }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  camera: "user" | "environment";
  onFile: (file?: File) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onFile(file);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  return (
    <div className="min-w-0 space-y-3 rounded-2xl border bg-white p-3">
      <Label className="flex items-center gap-2">{icon}{label}</Label>
      {value ? (
        <img src={value} alt={label} className="h-40 w-full rounded-xl border object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-gray-50 text-sm text-muted-foreground">
          <Camera className="mr-2 h-4 w-4" /> No photo selected
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={`inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-medium hover:bg-gray-50 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <Upload className="mr-2 h-4 w-4" /> Gallery
          <input type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" className="hidden" disabled={busy} onChange={chooseFile} />
        </label>
        <label className={`inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-orange-200 bg-orange-50 px-2 text-center text-sm font-semibold text-orange-700 hover:bg-orange-100 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <Camera className="mr-2 h-4 w-4" /> Camera
          <input type="file" accept="image/*" capture={camera} className="hidden" disabled={busy} onChange={chooseFile} />
        </label>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Preparing photo...</p>}
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
  autoComplete = "off",
  readOnly = false,
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
  onFocus?: () => void;
}) {
  const fieldName = `seller-registration-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldName}>{label}</Label>
      <Input
        id={fieldName}
        name={fieldName}
        className="h-12 rounded-2xl"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        data-lpignore="true"
        data-1p-ignore="true"
      />
    </div>
  );
}
