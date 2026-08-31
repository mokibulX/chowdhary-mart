import { useEffect, useMemo, useRef, useState } from "react";
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
import { fileToDataUrl, getCurrentIndianLocation } from "@/lib/live-location";
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
import { DEFAULT_LOCATION } from "@/lib/default-location";

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
const draftStepKey = `${draftKey}_step`;
const imageFields: Array<keyof DeliveryForm> = [
  "addressProofImage", "vehicleFrontImage", "numberPlateImage", "licenseFrontImage", "licenseBackImage",
  "identityFrontImage", "identityBackImage", "bankProofImage", "profileSelfie", "liveSelfie",
];

function registrationDraft(form: DeliveryForm) {
  const draft = { ...form };
  imageFields.forEach((field) => { draft[field] = "" as never; });
  draft.otp = "";
  return draft;
}

function restoreDraft() {
  try {
    const saved = { ...initialForm, ...JSON.parse(localStorage.getItem(draftKey) || "{}") } as DeliveryForm;
    imageFields.forEach((field) => { saved[field] = "" as never; });
    return saved;
  } catch {
    localStorage.removeItem(draftKey);
    return initialForm;
  }
}

function deliveryDraftStore(mode: IDBTransactionMode) {
  return new Promise<IDBObjectStore>((resolve, reject) => {
    const request = indexedDB.open("cm_delivery_drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction("drafts", mode).objectStore("drafts"));
  });
}

async function loadFullDraft() {
  if (!("indexedDB" in window)) return null;
  const store = await deliveryDraftStore("readonly");
  return new Promise<DeliveryForm | null>((resolve) => {
    const request = store.get(draftKey);
    request.onsuccess = () => resolve(request.result ? { ...initialForm, ...request.result } : null);
    request.onerror = () => resolve(null);
  });
}

async function saveFullDraft(form: DeliveryForm) {
  if (!("indexedDB" in window)) return;
  const store = await deliveryDraftStore("readwrite");
  store.put(form, draftKey);
}

async function clearFullDraft() {
  if (!("indexedDB" in window)) return;
  const store = await deliveryDraftStore("readwrite");
  store.delete(draftKey);
}
const challenges = ["Blink your eyes", "Turn your head left", "Smile clearly", "Look up once", "Move closer to the camera"];
const stepTitles = ["Mobile", "OTP", "Basic details", "Address", "Vehicle", "Licence", "Identity", "Payout", "Photo", "Live check", "Agreement", "Review"];
const VEHICLE_TYPES = ["Bicycle", "Non-motorised delivery cycle", "Electric bicycle", "Motorbike", "Scooter"];
const BANK_PREFIXES: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  BKID: "Bank of India",
  CBIN: "Central Bank of India",
  IOBA: "Indian Overseas Bank",
  YESB: "Yes Bank",
  KKBK: "Kotak Mahindra Bank",
  INDB: "IndusInd Bank",
  IDFB: "IDFC First Bank",
  FDRL: "Federal Bank",
  MAHB: "Bank of Maharashtra",
  UCBA: "UCO Bank",
};

function validateBankDetails(form: DeliveryForm) {
  const account = form.bankAccountNumber.trim();
  const ifsc = form.ifsc.trim().toUpperCase();
  const upi = form.upiId.trim();
  if (upi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(upi)) return "Valid UPI ID din, example: name@ybl";
  if (!upi && !account) return "UPI ID or bank account required.";
  if (!account) return "";
  if (!/^\d{9,18}$/.test(account)) return "Bank account number 9 to 18 digit hote hobe.";
  if (account !== form.confirmBankAccountNumber.trim()) return "Bank account number does not match.";
  if (/^(\d)\1+$/.test(account) || "01234567890123456789".includes(account) || "98765432109876543210".includes(account)) return "Real bank account number din, repeated/sequence number noy.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return "Valid IFSC din, example: SBIN0001234.";
  const bank = BANK_PREFIXES[ifsc.slice(0, 4)];
  if (!bank) return "IFSC-er bank code recognised noy. Cheque/passbook theke IFSC check korun.";
  const typedBank = form.bankName.trim().toLowerCase();
  if (typedBank.length < 3 || (!bank.toLowerCase().includes(typedBank) && !typedBank.includes(bank.toLowerCase().split(" ")[0]))) return `Bank name IFSC-er sathe match korte hobe: ${bank}.`;
  if (form.branchName.trim().length < 3 || /^(test|demo|na|n\/a|none|null)$/i.test(form.branchName.trim())) return "Real branch name din.";
  return "";
}

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
  city: DEFAULT_LOCATION.city,
  district: DEFAULT_LOCATION.district,
  state: DEFAULT_LOCATION.state,
  pincode: DEFAULT_LOCATION.pincode,
  lat: String(DEFAULT_LOCATION.lat),
  lng: String(DEFAULT_LOCATION.lng),
  selectedZoneId: "",
  addressProofType: "Aadhaar",
  addressProofImage: "",
  vehicleType: "Bicycle",
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
  licenseState: DEFAULT_LOCATION.state,
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
  const [step, setStep] = useState(() => {
    const saved = Number(localStorage.getItem(draftStepKey) ?? 0);
    return Number.isInteger(saved) && saved >= 0 && saved < stepTitles.length ? saved : 0;
  });
  const [form, setForm] = useState<DeliveryForm>(restoreDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneBusy, setZoneBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadFullDraft().then((saved) => {
      if (active && saved) setForm(saved);
    }).finally(() => { if (active) setDraftLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(registrationDraft(form)));
    } catch {
      localStorage.removeItem(draftKey);
    }
    void saveFullDraft(form).catch(() => undefined);
  }, [draftLoaded, form]);

  useEffect(() => {
    localStorage.setItem(draftStepKey, String(step));
  }, [step]);

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
      const imageByName = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
      if (!file.type.startsWith("image/") && !imageByName) throw new Error("Only image files are allowed.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Image must be under 20 MB.");
      const dataUrl = await fileToDataUrl(file);
      const estimatedBytes = Math.ceil((dataUrl.length - (dataUrl.indexOf(",") + 1)) * 0.75);
      if (estimatedBytes > 2 * 1024 * 1024) throw new Error("Compressed image is still too large. Please choose a clearer, smaller photo.");
      update(key, dataUrl as any);
      authToast({ title: "Photo added", description: "The image was compressed and is ready to submit." });
    } catch (error) {
      authToast({ title: "Photo upload failed", description: getFriendlyErrorMessage(error, "Please upload a JPG, PNG or WEBP image under 20 MB."), variant: "destructive" });
    }
  };

  const captureGps = async () => {
    setGpsBusy(true);
    try {
      const gps = await getCurrentIndianLocation();
      setForm((current) => ({
        ...current,
        lat: String(gps.lat),
        lng: String(gps.lng),
        fullAddress: gps.address || current.fullAddress,
        area: gps.area || current.area,
        city: gps.city || current.city,
        district: gps.district || current.district,
        state: gps.state || current.state,
        pincode: gps.pincode || current.pincode,
        permanentAddress: current.sameAddress ? (gps.address || current.fullAddress) : current.permanentAddress,
      }));
      authToast({ title: "Current location added", description: "Address, district, city, state, pincode and GPS were filled automatically." });
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
      if (form.emergencyPhone && !/^\d{10}$/.test(form.emergencyPhone)) return "Emergency phone must be 10 digits.";
      return "";
    }
    if (targetStep === 3) {
      const base = required(["fullAddress", "pincode", "lat", "lng", "selectedZoneId"], "Address, pincode, GPS and service zone required.");
      if (base) return base;
      const selected = zones.find((zone) => String(zone.id) === form.selectedZoneId);
      if (selected && !selected.insideServiceZone) return "Your current location is outside the selected service zone.";
    }
    if (targetStep === 4) {
      const base = required(["vehicleType", "vehicleFrontImage"], "Select vehicle type and add one clear vehicle photo.");
      if (base) return base;
      if (licenceRequired && !form.vehicleNumber.trim()) return "Vehicle number is required for motor vehicles.";
      return "";
    }
    if (targetStep === 5) {
      if (!licenceRequired) return "";
      return required(["licenseNumber", "licenseName", "licenseExpiry", "licenseFrontImage", "licenseBackImage"], "Licence details and photos required.");
    }
    if (targetStep === 6) {
      if (!form.aadhaarNumber.trim() && !form.panNumber.trim()) return "Aadhaar or PAN number required.";
      return required(["identityFrontImage"], "Add one clear identity document photo.");
    }
    if (targetStep === 7) {
      const bankError = validateBankDetails(form);
      if (bankError) return bankError;
    }
    if (targetStep === 8 && !form.profileSelfie) return "Profile selfie required.";
    if (targetStep === 9 && (!form.liveSelfie || !form.livenessConfirmed)) return "Complete live face and eye verification.";
    if (targetStep === 10 && !form.termsAccepted) return "Partner terms must be accepted.";
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
      localStorage.removeItem(draftStepKey);
      void clearFullDraft();
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
                <div className="grid grid-cols-[repeat(12,minmax(0,1fr))] items-center gap-1">
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
                  <Field label="Date of birth (optional)" value={form.dob} onChange={(value) => update("dob", value)} type="date" />
                  <Field label="Gender" value={form.gender} onChange={(value) => update("gender", value)} placeholder="Male / Female / Other" />
                  <Field label="Email (optional)" value={form.email} onChange={(value) => update("email", value)} type="email" />
                  <Field label="Alternate mobile" value={form.alternatePhone} onChange={(value) => update("alternatePhone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
                  <Field label="Preferred language" value={form.preferredLanguage} onChange={(value) => update("preferredLanguage", value)} />
                  <Field label="Emergency contact name (optional)" value={form.emergencyName} onChange={(value) => update("emergencyName", value)} />
                  <Field label="Emergency phone (optional)" value={form.emergencyPhone} onChange={(value) => update("emergencyPhone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" />
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
                <ImageInput label="Address proof photo (optional)" value={form.addressProofImage} onFile={(file) => setImage("addressProofImage", file)} />
              </Panel>
            )}

            {step === 4 && (
              <Panel title="Vehicle details">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Vehicle type" value={form.vehicleType} onChange={(value) => update("vehicleType", value)} />
                  <Field label="Brand (optional)" value={form.vehicleBrand} onChange={(value) => update("vehicleBrand", value)} />
                  <Field label="Model" value={form.vehicleModel} onChange={(value) => update("vehicleModel", value)} />
                  <Field label={licenceRequired ? "Vehicle number *" : "Vehicle number (optional)"} value={form.vehicleNumber} onChange={(value) => update("vehicleNumber", value.toUpperCase())} placeholder="WB01AB1234" />
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
                  <ImageInput label="Number plate photo (optional for bicycle)" value={form.numberPlateImage} onFile={(file) => setImage("numberPlateImage", file)} />
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
                  <Field label="Aadhaar number (Aadhaar or PAN required)" value={form.aadhaarNumber} onChange={(value) => update("aadhaarNumber", value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" />
                  <Field label="PAN number (Aadhaar or PAN required)" value={form.panNumber} onChange={(value) => update("panNumber", value.toUpperCase().slice(0, 10))} />
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
                <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">A valid UPI ID is enough for basic registration. Bank fields are optional.</p>
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
                <LiveFaceCapture
                  value={form.liveSelfie}
                  onCapture={(image) => setForm((current) => ({ ...current, liveSelfie: image, livenessConfirmed: true }))}
                />
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
                  <ReviewLine label="Profile photo" value={form.profileSelfie ? "Ready for admin review" : "Pending"} />
                </div>
                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                  Sob thik thakle submit korun. Admin approve korle rider dashboard active hobe.
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

export function LiveFaceCapture({ value, onCapture }: { value: string; onCapture: (image: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const checkingRef = useRef(false);
  const readyRef = useRef(false);
  const autoCapturedRef = useRef(false);
  const autoCaptureTimerRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState("Keep your face inside the circle.");

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    checkingRef.current = false;
    readyRef.current = false;
    if (autoCaptureTimerRef.current) {
      window.clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  };

  const setNotReady = (nextMessage: string) => {
    readyRef.current = false;
    setReady(false);
    setMessage(nextMessage);
    if (autoCaptureTimerRef.current) {
      window.clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  };

  function capture(auto = false) {
    const video = videoRef.current;
    if (!video || !readyRef.current || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.9);
    autoCapturedRef.current = autoCapturedRef.current || auto;
    setCaptured(image);
    onCapture(image);
    stop();
    setMessage(auto ? "Live selfie captured automatically." : "Live selfie ready.");
  }

  const setFaceReady = (nextMessage: string) => {
    readyRef.current = true;
    setReady(true);
    setMessage(nextMessage);
    if (autoCapturedRef.current || autoCaptureTimerRef.current) return;
    autoCaptureTimerRef.current = window.setTimeout(() => {
      autoCaptureTimerRef.current = null;
      capture(true);
    }, 900);
  };

  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || checkingRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight) return;
      if (!detectorRef.current) {
        setFaceReady("Camera ready. Blink once or keep still for auto capture.");
        return;
      }
      checkingRef.current = true;
      try {
        const faces = await detectorRef.current.detect(video);
        if (faces.length !== 1) {
          setNotReady(faces.length > 1 ? "Only one face should be visible." : "Please position your face inside the circle.");
          return;
        }
        const face = faces[0];
        const box = face.boundingBox;
        const faceCenterX = (box.x + box.width / 2) / video.videoWidth;
        const faceCenterY = (box.y + box.height / 2) / video.videoHeight;
        const largeEnough = box.width > video.videoWidth * 0.18 && box.height > video.videoHeight * 0.22;
        const centered = faceCenterX > 0.25 && faceCenterX < 0.75 && faceCenterY > 0.2 && faceCenterY < 0.8;
        if (!largeEnough) {
          setNotReady("Move a little closer to the camera.");
        } else if (!centered) {
          setNotReady("Keep your face centered inside the circle.");
        } else {
          setFaceReady("Face is clear. Blink once or keep still for auto capture.");
        }
      } catch {
        setNotReady("Please position your face inside the circle.");
      } finally {
        checkingRef.current = false;
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running]);

  const start = async () => {
    setAttempted(true);
    stop();
    setCaptured("");
    autoCapturedRef.current = false;
    setReady(false);
    setMessage("Requesting camera permission...");
    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        setMessage("Camera access needs HTTPS. Open cMart using a secure browser address.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("Camera access is not supported in this browser.");
        return;
      }
      const FaceDetectorCtor = (window as any).FaceDetector;
      detectorRef.current = FaceDetectorCtor ? new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 2 }) : null;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      } catch (error) {
        if ((error as DOMException)?.name !== "OverconstrainedError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);
      setMessage(detectorRef.current ? "Keep your face inside the circle, then blink once." : "Camera ready. Blink once or keep still for auto capture.");
    } catch (error) {
      stop();
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Camera permission is required to take a live selfie. Please allow camera access in your browser settings and try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("No camera was detected on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setMessage("Your camera may be in use by another application. Close other camera apps and try again.");
      } else {
        setMessage("Could not start the camera. Check your browser camera permission and try again.");
      }
    }
  };

  const useSelfie = () => {
    if (!captured) return;
    onCapture(captured);
    setMessage("Live selfie ready.");
  };

  const preview = captured || value;

  return (
    <div className="space-y-4 rounded-2xl border bg-gray-50 p-4">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-full border-4 border-white bg-gray-950 shadow-[0_0_0_4px_rgba(249,115,22,.35),0_18px_45px_rgba(15,23,42,.2)]">
        {preview && !running ? <img src={preview} alt="Live selfie preview" className="h-full w-full object-cover" /> : null}
        <video ref={videoRef} playsInline muted className={`h-full w-full scale-x-[-1] object-cover ${running ? "block" : "hidden"}`} />
        {running && <div className={`pointer-events-none absolute inset-0 rounded-full border-4 ${ready ? "border-emerald-400" : "border-white/90"}`} />}
        {!running && !preview && <div className="flex h-full items-center justify-center px-10 text-center text-sm text-white/70"><Camera className="mr-2 h-5 w-5" />Camera not started</div>}
      </div>
      <p className="text-center text-sm font-semibold text-slate-700">Keep your face inside the circle</p>
      <p className={`rounded-xl px-3 py-2 text-center text-sm font-medium ${ready || preview ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800"}`}>{message}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {running ? (
          <Button type="button" onClick={() => capture()} disabled={!ready} className="h-12 sm:col-span-2"><Camera className="mr-2 h-4 w-4" />Capture Selfie</Button>
        ) : captured ? (
          <>
            <Button type="button" variant="outline" onClick={start} className="h-12">Retake</Button>
            <Button type="button" onClick={useSelfie} className="h-12"><CheckCircle2 className="mr-2 h-4 w-4" />Use Selfie</Button>
          </>
        ) : (
          <Button type="button" onClick={start} className="h-12 sm:col-span-2"><Camera className="mr-2 h-4 w-4" />{attempted ? "Try Again" : value ? "Retake Selfie" : "Start Camera"}</Button>
        )}
      </div>
    </div>
  );
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

function ImageInput({ label, value, onFile, capture }: { label: string; value: string; onFile: (file?: File) => Promise<void> | void; capture?: boolean }) {
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
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`inline-flex h-12 w-full items-center justify-center rounded-2xl border bg-white px-4 text-sm font-medium ${busy ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
          <Upload className="mr-2 h-4 w-4" /> {busy ? "Preparing photo..." : "Choose from Gallery"}
          <input className="hidden" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif" disabled={busy} onChange={chooseFile} />
        </label>
        <label className={`inline-flex h-12 w-full items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-700 ${busy ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-orange-100"}`}>
          <Camera className="mr-2 h-4 w-4" /> {busy ? "Preparing photo..." : "Take Live Photo"}
          <input className="hidden" type="file" accept="image/*" capture={capture ? "user" : "environment"} disabled={busy} onChange={chooseFile} />
        </label>
      </div>
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
