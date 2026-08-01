import { useEffect, useMemo, useState } from "react";
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
import { fileToDataUrl, getBrowserLocation } from "@/lib/live-location";
import { testMode } from "@/lib/test-mode";
import {
  Bike,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  IdCard,
  LocateFixed,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/error-message";
import { IndiaStateDistrictSelects, IndiaStateSelect } from "@/components/IndiaLocationSelects";
import { DateTextInput } from "@/components/DateTextInput";

type DeliveryForm = {
  countryCode: string;
  phone: string;
  otp: string;
  name: string;
  guardianName: string;
  dob: string;
  gender: string;
  email: string;
  alternatePhone: string;
  preferredLanguage: string;
  password: string;
  confirmPassword: string;
  emergencyName: string;
  emergencyPhone: string;
  fullAddress: string;
  permanentAddress: string;
  sameAddress: boolean;
  houseNumber: string;
  street: string;
  area: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
  selectedZoneId: string;
  addressProofType: string;
  addressProofImage: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleColor: string;
  vehicleYear: string;
  rcNumber: string;
  insuranceExpiry: string;
  pollutionExpiry: string;
  vehicleFrontImage: string;
  numberPlateImage: string;
  licenseNumber: string;
  licenseName: string;
  licenseDob: string;
  licenseIssueDate: string;
  licenseExpiry: string;
  licenseClass: string;
  licenseState: string;
  licenseFrontImage: string;
  licenseBackImage: string;
  identityType: string;
  aadhaarNumber: string;
  panNumber: string;
  identityName: string;
  identityDob: string;
  identityFrontImage: string;
  identityBackImage: string;
  accountHolderName: string;
  bankName: string;
  bankAccountNumber: string;
  confirmBankAccountNumber: string;
  ifsc: string;
  branchName: string;
  upiId: string;
  bankProofImage: string;
  profileSelfie: string;
  liveSelfie: string;
  livenessChallenge: string;
  livenessConfirmed: boolean;
  backgroundConsent: boolean;
  termsAccepted: boolean;
  privacyConsent: boolean;
};
type RegisterResponse = { token: string };

const draftKey = "cm_delivery_partner_registration_draft";
const challenges = ["Blink your eyes", "Turn your head left", "Smile clearly", "Look up once", "Move closer to the camera"];
const stepTitles = ["Mobile", "OTP", "Personal", "Address", "Vehicle", "Licence", "Identity", "Bank", "Profile photo", "Live selfie", "Agreement", "Review", "Status"];
const VEHICLE_TYPES = ["Bicycle", "Non-motorised delivery cycle", "Electric bicycle", "Motorbike", "Scooter"];

const initialForm: DeliveryForm = {
  countryCode: "+91",
  phone: "",
  otp: "",
  name: "",
  guardianName: "",
  dob: "",
  gender: "",
  email: "",
  alternatePhone: "",
  preferredLanguage: "Bengali",
  password: "",
  confirmPassword: "",
  emergencyName: "",
  emergencyPhone: "",
  fullAddress: "",
  permanentAddress: "",
  sameAddress: true,
  houseNumber: "",
  street: "",
  area: "",
  landmark: "",
  city: "Kolkata",
  district: "North 24 Parganas",
  state: "West Bengal",
  pincode: "",
  lat: "",
  lng: "",
  selectedZoneId: "",
  addressProofType: "Aadhaar",
  addressProofImage: "",
  vehicleType: "Bike",
  vehicleBrand: "",
  vehicleModel: "",
  vehicleNumber: "",
  vehicleColor: "",
  vehicleYear: "",
  rcNumber: "",
  insuranceExpiry: "",
  pollutionExpiry: "",
  vehicleFrontImage: "",
  numberPlateImage: "",
  licenseNumber: "",
  licenseName: "",
  licenseDob: "",
  licenseIssueDate: "",
  licenseExpiry: "",
  licenseClass: "MCWG",
  licenseState: "West Bengal",
  licenseFrontImage: "",
  licenseBackImage: "",
  identityType: "Aadhaar card",
  aadhaarNumber: "",
  panNumber: "",
  identityName: "",
  identityDob: "",
  identityFrontImage: "",
  identityBackImage: "",
  accountHolderName: "",
  bankName: "",
  bankAccountNumber: "",
  confirmBankAccountNumber: "",
  ifsc: "",
  branchName: "",
  upiId: "",
  bankProofImage: "",
  profileSelfie: "",
  liveSelfie: "",
  livenessChallenge: challenges[Math.floor(Math.random() * challenges.length)],
  livenessConfirmed: false,
  backgroundConsent: false,
  termsAccepted: false,
  privacyConsent: false,
};

export default function DeliveryRegister() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const authToast = (options: Parameters<typeof toast>[0]) => toast({ duration: 2000, ...options });
  const [registering, setRegistering] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DeliveryForm>(() => {
    try {
      return { ...initialForm, ...JSON.parse(localStorage.getItem(draftKey) || "{}") };
    } catch {
      return initialForm;
    }
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneBusy, setZoneBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ ...form, otp: "" }));
  }, [form]);

  useEffect(() => {
    if (!form.lat || !form.lng) return;
    setZoneBusy(true);
    customFetch<{ items: any[] }>(`/api/public/service-zones?type=rider&lat=${encodeURIComponent(form.lat)}&lng=${encodeURIComponent(form.lng)}`)
      .then((res) => setZones(res.items ?? []))
      .catch(() => setZones([]))
      .finally(() => setZoneBusy(false));
  }, [form.lat, form.lng]);

  const passwordScore = useMemo(() => {
    return [
      form.password.length >= 8,
      /[A-Z]/.test(form.password),
      /[a-z]/.test(form.password),
      /\d/.test(form.password),
      /[^A-Za-z0-9]/.test(form.password),
    ].filter(Boolean).length;
  }, [form.password]);
  const licenceRequired = useMemo(() => requiresDrivingLicence(form.vehicleType), [form.vehicleType]);

  const update = <K extends keyof DeliveryForm>(key: K, value: DeliveryForm[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "sameAddress" && value) next.permanentAddress = next.fullAddress;
      if (key === "fullAddress" && current.sameAddress) next.permanentAddress = String(value);
      return next;
    });
  };

  const setImage = async (key: keyof DeliveryForm, file?: File) => {
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      update(key, await fileToDataUrl(file) as any);
    } catch (error) {
      authToast({ title: "Photo upload failed", description: getFriendlyErrorMessage(error, "Please upload a clear image under 5 MB."), variant: "destructive" });
    }
  };

  const captureGps = async () => {
    setGpsBusy(true);
    try {
      const gps = await getBrowserLocation();
      update("lat", String(gps.lat));
      update("lng", String(gps.lng));
      authToast({ title: "Live location added", description: "GPS location saved with your address." });
    } catch (error) {
      authToast({ title: "GPS permission needed", description: getFriendlyErrorMessage(error, "Could not get location."), variant: "destructive" });
    } finally {
      setGpsBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!/^\d{10}$/.test(form.phone)) {
      authToast({ title: "Valid mobile required", variant: "destructive" });
      return;
    }
    setOtpBusy(true);
    try {
      await customFetch("/api/auth/delivery-otp/send", { method: "POST", body: JSON.stringify({ phone: form.phone }) });
      setOtpSent(true);
      setStep(1);
      authToast({ title: "OTP sent", description: testMode.allowDemoOtp ? `Demo OTP: ${testMode.demoOtpCode}` : "Enter the code from your mobile. It expires in 5 minutes." });
    } catch (error) {
      authToast({ title: "OTP failed", description: getFriendlyErrorMessage(error, "OTP could not be sent. Please try again."), variant: "destructive" });
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    setOtpBusy(true);
    try {
      await customFetch("/api/auth/delivery-otp/verify", { method: "POST", body: JSON.stringify({ phone: form.phone, otp: form.otp }) });
      setOtpVerified(true);
      authToast({ title: "Mobile verified" });
      setStep(1);
    } catch (error) {
      authToast({ title: "OTP verification failed", description: getFriendlyErrorMessage(error, "OTP is invalid or expired."), variant: "destructive" });
    } finally {
      setOtpBusy(false);
    }
  };

  const validateStep = (targetStep = step) => {
    const required = (fields: Array<keyof DeliveryForm>, message: string) => {
      if (fields.some((field) => !String(form[field] ?? "").trim())) return message;
      return "";
    };
    if (targetStep === 0) {
      if (!/^\d{10}$/.test(form.phone)) return "Valid mobile number required.";
      if (!otpSent && !otpVerified) return "Send OTP first.";
    }
    if (targetStep === 1 && !otpVerified) return "Mobile OTP verify korun.";
    if (targetStep === 2) {
      if (!/^[A-Za-z .]{2,}$/.test(form.name.trim())) return "Valid full name required.";
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(form.password)) return "Password needs uppercase, lowercase, number and special character.";
      if (form.password !== form.confirmPassword) return "Passwords do not match.";
      return required(["dob", "emergencyName", "emergencyPhone"], "Date of birth and emergency contact required.");
    }
    if (targetStep === 3) {
      const base = required(["fullAddress", "pincode", "lat", "lng", "selectedZoneId", "addressProofImage"], "Address, pincode, GPS, service zone and address proof required.");
      if (base) return base;
      const selected = zones.find((zone) => String(zone.id) === form.selectedZoneId);
      if (selected && !selected.insideServiceZone) return "Your current location is outside the selected service zone.";
    }
    if (targetStep === 4) return required(["vehicleType", "vehicleNumber", "vehicleBrand", "vehicleFrontImage", "numberPlateImage"], "Vehicle details and photos required.");
    if (targetStep === 5) {
      if (!licenceRequired) return "";
      return required(["licenseNumber", "licenseName", "licenseExpiry", "licenseFrontImage", "licenseBackImage"], "Licence details and photos required.");
    }
    if (targetStep === 6) return required(["aadhaarNumber", "panNumber", "identityFrontImage"], "Aadhaar, PAN and identity document photo required.");
    if (targetStep === 7) {
      if (!form.upiId && (!form.bankAccountNumber || !form.ifsc)) return "UPI ID or bank account with IFSC required.";
      if (form.bankAccountNumber && form.bankAccountNumber !== form.confirmBankAccountNumber) return "Bank account number does not match.";
    }
    if (targetStep === 8 && !form.profileSelfie) return "Profile selfie required.";
    if (targetStep === 9 && (!form.liveSelfie || !form.livenessConfirmed)) return "Live selfie and liveness confirmation required.";
    if (targetStep === 10 && (!form.backgroundConsent || !form.termsAccepted || !form.privacyConsent)) return "All consent checkboxes are required.";
    return "";
  };

  const next = () => {
    const error = validateStep();
    if (error) {
      authToast({ title: "Step incomplete", description: error, variant: "destructive" });
      return;
    }
    setStep((current) => {
      const nextStep = current + 1;
      if (current === 4 && !licenceRequired) return 6;
      return Math.min(stepTitles.length - 1, nextStep);
    });
  };

  const submit = async () => {
    for (let index = 0; index < stepTitles.length; index += 1) {
      if (index === 5 && !licenceRequired) continue;
      const error = validateStep(index);
      if (error) {
        setStep(index);
        authToast({ title: "Registration incomplete", description: error, variant: "destructive" });
        return;
      }
    }
    setRegistering(true);
    try {
      const res = await customFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          phone: form.phone.replace(/\D/g, ""),
          otp: form.otp,
          panNumber: form.panNumber.toUpperCase(),
          vehicleNumber: form.vehicleNumber.toUpperCase(),
          licenseNumber: form.licenseNumber.toUpperCase(),
          ifsc: form.ifsc.toUpperCase(),
          role: "delivery_partner",
          selfieUrl: form.profileSelfie,
          selectedZoneId: Number(form.selectedZoneId),
          currentLatitude: Number(form.lat),
          currentLongitude: Number(form.lng),
        }),
      });
      localStorage.removeItem(draftKey);
      login(res.token);
      authToast({ title: "Application submitted", description: "Admin review pending. Approval hole delivery panel active hobe." });
      setLocation("/delivery");
    } catch (error) {
      authToast({ title: "Registration failed", description: getFriendlyErrorMessage(error, "Could not submit delivery registration. Please check the details."), variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="native-page-scroll min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-blue-50 pb-28 lg:pb-0">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border bg-white" onClick={() => step > 0 ? setStep((current) => current - 1) : window.history.back()} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-primary">ChowdharyMart Rider</p>
            <h1 className="truncate text-base font-bold">{stepTitles[step]}</h1>
          </div>
          <button type="button" className="h-11 rounded-full border bg-white px-3 text-xs font-bold" onClick={() => authToast({ title: "Draft saved", description: "You can resume this registration later." })}>
            Save
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / stepTitles.length) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Step {step + 1} of {stepTitles.length}</p>
      </header>

      <div className="mx-auto grid min-h-[100dvh] max-w-6xl gap-3 px-3 py-3 lg:grid-cols-[0.78fr_1.22fr] lg:gap-5 lg:px-4 lg:py-6">
        <section className="hidden rounded-2xl bg-gray-950 p-5 text-white shadow-lg sm:p-6 lg:block">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/75 hover:text-white">
            <ChevronLeft className="h-4 w-4" /> Chowdhary Mart
          </Link>
          <div className="mt-7">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-gray-950">
              <Bike className="h-8 w-8" />
            </div>
            <Badge className="mb-3 bg-white text-gray-950">Secure rider onboarding</Badge>
            <h1 className="text-3xl font-bold">Delivery partner registration</h1>
            <p className="mt-3 text-sm leading-6 text-white/70">OTP, KYC, profile selfie, live selfie and admin approval required before accepting orders.</p>
          </div>
          <div className="mt-8 space-y-3 text-sm">
            <Feature icon={<ShieldCheck className="h-5 w-5 text-green-300" />} text="Admin approved partners only can go online." />
            <Feature icon={<IdCard className="h-5 w-5 text-blue-300" />} text="Identity, licence, vehicle and payout details are reviewed." />
            <Feature icon={<WalletCards className="h-5 w-5 text-yellow-300" />} text="Daily first online requires live selfie security check." />
          </div>
        </section>

        <Card className="min-w-0 overflow-hidden rounded-[24px] border bg-white/95 shadow-xl lg:rounded-2xl">
          <CardContent className="min-w-0 p-3 pb-32 sm:p-6 lg:pb-6">
            <div className="mb-5 hidden lg:block">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Step {step + 1} of {stepTitles.length}</p>
                  <h2 className="text-xl font-bold">{stepTitles[step]}</h2>
                </div>
                <Badge variant="outline">Draft saved</Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / stepTitles.length) * 100}%` }} />
              </div>
              <div className="mt-4 rounded-2xl border bg-gray-50 p-3">
                <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] items-center gap-1">
                  {stepTitles.map((title, index) => {
                    const disabled = index === 5 && !licenceRequired;
                    const active = index === step;
                    const done = index < step;
                    return (
                      <button
                        key={title}
                        type="button"
                        disabled={disabled}
                        onClick={() => setStep(index)}
                        aria-label={`Step ${index + 1}: ${title}`}
                        title={`${index + 1}. ${title}`}
                        className={`relative flex h-9 min-h-0 items-center justify-center rounded-xl text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                          active
                            ? "bg-primary text-white shadow-md shadow-orange-500/20"
                            : done
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-900"
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-gray-950">{step + 1}. {stepTitles[step]}</span>
                  <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted-foreground ring-1 ring-gray-200">{Math.round(((step + 1) / stepTitles.length) * 100)}% complete</span>
                </div>
              </div>
            </div>

            {step === 0 && (
              <Panel title="Mobile number">
                <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
                  <Field label="Code" value={form.countryCode} onChange={(value) => update("countryCode", value)} />
                  <Field label="Mobile number" value={form.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" disabled={otpVerified} />
                </div>
                <Button className="h-12 w-full rounded-2xl" type="button" onClick={sendOtp} disabled={otpBusy || otpVerified}>{otpVerified ? "Mobile verified" : otpSent ? "Resend OTP" : "Send OTP"}</Button>
                <p className="text-sm text-muted-foreground">
                  OTP server-side verify hobe. Same mobile diye duplicate rider account create hobe na.
                  {testMode.allowDemoOtp ? <span className="ml-1 font-bold text-amber-700">Demo OTP: {testMode.demoOtpCode}</span> : null}
                </p>
              </Panel>
            )}

            {step === 1 && (
              <Panel title="OTP verification">
                <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
                  OTP sent to <b>{form.countryCode} {form.phone || "your mobile"}</b>. Code expires in 5 minutes.
                </div>
                <Field label="OTP code" value={form.otp} onChange={(value) => update("otp", value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
                {testMode.allowDemoOtp && (
                  <button
                    type="button"
                    className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200"
                    onClick={() => update("otp", testMode.demoOtpCode || "123456")}
                  >
                    Use demo OTP: {testMode.demoOtpCode || "123456"}
                  </button>
                )}
                <Button className="h-12 w-full rounded-2xl" type="button" onClick={verifyOtp} disabled={otpBusy || otpVerified}>{otpVerified ? "Verified" : "Verify OTP"}</Button>
              </Panel>
            )}

            {step === 2 && (
              <Panel title="Personal details">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name *" value={form.name} onChange={(value) => update("name", value.replace(/[^A-Za-z .]/g, ""))} />
                  <Field label="Guardian name" value={form.guardianName} onChange={(value) => update("guardianName", value.replace(/[^A-Za-z .]/g, ""))} />
                  <Field label="Date of birth *" value={form.dob} onChange={(value) => update("dob", value)} type="date" />
                  <Field label="Gender" value={form.gender} onChange={(value) => update("gender", value)} placeholder="Male / Female / Other" />
                  <Field label="Email (optional)" value={form.email} onChange={(value) => update("email", value)} type="email" />
                  <Field label="Alternate mobile" value={form.alternatePhone} onChange={(value) => update("alternatePhone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
                  <Field label="Preferred language" value={form.preferredLanguage} onChange={(value) => update("preferredLanguage", value)} />
                  <Field label="Emergency contact name *" value={form.emergencyName} onChange={(value) => update("emergencyName", value)} />
                  <Field label="Emergency phone *" value={form.emergencyPhone} onChange={(value) => update("emergencyPhone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
                  <PasswordField label="Password *" value={form.password} onChange={(value) => update("password", value)} visible={showPassword} setVisible={setShowPassword} />
                  <PasswordField label="Confirm password *" value={form.confirmPassword} onChange={(value) => update("confirmPassword", value)} visible={showConfirm} setVisible={setShowConfirm} />
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span>Password strength</span>
                    <b>{passwordScore >= 5 ? "Strong" : passwordScore >= 3 ? "Medium" : "Weak"}</b>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div className={`h-full ${passwordScore >= 5 ? "bg-green-600" : passwordScore >= 3 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${passwordScore * 20}%` }} />
                  </div>
                </div>
              </Panel>
            )}

            {step === 3 && (
              <Panel title="Address and GPS">
                <Textarea value={form.fullAddress} onChange={(event) => update("fullAddress", event.target.value)} placeholder="Current full address" rows={3} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="House number" value={form.houseNumber} onChange={(value) => update("houseNumber", value)} />
                  <Field label="Street" value={form.street} onChange={(value) => update("street", value)} />
                  <Field label="Area" value={form.area} onChange={(value) => update("area", value)} />
                  <Field label="Landmark" value={form.landmark} onChange={(value) => update("landmark", value)} />
                  <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
                  <IndiaStateDistrictSelects
                    state={form.state}
                    district={form.district}
                    onStateChange={(state, district) => setForm((current) => ({ ...current, state, district }))}
                    onDistrictChange={(district) => update("district", district)}
                    stateLabel="State"
                    districtLabel="District"
                  />
                  <Field label="Pincode *" value={form.pincode} onChange={(value) => update("pincode", value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
                  <Field label="Latitude" value={form.lat} onChange={(value) => update("lat", value)} />
                  <Field label="Longitude" value={form.lng} onChange={(value) => update("lng", value)} />
                </div>
                <Button type="button" variant="outline" onClick={captureGps} disabled={gpsBusy}><LocateFixed className="mr-2 h-4 w-4" /> Use current GPS location</Button>
                <div className="rounded-2xl border bg-emerald-50 p-4">
                  <div className="mb-3">
                    <p className="font-bold text-emerald-950">Primary working zone</p>
                    <p className="text-xs text-emerald-800">Only admin-created active delivery zones can be selected.</p>
                  </div>
                  {!form.lat || !form.lng ? (
                    <p className="rounded-xl bg-white p-3 text-sm text-muted-foreground">Use current GPS first to load rider zones.</p>
                  ) : zoneBusy ? (
                    <p className="rounded-xl bg-white p-3 text-sm">Loading rider zones...</p>
                  ) : zones.length === 0 ? (
                    <p className="rounded-xl bg-white p-3 text-sm text-red-700">No active delivery zone found near this GPS.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {zones.map((zone) => (
                        <button key={zone.id} type="button" onClick={() => update("selectedZoneId", String(zone.id))} className={`rounded-xl border bg-white p-3 text-left transition ${form.selectedZoneId === String(zone.id) ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{zone.name}</p>
                            <Badge className={zone.insideServiceZone ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{zone.insideServiceZone ? "Inside" : "Outside"}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{zone.code} - {zone.distanceKm ?? "--"} km - Delivery enabled</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <CheckRow checked={form.sameAddress} onChange={(value) => update("sameAddress", value)} label="Permanent address same as current address" />
                {!form.sameAddress && <Textarea value={form.permanentAddress} onChange={(event) => update("permanentAddress", event.target.value)} placeholder="Permanent address" rows={3} />}
                <ImageInput label="Address proof photo *" value={form.addressProofImage} onFile={(file) => setImage("addressProofImage", file)} />
              </Panel>
            )}

            {step === 4 && (
              <Panel title="Vehicle details">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Vehicle type" value={form.vehicleType} onChange={(value) => update("vehicleType", value)} />
                  <Field label="Brand *" value={form.vehicleBrand} onChange={(value) => update("vehicleBrand", value)} />
                  <Field label="Model" value={form.vehicleModel} onChange={(value) => update("vehicleModel", value)} />
                  <Field label="Vehicle number *" value={form.vehicleNumber} onChange={(value) => update("vehicleNumber", value.toUpperCase())} placeholder="WB01AB1234" />
                  <Field label="Vehicle colour" value={form.vehicleColor} onChange={(value) => update("vehicleColor", value)} />
                  <Field label="Vehicle year" value={form.vehicleYear} onChange={(value) => update("vehicleYear", value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" />
                  <Field label="RC number" value={form.rcNumber} onChange={(value) => update("rcNumber", value.toUpperCase())} />
                  <Field label="Insurance expiry" value={form.insuranceExpiry} onChange={(value) => update("insuranceExpiry", value)} type="date" />
                  <Field label="Pollution expiry" value={form.pollutionExpiry} onChange={(value) => update("pollutionExpiry", value)} type="date" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {VEHICLE_TYPES.map((type) => (
                    <button key={type} type="button" onClick={() => update("vehicleType", type)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.vehicleType === type ? "border-primary bg-primary text-white" : "bg-white hover:border-primary"}`}>
                      {type}
                    </button>
                  ))}
                </div>
                <div className={`rounded-xl p-3 text-sm ${licenceRequired ? "bg-yellow-50 text-yellow-800" : "bg-green-50 text-green-800"}`}>
                  {licenceRequired ? "Driving licence is required for this vehicle type." : "Licence not required for selected vehicle. Admin will see this as policy-based exemption."}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ImageInput label="Vehicle front photo *" value={form.vehicleFrontImage} onFile={(file) => setImage("vehicleFrontImage", file)} />
                  <ImageInput label="Number plate photo *" value={form.numberPlateImage} onFile={(file) => setImage("numberPlateImage", file)} />
                </div>
              </Panel>
            )}

            {step === 5 && (
              <Panel title="Driving licence">
                {!licenceRequired ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 p-5 text-sm text-green-800">
                    <CheckCircle2 className="mb-2 h-6 w-6" />
                    Licence not required for selected vehicle: <b>{form.vehicleType}</b>. This step is skipped by policy and existing uploaded licence, if any, is preserved.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Licence number *" value={form.licenseNumber} onChange={(value) => update("licenseNumber", value.toUpperCase())} />
                      <Field label="Name on licence *" value={form.licenseName} onChange={(value) => update("licenseName", value)} />
                      <Field label="Licence DOB" value={form.licenseDob} onChange={(value) => update("licenseDob", value)} type="date" />
                      <Field label="Issue date" value={form.licenseIssueDate} onChange={(value) => update("licenseIssueDate", value)} type="date" />
                      <Field label="Expiry date *" value={form.licenseExpiry} onChange={(value) => update("licenseExpiry", value)} type="date" />
                      <Field label="Licence class" value={form.licenseClass} onChange={(value) => update("licenseClass", value)} />
                      <IndiaStateSelect label="Issuing state" value={form.licenseState} onChange={(value) => update("licenseState", value)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ImageInput label="Licence front *" value={form.licenseFrontImage} onFile={(file) => setImage("licenseFrontImage", file)} />
                      <ImageInput label="Licence back *" value={form.licenseBackImage} onFile={(file) => setImage("licenseBackImage", file)} />
                    </div>
                  </>
                )}
              </Panel>
            )}

            {step === 6 && (
              <Panel title="Identity verification">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Identity type" value={form.identityType} onChange={(value) => update("identityType", value)} />
                  <Field label="Aadhaar number *" value={form.aadhaarNumber} onChange={(value) => update("aadhaarNumber", value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" />
                  <Field label="PAN number *" value={form.panNumber} onChange={(value) => update("panNumber", value.toUpperCase().slice(0, 10))} />
                  <Field label="Name on document" value={form.identityName} onChange={(value) => update("identityName", value)} />
                  <Field label="Document DOB" value={form.identityDob} onChange={(value) => update("identityDob", value)} type="date" />
                </div>
                <p className="rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800">Sensitive document numbers are masked in normal app views and only admin review can access verification status.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ImageInput label="ID front *" value={form.identityFrontImage} onFile={(file) => setImage("identityFrontImage", file)} />
                  <ImageInput label="ID back" value={form.identityBackImage} onFile={(file) => setImage("identityBackImage", file)} />
                </div>
              </Panel>
            )}

            {step === 7 && (
              <Panel title="Bank and payout">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Account holder" value={form.accountHolderName} onChange={(value) => update("accountHolderName", value)} />
                  <Field label="Bank name" value={form.bankName} onChange={(value) => update("bankName", value)} />
                  <Field label="Account number" value={form.bankAccountNumber} onChange={(value) => update("bankAccountNumber", value.replace(/\D/g, "").slice(0, 18))} inputMode="numeric" />
                  <Field label="Confirm account" value={form.confirmBankAccountNumber} onChange={(value) => update("confirmBankAccountNumber", value.replace(/\D/g, "").slice(0, 18))} inputMode="numeric" />
                  <Field label="IFSC" value={form.ifsc} onChange={(value) => update("ifsc", value.toUpperCase().slice(0, 11))} />
                  <Field label="Branch" value={form.branchName} onChange={(value) => update("branchName", value)} />
                  <Field label="UPI ID" value={form.upiId} onChange={(value) => update("upiId", value)} placeholder="name@upi" />
                </div>
                <ImageInput label="Cancelled cheque/passbook photo" value={form.bankProofImage} onFile={(file) => setImage("bankProofImage", file)} />
              </Panel>
            )}

            {step === 8 && (
              <Panel title="Profile selfie">
                <p className="text-sm text-muted-foreground">Clear face, no helmet/sunglasses/mask, single person only. This verification selfie is not shown to customers.</p>
                <ImageInput label="Take photo or choose from gallery *" value={form.profileSelfie} onFile={(file) => setImage("profileSelfie", file)} capture />
              </Panel>
            )}

            {step === 9 && (
              <Panel title="Live selfie verification">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm text-blue-700">Challenge</p>
                  <p className="text-lg font-bold text-blue-950">{form.livenessChallenge}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => update("livenessChallenge", challenges[Math.floor(Math.random() * challenges.length)])}>Change challenge</Button>
                </div>
                <ImageInput label="Capture live selfie with front camera *" value={form.liveSelfie} onFile={(file) => setImage("liveSelfie", file)} capture />
                <CheckRow checked={form.livenessConfirmed} onChange={(value) => update("livenessConfirmed", value)} label="I completed the shown liveness action while taking this live selfie." />
              </Panel>
            )}

            {step === 10 && (
              <Panel title="Agreement and review">
                <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6">
                  <p><b>Admin review:</b> Your mobile, KYC, vehicle, bank and selfie verification will stay pending until admin approval.</p>
                  <p><b>Activation:</b> Daily first Go Online requires live selfie and GPS permission.</p>
                  <p><b>Privacy:</b> Verification selfies/documents stay restricted for onboarding/admin review only.</p>
                </div>
                <CheckRow checked={form.backgroundConsent} onChange={(value) => update("backgroundConsent", value)} label="I allow identity, licence, vehicle and address verification." />
                <CheckRow checked={form.termsAccepted} onChange={(value) => update("termsAccepted", value)} label="I accept delivery OTP handover, live GPS tracking and partner rules." />
                <CheckRow checked={form.privacyConsent} onChange={(value) => update("privacyConsent", value)} label="I understand how selfies/documents are used for fraud prevention and admin verification." />
              </Panel>
            )}

            {step === 11 && (
              <Panel title="Registration review">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <ReviewLine label="Mobile" value={otpVerified ? `${form.countryCode} ${form.phone} verified` : "Pending"} />
                  <ReviewLine label="Name" value={form.name || "Pending"} />
                  <ReviewLine label="Vehicle" value={`${form.vehicleType} ${form.vehicleNumber}`.trim() || "Pending"} />
                  <ReviewLine label="Licence" value={licenceRequired ? (form.licenseNumber || "Pending") : "Not required for selected vehicle"} />
                  <ReviewLine label="Payout" value={form.upiId || (form.bankAccountNumber ? `Bank ending ${form.bankAccountNumber.slice(-4)}` : "Pending")} />
                  <ReviewLine label="Selfie" value={form.profileSelfie && form.liveSelfie ? "Ready for admin review" : "Pending"} />
                </div>
                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                  Sob thik thakle submit korun. Admin approve korle rider dashboard active hobe.
                </div>
              </Panel>
            )}

            {step === 12 && (
              <Panel title="Submission status">
                <div className="rounded-3xl bg-gray-950 p-5 text-white">
                  <CheckCircle2 className="mb-3 h-10 w-10 text-green-300" />
                  <h3 className="text-xl font-bold">Ready to submit</h3>
                  <p className="mt-2 text-sm text-white/70">Submit korar pore status: Under review. Admin verification complete hole account activated hobe.</p>
                </div>
              </Panel>
            )}

            <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[1fr_1fr] gap-2 border-t bg-white/95 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur lg:static lg:mt-6 lg:flex lg:flex-row lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <Button className="h-12 rounded-2xl" type="button" variant="outline" onClick={() => setStep((current) => current === 6 && !licenceRequired ? 4 : Math.max(0, current - 1))} disabled={step === 0}>Previous</Button>
              {step < stepTitles.length - 1 ? (
                <Button className="h-12 rounded-2xl" type="button" onClick={next}>Continue</Button>
              ) : (
                <Button className="h-12 rounded-2xl" type="button" onClick={submit} disabled={registering}>
                  {registering ? "Submitting..." : "Submit for admin review"}
                </Button>
              )}
              <Button className="col-span-2 h-11 rounded-2xl lg:hidden" type="button" variant="ghost" onClick={() => authToast({ title: "Draft saved", description: "Registration data saved on this device." })}>Save Draft</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-[22px] border bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-5">
      <h3 className="text-base font-bold leading-tight sm:text-lg">{title}</h3>
      {children}
    </section>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex min-w-0 gap-3 rounded-xl bg-white/10 p-3">{icon}<span className="min-w-0">{text}</span></div>;
}

function Field({ label, value, onChange, type = "text", inputMode, placeholder, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {type === "date" ? (
        <DateTextInput className="h-12 min-w-0 rounded-2xl" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
      ) : (
        <Input className="h-12 min-w-0 rounded-2xl" value={value} onChange={(event) => onChange(event.target.value)} type={type} inputMode={inputMode} placeholder={placeholder} disabled={disabled} />
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, setVisible }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  setVisible: (visible: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input value={value} onChange={(event) => onChange(event.target.value)} type={visible ? "text" : "password"} className="h-12 min-w-0 rounded-2xl pr-10" autoComplete="new-password" />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-gray-100" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ImageInput({ label, value, onFile, capture }: { label: string; value: string; onFile: (file?: File) => void; capture?: boolean }) {
  return (
    <div className="min-w-0 space-y-2 rounded-[22px] border bg-gray-50 p-3">
      <Label>{label}</Label>
      {value ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <img src={value} alt="" className="h-24 w-full rounded-2xl object-cover sm:w-24" />
          <div className="text-sm text-green-700"><CheckCircle2 className="mb-1 h-5 w-5" /> Photo added</div>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed bg-white text-sm text-muted-foreground">
          <Camera className="mr-2 h-4 w-4" /> No photo selected
        </div>
      )}
      <label className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl border bg-white px-4 text-sm font-medium hover:bg-gray-50 sm:w-auto">
        <Upload className="mr-2 h-4 w-4" /> Upload / Camera
        <input className="hidden" type="file" accept="image/*" capture={capture ? "user" : undefined} onChange={(event) => onFile(event.target.files?.[0])} />
      </label>
    </div>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border bg-gray-50 p-3 text-sm leading-5">
      <input className="mt-1 h-4 w-4 rounded border-gray-300" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function envFlag(name: string, fallback: boolean) {
  const value = String((import.meta.env as Record<string, unknown>)[name] ?? "").toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function requiresDrivingLicence(vehicleType: string) {
  const vehicle = vehicleType.toLowerCase();
  if (vehicle.includes("bicycle") || vehicle.includes("cycle")) {
    if (vehicle.includes("electric") || vehicle.includes("e-bicycle")) return envFlag("VITE_REQUIRE_DRIVING_LICENCE_FOR_E_BICYCLE", false);
    return envFlag("VITE_REQUIRE_DRIVING_LICENCE_FOR_BICYCLE", false);
  }
  if (vehicle.includes("scooter")) return envFlag("VITE_REQUIRE_DRIVING_LICENCE_FOR_SCOOTER", true);
  if (vehicle.includes("motor") || vehicle.includes("bike")) return envFlag("VITE_REQUIRE_DRIVING_LICENCE_FOR_MOTORBIKE", true);
  return true;
}
