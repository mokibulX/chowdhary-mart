import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Save, ShieldCheck } from "lucide-react";

const QUERY_KEY = ["/api/admin/service-zones"];

const DEFAULT_FORM = {
  zoneCode: "",
  zoneName: "",
  centreLatitude: "22.6076",
  centreLongitude: "88.4695",
  radiusMeters: "5000",
  defaultDeliveryTime: "40",
  minimumOrderAmount: "99",
};

export default function AdminZones() {
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const { data: zones = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<any[]>("/api/admin/service-zones", { responseType: "json" }),
  });
  const createZone = useMutation({
    mutationFn: () => customFetch("/api/admin/service-zones", { method: "POST", body: JSON.stringify(form), responseType: "json" }),
    onSuccess: () => {
      setForm(DEFAULT_FORM);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const saveZone = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => customFetch(`/api/admin/service-zones/${id}`, { method: "PATCH", body: JSON.stringify(data), responseType: "json" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Service Zones</h1>
        <p className="text-sm text-muted-foreground">5 km marketplace coverage, delivery ETA and zone-level operational controls.</p>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="font-bold">Create zone</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Code" value={form.zoneCode} onChange={(value) => setForm({ ...form, zoneCode: value })} placeholder="KOL-AREA-5K" />
          <Field label="Name" value={form.zoneName} onChange={(value) => setForm({ ...form, zoneName: value })} placeholder="Zone name" />
          <Field label="Latitude" value={form.centreLatitude} onChange={(value) => setForm({ ...form, centreLatitude: value })} />
          <Field label="Longitude" value={form.centreLongitude} onChange={(value) => setForm({ ...form, centreLongitude: value })} />
          <Field label="Radius meters" value={form.radiusMeters} onChange={(value) => setForm({ ...form, radiusMeters: value })} />
          <Field label="Delivery min" value={form.defaultDeliveryTime} onChange={(value) => setForm({ ...form, defaultDeliveryTime: value })} />
          <Field label="Min order" value={form.minimumOrderAmount} onChange={(value) => setForm({ ...form, minimumOrderAmount: value })} />
          <Button className="h-10 self-end" onClick={() => createZone.mutate()} disabled={createZone.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Add Zone
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-36" />)}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {zones.map((zone: any) => (
            <ZoneCard key={zone.id} zone={zone} save={(data) => saveZone.mutate({ id: zone.id, data })} busy={saveZone.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone, save, busy }: { zone: any; save: (data: any) => void; busy: boolean }) {
  const [draft, setDraft] = useState({
    zoneName: zone.zoneName ?? "",
    radiusMeters: String(zone.radiusMeters ?? 5000),
    defaultDeliveryTime: String(zone.defaultDeliveryTime ?? 40),
    minimumOrderAmount: String(zone.minimumOrderAmount ?? 99),
    status: zone.status ?? "active",
    acceptingOrders: zone.acceptingOrders !== false,
    deliveryEnabled: zone.deliveryEnabled !== false,
  });
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{zone.zoneCode}</h3>
            <Badge className={draft.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>{draft.status}</Badge>
            {draft.acceptingOrders && <Badge variant="outline" className="border-blue-200 text-blue-700">Accepting orders</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <MapPin className="mr-1 inline h-3 w-3" />
            {Number(zone.centreLatitude).toFixed(4)}, {Number(zone.centreLongitude).toFixed(4)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="Shops" value={zone.shops ?? 0} />
          <MiniStat label="Products" value={zone.products ?? 0} />
          <MiniStat label="Orders" value={zone.orders ?? 0} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Zone name" value={draft.zoneName} onChange={(value) => setDraft({ ...draft, zoneName: value })} />
        <Field label="Radius meters" value={draft.radiusMeters} onChange={(value) => setDraft({ ...draft, radiusMeters: value })} />
        <Field label="Delivery minutes" value={draft.defaultDeliveryTime} onChange={(value) => setDraft({ ...draft, defaultDeliveryTime: value })} />
        <Field label="Minimum order" value={draft.minimumOrderAmount} onChange={(value) => setDraft({ ...draft, minimumOrderAmount: value })} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Toggle label="Active" checked={draft.status === "active"} onClick={() => setDraft({ ...draft, status: draft.status === "active" ? "paused" : "active" })} />
        <Toggle label="Accept orders" checked={draft.acceptingOrders} onClick={() => setDraft({ ...draft, acceptingOrders: !draft.acceptingOrders })} />
        <Toggle label="Delivery" checked={draft.deliveryEnabled} onClick={() => setDraft({ ...draft, deliveryEnabled: !draft.deliveryEnabled })} />
      </div>
      <Button className="mt-4 w-full" onClick={() => save(draft)} disabled={busy}>
        <Save className="mr-2 h-4 w-4" /> Save zone controls
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Toggle({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${checked ? "border-green-200 bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"}`}>
      <ShieldCheck className="h-4 w-4" /> {label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-gray-50 px-2 py-1"><b>{value}</b><br /><span className="text-muted-foreground">{label}</span></div>;
}
