import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LocateFixed, MapPin, Navigation, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { IndiaStateSelect } from "@/components/IndiaLocationSelects";
import { PickupLocationPicker, type PickupLocation } from "@/components/PickupLocationPicker";
import { getCurrentIndianLocation } from "@/lib/live-location";
import { DEFAULT_LOCATION } from "@/lib/default-location";

const QUERY_KEY = ["/api/admin/service-zones"];

const DEFAULT_FORM: Record<string, any> = {
  zoneCode: "",
  zoneName: "",
  centreLatitude: String(DEFAULT_LOCATION.lat),
  centreLongitude: String(DEFAULT_LOCATION.lng),
  radiusMeters: "5000",
  defaultDeliveryTime: "40",
  minimumOrderAmount: "99",
  city: DEFAULT_LOCATION.city,
  state: DEFAULT_LOCATION.state,
  zoneType: "radius",
  boundaryGeometry: null,
};

export default function AdminZones() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(DEFAULT_FORM);
  const { data: zones = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<any[]>("/api/admin/service-zones", { responseType: "json" }),
  });
  const [zoneToDelete, setZoneToDelete] = useState<any | null>(null);
  const createZone = useMutation({
    mutationFn: () => customFetch("/api/admin/service-zones", { method: "POST", body: JSON.stringify({ ...form, boundaryGeometry: form.zoneType === "polygon" ? form.boundaryGeometry : null }), responseType: "json" }),
    onSuccess: () => {
      setForm(DEFAULT_FORM);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Location added", description: "New delivery service zone is ready." });
    },
    onError: (error: any) => toast({ title: "Location add failed", description: error?.data?.error ?? "Please check zone code and GPS.", variant: "destructive" }),
  });
  const saveZone = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => customFetch(`/api/admin/service-zones/${id}`, { method: "PATCH", body: JSON.stringify(data), responseType: "json" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Location saved" });
    },
    onError: (error: any) => toast({ title: "Location save failed", description: error?.data?.error ?? "Could not save service zone.", variant: "destructive" }),
  });
  const deleteZone = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/service-zones/${id}`, { method: "DELETE", responseType: "json" }),
    onSuccess: (data: any) => {
      const removedId = zoneToDelete?.id;
      qc.setQueryData<any[]>(QUERY_KEY, (current = []) => current.filter((zone) => zone.id !== removedId));
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setZoneToDelete(null);
      toast({ title: "Service zone deleted successfully.", description: data?.message });
    },
    onError: (error: any) => toast({ title: "Unable to delete the service zone. Please try again.", description: error?.data?.error, variant: "destructive" }),
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
          <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} placeholder={DEFAULT_LOCATION.city} />
          <IndiaStateSelect label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
          <Field label="Latitude" value={form.centreLatitude} onChange={(value) => setForm({ ...form, centreLatitude: value })} />
          <Field label="Longitude" value={form.centreLongitude} onChange={(value) => setForm({ ...form, centreLongitude: value })} />
          <Field label="Radius meters" value={form.radiusMeters} onChange={(value) => setForm({ ...form, radiusMeters: value })} />
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Zone type</span>
            <select className="h-10 rounded-md border bg-white px-3" value={form.zoneType} onChange={(event) => setForm({ ...form, zoneType: event.target.value, boundaryGeometry: event.target.value === "radius" ? null : form.boundaryGeometry })}>
              <option value="radius">Radius circle</option>
              <option value="polygon">Custom polygon</option>
            </select>
          </label>
          <Field label="Delivery min" value={form.defaultDeliveryTime} onChange={(value) => setForm({ ...form, defaultDeliveryTime: value })} />
          <Field label="Min order" value={form.minimumOrderAmount} onChange={(value) => setForm({ ...form, minimumOrderAmount: value })} />
          <Button className="h-10 self-end" onClick={() => createZone.mutate()} disabled={createZone.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Add Zone
          </Button>
        </div>
        <ZoneLocationTools
          lat={form.centreLatitude}
          lng={form.centreLongitude}
          city={form.city}
          state={form.state}
          polygonMode={form.zoneType === "polygon"}
          initialPolygon={form.boundaryGeometry?.coordinates?.[0]?.slice(0, -1)?.map((point: number[]) => ({ lat: point[1], lng: point[0] })) ?? []}
          zonePreview={{ id: 0, centreLatitude: Number(form.centreLatitude), centreLongitude: Number(form.centreLongitude), radiusMeters: Number(form.radiusMeters), boundaryGeometry: form.boundaryGeometry, insideServiceZone: true }}
          onChange={(location) => setForm({
            ...form,
            centreLatitude: location.lat,
            centreLongitude: location.lng,
            city: location.city ?? form.city,
            state: location.state ?? form.state,
            boundaryGeometry: location.boundaryGeometry ?? form.boundaryGeometry,
          })}
        />
      </section>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-36" />)}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {zones.map((zone: any) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              save={(data) => saveZone.mutate({ id: zone.id, data })}
              remove={() => setZoneToDelete(zone)}
              busy={saveZone.isPending || deleteZone.isPending}
            />
          ))}
        </div>
      )}
      {zoneToDelete && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-zone-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="delete-zone-title" className="text-lg font-bold">Delete service zone</h2>
            <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this service zone?</p>
            <p className="mt-1 text-sm font-semibold">{zoneToDelete.zoneName ?? zoneToDelete.name}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setZoneToDelete(null)} disabled={deleteZone.isPending}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => deleteZone.mutate(zoneToDelete.id)} disabled={deleteZone.isPending}>
                {deleteZone.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone, save, remove, busy }: { zone: any; save: (data: any) => void; remove: () => void; busy: boolean }) {
  const [draft, setDraft] = useState({
    zoneCode: zone.zoneCode ?? zone.code ?? "",
    zoneName: zone.zoneName ?? "",
    city: zone.city ?? "",
    state: zone.state ?? "",
    centreLatitude: String(zone.centreLatitude ?? ""),
    centreLongitude: String(zone.centreLongitude ?? ""),
    radiusMeters: String(zone.radiusMeters ?? 5000),
    defaultDeliveryTime: String(zone.defaultDeliveryTime ?? 40),
    minimumOrderAmount: String(zone.minimumOrderAmount ?? 99),
    status: zone.status ?? "active",
    acceptingOrders: zone.acceptingOrders !== false,
    deliveryEnabled: zone.deliveryEnabled !== false,
    registrationEnabled: zone.registrationEnabled !== false,
    sellerRegistrationEnabled: zone.sellerRegistrationEnabled !== false,
    riderRegistrationEnabled: zone.riderRegistrationEnabled !== false,
    zoneType: zone.boundaryGeometry ? "polygon" : "radius",
    boundaryGeometry: zone.boundaryGeometry ?? null,
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
        <Field label="Code" value={draft.zoneCode} onChange={(value) => setDraft({ ...draft, zoneCode: value })} />
        <Field label="Zone name" value={draft.zoneName} onChange={(value) => setDraft({ ...draft, zoneName: value })} />
        <Field label="City" value={draft.city} onChange={(value) => setDraft({ ...draft, city: value })} />
        <IndiaStateSelect label="State" value={draft.state} onChange={(value) => setDraft({ ...draft, state: value })} />
        <Field label="Latitude" value={draft.centreLatitude} onChange={(value) => setDraft({ ...draft, centreLatitude: value })} />
        <Field label="Longitude" value={draft.centreLongitude} onChange={(value) => setDraft({ ...draft, centreLongitude: value })} />
        <Field label="Radius meters" value={draft.radiusMeters} onChange={(value) => setDraft({ ...draft, radiusMeters: value })} />
        <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Zone type</span><select className="h-10 rounded-md border bg-white px-3" value={draft.zoneType} onChange={(event) => setDraft({ ...draft, zoneType: event.target.value, boundaryGeometry: event.target.value === "radius" ? null : draft.boundaryGeometry })}><option value="radius">Radius circle</option><option value="polygon">Custom polygon</option></select></label>
        <Field label="Delivery minutes" value={draft.defaultDeliveryTime} onChange={(value) => setDraft({ ...draft, defaultDeliveryTime: value })} />
        <Field label="Minimum order" value={draft.minimumOrderAmount} onChange={(value) => setDraft({ ...draft, minimumOrderAmount: value })} />
      </div>
      <ZoneLocationTools
        lat={draft.centreLatitude}
        lng={draft.centreLongitude}
        city={draft.city}
        state={draft.state}
        polygonMode={draft.zoneType === "polygon"}
        initialPolygon={draft.boundaryGeometry?.coordinates?.[0]?.slice(0, -1)?.map((point: number[]) => ({ lat: point[1], lng: point[0] })) ?? []}
        zonePreview={{ id: zone.id, centreLatitude: Number(draft.centreLatitude), centreLongitude: Number(draft.centreLongitude), radiusMeters: Number(draft.radiusMeters), boundaryGeometry: draft.boundaryGeometry, insideServiceZone: true }}
        onChange={(location) => setDraft({
          ...draft,
          centreLatitude: location.lat,
          centreLongitude: location.lng,
          city: location.city ?? draft.city,
          state: location.state ?? draft.state,
          boundaryGeometry: location.boundaryGeometry ?? draft.boundaryGeometry,
        })}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Toggle label="Active" checked={draft.status === "active"} onClick={() => setDraft({ ...draft, status: draft.status === "active" ? "paused" : "active" })} />
        <Toggle label="Accept orders" checked={draft.acceptingOrders} onClick={() => setDraft({ ...draft, acceptingOrders: !draft.acceptingOrders })} />
        <Toggle label="Delivery" checked={draft.deliveryEnabled} onClick={() => setDraft({ ...draft, deliveryEnabled: !draft.deliveryEnabled })} />
        <Toggle label="Registration" checked={draft.registrationEnabled} onClick={() => setDraft({ ...draft, registrationEnabled: !draft.registrationEnabled })} />
        <Toggle label="Seller signup" checked={draft.sellerRegistrationEnabled} onClick={() => setDraft({ ...draft, sellerRegistrationEnabled: !draft.sellerRegistrationEnabled })} />
        <Toggle label="Rider signup" checked={draft.riderRegistrationEnabled} onClick={() => setDraft({ ...draft, riderRegistrationEnabled: !draft.riderRegistrationEnabled })} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Button onClick={() => save({ ...draft, boundaryGeometry: draft.zoneType === "polygon" ? draft.boundaryGeometry : null })} disabled={busy}>
          <Save className="mr-2 h-4 w-4" /> Save location
        </Button>
        <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={remove} disabled={busy}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

function ZoneLocationTools({ lat, lng, city, state, polygonMode = false, initialPolygon = [], zonePreview, onChange }: {
  lat: string;
  lng: string;
  city?: string;
  state?: string;
  polygonMode?: boolean;
  initialPolygon?: Array<{ lat: number; lng: number }>;
  zonePreview?: { id: number; centreLatitude: number; centreLongitude: number; radiusMeters: number; boundaryGeometry?: any; insideServiceZone?: boolean };
  onChange: (location: { lat: string; lng: string; city?: string; state?: string; boundaryGeometry?: any }) => void;
}) {
  const { toast } = useToast();
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  const hasCoords = Number.isFinite(numericLat) && Number.isFinite(numericLng);
  const initial: PickupLocation | null = hasCoords
    ? {
        lat: numericLat,
        lng: numericLng,
        address: `${numericLat.toFixed(6)}, ${numericLng.toFixed(6)}`,
        distanceKm: null,
        available: true,
        city,
        state,
      }
    : null;

  const useGps = async () => {
    setLocating(true);
    try {
      const gps = await getCurrentIndianLocation();
      onChange({
        lat: gps.lat.toFixed(6),
        lng: gps.lng.toFixed(6),
        city: gps.city || city,
        state: gps.state || state,
      });
      toast({ title: "Current location selected", description: "City, state, latitude and longitude were filled automatically." });
    } catch (error) {
      toast({
        title: "GPS failed",
        description: error instanceof Error ? error.message : "Please allow browser location permission.",
        variant: "destructive",
      });
    } finally {
      setLocating(false);
    }
  };

  const applyMapLocation = (location: PickupLocation) => {
    onChange({
      lat: location.lat.toFixed(6),
      lng: location.lng.toFixed(6),
      city: location.city || city,
      state: location.state || state,
      boundaryGeometry: location.boundaryGeometry,
    });
    setMapOpen(false);
    toast({ title: "Map location selected", description: "Zone centre GPS updated." });
  };

  return (
    <div className="mt-3 rounded-xl border bg-gray-50/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">Zone centre GPS</p>
          <p className="text-xs text-muted-foreground">Use current GPS to auto-fill the location, or select a different point on the map.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={useGps} disabled={locating}>
            <LocateFixed className="mr-2 h-4 w-4" /> {locating ? "Detecting..." : "Use GPS"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMapOpen((value) => !value)}>
            <MapPin className="mr-2 h-4 w-4" /> {mapOpen ? "Hide map" : "Select from map"}
          </Button>
          {hasCoords && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${numericLat},${numericLng}`} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline" size="sm">
                <Navigation className="mr-2 h-4 w-4" /> Open map
              </Button>
            </a>
          )}
        </div>
      </div>
      {mapOpen && (
        <div className="mt-3 overflow-hidden rounded-xl border bg-white">
          <PickupLocationPicker
            mode="inline"
            initial={initial}
            title="Select zone centre"
            subtitle="Tap or drag the map to set the centre point, or use current GPS."
            confirmLabel="Use this zone centre"
            locateFirst={!initial}
            compact
            polygonMode={polygonMode}
            initialPolygon={initialPolygon}
            serviceZones={zonePreview ? [zonePreview] : undefined}
            onClose={() => setMapOpen(false)}
            onConfirm={applyMapLocation}
          />
        </div>
      )}
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
