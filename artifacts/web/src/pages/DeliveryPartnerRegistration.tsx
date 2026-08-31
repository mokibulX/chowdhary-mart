import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fileToDataUrl, getCurrentIndianLocation } from "@/lib/live-location";
import { testMode } from "@/lib/test-mode";
import { Bike, Camera, CheckCircle2, ChevronLeft, FileText, LockKeyhole, Upload } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/error-message";
import { LiveFaceCapture } from "@/pages/DeliveryRegister";

type SignupForm = {
  name: string;
  phone: string;
  email: string;
  otp: string;
  aadhaarDocument: string;
  panDocument: string;
  profilePhoto: string;
  liveSelfie: string;
};

const DRAFT_KEY = "cm_delivery_simple_signup";
const VERIFIED_PHONE_KEY = `${DRAFT_KEY}_verified_phone`;
const steps = ["Personal details", "Documents", "Live selfie", "Review & submit"];
const emptyForm: SignupForm = { name: "", phone: "", email: "", otp: "", aadhaarDocument: "", panDocument: "", profilePhoto: "", liveSelfie: "" };

function loadDraft(): SignupForm {
  try { return { ...emptyForm, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") }; } catch { return emptyForm; }
}

function imageSize(dataUrl: string) {
  return Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
}

export default function DeliveryPartnerRegistration() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<SignupForm>(loadDraft);
  const [step, setStep] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(() => {
    try {
      const draft = loadDraft();
      return !!draft.phone && localStorage.getItem(VERIFIED_PHONE_KEY) === draft.phone;
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const safe = { ...form, aadhaarDocument: "", panDocument: "", profilePhoto: "", liveSelfie: "", otp: "" };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
  }, [form]);

  const update = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => {
    if (key === "phone" && value !== form.phone) {
      setOtpSent(false);
      setOtpVerified(false);
      localStorage.removeItem(VERIFIED_PHONE_KEY);
    }
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "phone" && value !== current.phone) next.otp = "";
      return next;
    });
  };
  const message = (title: string, description?: string, destructive = false) => toast({ title, description, variant: destructive ? "destructive" : undefined, duration: 2500 });

  const sendOtp = async (): Promise<void> => {
    if (!/^\d{10}$/.test(form.phone)) { message("Valid mobile required", "Enter a 10 digit Indian mobile number.", true); return; }
    setBusy(true);
    try {
      await customFetch("/api/auth/delivery-otp/send", { method: "POST", body: JSON.stringify({ phone: form.phone }) });
      setOtpSent(true); setOtpVerified(false); localStorage.removeItem(VERIFIED_PHONE_KEY); setStep(0);
      message("OTP sent", testMode.allowDemoOtp ? `Demo OTP: ${testMode.demoOtpCode}` : "Enter the code sent to your phone.");
    } catch (error) { message("OTP failed", getFriendlyErrorMessage(error, "Could not send OTP."), true); } finally { setBusy(false); }
  };

  const verifyOtp = async (): Promise<void> => {
    setBusy(true);
    try {
      await customFetch("/api/auth/delivery-otp/verify", { method: "POST", body: JSON.stringify({ phone: form.phone, otp: form.otp }) });
      setOtpVerified(true); localStorage.setItem(VERIFIED_PHONE_KEY, form.phone); message("Mobile verified"); setStep(1);
    } catch (error) { message("OTP failed", getFriendlyErrorMessage(error, "Invalid or expired OTP."), true); } finally { setBusy(false); }
  };

  const setFile = async (key: "aadhaarDocument" | "panDocument" | "profilePhoto", file?: File): Promise<void> => {
    if (!file) return;
    const isDocument = key !== "profilePhoto";
    const allowed = isDocument ? ["image/jpeg", "image/png", "image/webp", "application/pdf"] : ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { message("Unsupported file", isDocument ? "Use JPG, PNG, WEBP or PDF." : "Use JPG, PNG or WEBP.", true); return; }
    if (file.size > 10 * 1024 * 1024) { message("File too large", "Choose a file smaller than 10 MB.", true); return; }
    try {
      const data = await fileToDataUrl(file);
      if (imageSize(data) > (isDocument ? 3.5 : 2.5) * 1024 * 1024) throw new Error("File is too large after encoding. Choose a smaller file.");
      update(key, data);
    } catch (error) { message("Upload failed", getFriendlyErrorMessage(error, "Could not read this file. Try again."), true); }
  };

  const validate = () => {
    if (step === 0) {
      if (!/^[A-Za-z .]{2,}$/.test(form.name.trim())) return "Enter your full name.";
      if (!/^\d{10}$/.test(form.phone)) return "Enter a valid 10 digit mobile number.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address.";
      if (!otpVerified) return "Verify your mobile OTP first.";
    }
    if (step === 1) {
      if (!form.aadhaarDocument || !form.panDocument || !form.profilePhoto) return "Upload Aadhaar, PAN and profile photo.";
    }
    if (step === 2 && !form.liveSelfie) return "Take a live selfie using the camera.";
    return "";
  };

  const submit = async () => {
    setBusy(true);
    try {
      const gps = await getCurrentIndianLocation();
      const zones = await customFetch<{ items: Array<{ id: number; insideServiceZone?: boolean }> }>(`/api/public/service-zones?type=rider&lat=${gps.lat}&lng=${gps.lng}`);
      const zone = zones.items?.find((item) => item.insideServiceZone);
      if (!zone) throw new Error("No active delivery zone found near your current location.");
      const response = await customFetch<{ token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...form, role: "delivery_partner", selectedZoneId: zone.id, currentLatitude: gps.lat, currentLongitude: gps.lng }),
      });
      localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(VERIFIED_PHONE_KEY); login(response.token); message("Application submitted", "Your delivery partner application is now under admin review."); setLocation("/delivery");
    } catch (error) { message("Registration failed", getFriendlyErrorMessage(error, "Could not submit your application."), true); } finally { setBusy(false); }
  };

  const next = (): void => { const error = validate(); if (error) { message("Step incomplete", error, true); return; } setStep((current) => Math.min(3, current + 1)); };

  return <div className="min-h-[100dvh] bg-slate-50 px-3 py-3 sm:px-6 sm:py-8">
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[.7fr_1.3fr]">
      <aside className="hidden rounded-3xl bg-slate-950 p-7 text-white lg:block">
        <Link href="/" className="text-sm text-white/70">Chowdhary Mart</Link>
        <div className="mt-16 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-slate-950"><Bike /></div>
        <Badge className="mt-6 bg-white text-slate-950">Simple rider onboarding</Badge>
        <h1 className="mt-4 text-4xl font-black leading-tight">Become a delivery partner.</h1>
        <p className="mt-4 text-white/70">Only the details needed for identity, safety and account approval.</p>
      </aside>
      <Card className="overflow-hidden rounded-3xl border-0 shadow-xl"><CardContent className="p-4 sm:p-7">
        <div className="mb-6 flex items-center justify-between gap-3"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border bg-white" onClick={() => step ? setStep(step - 1) : window.history.back()} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-orange-600">Delivery partner</p><h2 className="truncate text-xl font-black">{steps[step]}</h2></div><span className="text-xs font-bold text-muted-foreground">{step + 1}/4</span></div>
        <div className="mb-7 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
        {step === 0 && <section className="space-y-4"><Field label="Full name *" value={form.name} onChange={(value) => update("name", value.replace(/[^A-Za-z .]/g, ""))} /><Field label="Mobile number *" value={form.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" disabled={otpVerified} /><Field label="Email *" value={form.email} onChange={(value) => update("email", value)} type="email" /><Button type="button" variant="outline" className="h-12 w-full" onClick={sendOtp} disabled={busy || otpVerified}>{otpVerified ? "Mobile verified" : otpSent ? "Resend OTP" : "Send mobile OTP"}</Button>{otpSent && <div className="space-y-2"><Field label="OTP" value={form.otp} onChange={(value) => update("otp", value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /><Button type="button" className="h-12 w-full" onClick={verifyOtp} disabled={busy || otpVerified}>{otpVerified ? "OTP verified" : "Verify OTP"}</Button></div>}</section>}
        {step === 1 && <section className="space-y-5"><DocumentCard label="Aadhaar card *" value={form.aadhaarDocument} onFile={(file) => setFile("aadhaarDocument", file)} /><DocumentCard label="PAN card *" value={form.panDocument} onFile={(file) => setFile("panDocument", file)} /><DocumentCard label="Profile photo *" value={form.profilePhoto} onFile={(file) => setFile("profilePhoto", file)} imageOnly capture /><p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Aadhaar and PAN files are stored privately for admin review only.</p></section>}
        {step === 2 && <section className="space-y-4"><div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><p className="font-bold">Camera-only live selfie</p><p className="mt-1">Gallery and file upload are not available. Keep one face visible and follow the camera check.</p></div><LiveFaceCapture value={form.liveSelfie} onCapture={(image) => update("liveSelfie", image)} /></section>}
        {step === 3 && <section className="space-y-4"><Review label="Name" value={form.name} /><Review label="Mobile" value={`${form.phone} ${otpVerified ? "(verified)" : ""}`} /><Review label="Email" value={form.email} /><Review label="Aadhaar" value={form.aadhaarDocument ? "Document ready" : "Missing"} /><Review label="PAN" value={form.panDocument ? "Document ready" : "Missing"} /><Review label="Profile photo" value={form.profilePhoto ? "Ready" : "Missing"} /><Review label="Live selfie" value={form.liveSelfie ? "Camera capture ready" : "Missing"} /><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mb-2 h-5 w-5" />When you submit, your current GPS location will be checked against an active rider zone. Your application status will be Under Review.</div></section>}
        <div className="mt-7 flex gap-3"><Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || busy}>Back</Button>{step < 3 ? <Button type="button" className="h-12 flex-1" onClick={next} disabled={busy}>{step === 0 && !otpVerified ? "Verify mobile first" : "Continue"}</Button> : <Button type="button" className="h-12 flex-1" onClick={submit} disabled={busy}>{busy ? "Submitting..." : "Submit application"}</Button>}</div>
      </CardContent></Card>
    </div>
  </div>;
}

function Field({ label, value, onChange, type = "text", inputMode, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "tel" | "numeric"; disabled?: boolean }) { return <div className="space-y-1.5"><Label>{label}</Label><Input className="h-12 rounded-xl" value={value} onChange={(event) => onChange(event.target.value)} type={type} inputMode={inputMode} disabled={disabled} /></div>; }
function DocumentCard({ label, value, onFile, imageOnly = false, capture = false }: { label: string; value: string; onFile: (file?: File) => void; imageOnly?: boolean; capture?: boolean }) { return <div className="rounded-2xl border border-dashed bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 font-bold"><FileText className="h-5 w-5 text-orange-500" />{label}</div>{value ? <div className="mb-3 overflow-hidden rounded-xl border bg-white p-2">{value.startsWith("data:image") ? <img src={value} alt={label} className="h-36 w-full rounded-lg object-contain" /> : <p className="truncate text-sm text-emerald-700">Document selected</p>}</div> : <p className="mb-3 text-sm text-muted-foreground">No file selected</p>}<label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white font-bold ring-1 ring-slate-200 hover:bg-slate-100"><Upload className="h-4 w-4" />{capture ? "Choose or take photo" : "Upload document"}<input className="sr-only" type="file" accept={imageOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} capture={capture ? "user" : undefined} onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 rounded-xl border bg-white px-4 py-3"><span className="text-sm text-muted-foreground">{label}</span><span className="text-right text-sm font-bold">{value || "Missing"}</span></div>; }
