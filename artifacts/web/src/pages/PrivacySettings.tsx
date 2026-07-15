import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BellOff, Database, Download, Eye, LocateFixed, LockKeyhole, ShieldCheck, Smartphone, Trash2 } from "lucide-react";

type PrivacyState = {
  personalizedOffers: boolean;
  orderUpdates: boolean;
  locationForDelivery: boolean;
  shareWithSellers: boolean;
  saveSearchHistory: boolean;
  appLock: boolean;
};

const STORAGE_KEY = "chowdhary_privacy_settings";

const DEFAULTS: PrivacyState = {
  personalizedOffers: true,
  orderUpdates: true,
  locationForDelivery: true,
  shareWithSellers: false,
  saveSearchHistory: true,
  appLock: false,
};

export default function PrivacySettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PrivacyState>(DEFAULTS);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
      } catch {
        setSettings(DEFAULTS);
      }
    }
  }, []);

  const update = (key: keyof PrivacyState, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast({ title: "Privacy updated", description: "Your preference has been saved on this device." });
  };

  const clearLocalData = () => {
    if (!confirm("Clear recent searches, viewed products and local privacy preferences?")) return;
    localStorage.removeItem("ekart_recent_products");
    localStorage.removeItem("ekart_recent_searches");
    localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULTS);
    toast({ title: "Local data cleared" });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-6">
      <section className="rounded-[22px] border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#0757ee]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Privacy Settings</h1>
              <p className="text-sm text-muted-foreground">Control data, location, offers and account security.</p>
            </div>
          </div>
          <Badge className="w-fit bg-green-100 text-green-700 hover:bg-green-100">Protected account</Badge>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <SectionHeader icon={Eye} title="Privacy & security" desc="Choose what Chowdhary Mart can remember and use." />
        <PrivacyRow icon={LocateFixed} title="Location for delivery" desc="Use live GPS and pincode to calculate delivery ETA." checked={settings.locationForDelivery} onChange={(value) => update("locationForDelivery", value)} />
        <PrivacyRow icon={Database} title="Save search and viewed products" desc="Helps show recently viewed and faster search suggestions." checked={settings.saveSearchHistory} onChange={(value) => update("saveSearchHistory", value)} />
        <PrivacyRow icon={Smartphone} title="Share required order data with sellers" desc="Only name, phone, address and ordered items needed to deliver." checked={settings.shareWithSellers} onChange={(value) => update("shareWithSellers", value)} />
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <SectionHeader icon={BellOff} title="Marketing preferences" desc="Manage offers and notifications." />
        <PrivacyRow icon={BellOff} title="Personalized offers" desc="Use cart and category interest to show relevant deals." checked={settings.personalizedOffers} onChange={(value) => update("personalizedOffers", value)} />
        <PrivacyRow icon={LockKeyhole} title="Important order updates" desc="Keep delivery, payment and return status notifications enabled." checked={settings.orderUpdates} onChange={(value) => update("orderUpdates", value)} />
        <PrivacyRow icon={LockKeyhole} title="App lock reminder" desc="Show reminder to protect your account on shared phones." checked={settings.appLock} onChange={(value) => update("appLock", value)} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-primary/40">
          <Download className="mb-3 h-6 w-6 text-[#0757ee]" />
          <p className="font-bold">Download account data</p>
          <p className="mt-1 text-sm text-muted-foreground">Demo export for profile, orders, addresses and returns.</p>
        </button>
        <button type="button" onClick={clearLocalData} className="rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-red-200 hover:bg-red-50">
          <Trash2 className="mb-3 h-6 w-6 text-red-500" />
          <p className="font-bold text-red-600">Clear local data</p>
          <p className="mt-1 text-sm text-muted-foreground">Remove recent searches, viewed products and local settings.</p>
        </button>
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Your exact GPS is used for delivery ETA and nearby serviceability. Sellers only receive order details required to fulfill the order. Payment details are not shared with sellers.
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc }: { icon: ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 border-b bg-gray-50 p-4">
      <Icon className="h-5 w-5 text-[#0757ee]" />
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function PrivacyRow({
  icon: Icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: ElementType;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0">
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
