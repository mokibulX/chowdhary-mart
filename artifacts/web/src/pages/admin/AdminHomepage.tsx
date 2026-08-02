import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, GripVertical, LayoutGrid, Megaphone, Pin, Plus, Search, Trash2 } from "lucide-react";
import { DateTextInput } from "@/components/DateTextInput";

const EMPTY_SECTION = {
  title: "",
  slug: "",
  subtitle: "",
  sectionType: "MANUAL",
  layoutType: "horizontal_product_scroll",
  icon: "",
  bannerImageUrl: "",
  productLimit: 8,
  zoneId: "",
  sortOrder: 1,
  startAt: "",
  endAt: "",
  isActive: true,
  personalizedEnabled: false,
};

const SECTION_TYPES = ["MANUAL", "RULE_BASED", "PERSONALIZED", "CATEGORY_BASED", "BEST_SELLING", "DISCOUNT_BASED", "NEW_ARRIVAL"];
const LAYOUTS = ["horizontal_product_scroll", "product_grid", "hero_product", "compact_deal_row"];

export default function AdminHomepage() {
  const qc = useQueryClient();
  const [sectionDialog, setSectionDialog] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_SECTION);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [previewDevice, setPreviewDevice] = useState("mobile");

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["/api/admin/homepage/sections"],
    queryFn: () => customFetch<any[]>("/api/admin/homepage/sections"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["/api/admin/homepage/products/search", search],
    queryFn: () => customFetch<any[]>(`/api/admin/homepage/products/search?q=${encodeURIComponent(search)}`),
  });
  const { data: preview } = useQuery({
    queryKey: ["/api/admin/homepage/preview", previewDevice],
    queryFn: () => customFetch<any>(`/api/admin/homepage/preview?viewport=${previewDevice}`),
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["/api/admin/homepage/audit"],
    queryFn: () => customFetch<any[]>("/api/admin/homepage/audit"),
  });

  const selectedSection = useMemo(() => sections.find((item: any) => Number(item.id) === Number(selectedSectionId)) ?? sections[0], [sections, selectedSectionId]);
  const previewSection = preview?.sections?.find((item: any) => Number(item.databaseId ?? item.id) === Number(selectedSection?.id)) ?? preview?.sections?.[0];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/homepage/sections"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/homepage/preview"] });
    qc.invalidateQueries({ queryKey: ["/api/homepage"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/homepage/audit"] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_SECTION, sortOrder: sections.length + 1 });
    setSectionDialog(true);
  };

  const openEdit = (section: any) => {
    setEditing(section);
    setForm({
      ...EMPTY_SECTION,
      ...section,
      zoneId: section.zoneId ? String(section.zoneId) : "",
      startAt: section.startAt ? String(section.startAt).slice(0, 16) : "",
      endAt: section.endAt ? String(section.endAt).slice(0, 16) : "",
    });
    setSectionDialog(true);
  };

  const submitSection = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      productLimit: Number(form.productLimit ?? 8),
      sortOrder: Number(form.sortOrder ?? 0),
      zoneId: form.zoneId ? Number(form.zoneId) : "",
      isActive: !!form.isActive,
      personalizedEnabled: !!form.personalizedEnabled,
    };
    await customFetch(editing ? `/api/admin/homepage/sections/${editing.id}` : "/api/admin/homepage/sections", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(payload),
      responseType: "json",
    });
    setSectionDialog(false);
    invalidate();
  };

  const deleteSection = async (section: any) => {
    if (!confirm(`Delete ${section.title}?`)) return;
    await customFetch(`/api/admin/homepage/sections/${section.id}`, { method: "DELETE", responseType: "json" });
    invalidate();
  };

  const addProduct = async (product: any) => {
    if (!selectedSection) return;
    await customFetch(`/api/admin/homepage/sections/${selectedSection.id}/products`, {
      method: "POST",
      body: JSON.stringify({ productId: product.id, priority: (previewSection?.products?.length ?? 0) + 1 }),
      responseType: "json",
    });
    invalidate();
  };

  const removeProduct = async (product: any) => {
    if (!selectedSection) return;
    await customFetch(`/api/admin/homepage/sections/${selectedSection.id}/products/${product.id}`, { method: "DELETE", responseType: "json" });
    invalidate();
  };

  const moveProduct = async (product: any, direction: -1 | 1) => {
    if (!selectedSection || !previewSection?.products?.length) return;
    const next = [...previewSection.products];
    const index = next.findIndex((item: any) => Number(item.id) === Number(product.id));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await customFetch(`/api/admin/homepage/sections/${selectedSection.id}/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ items: next.map((item: any, priority: number) => ({ productId: item.id, priority })) }),
      responseType: "json",
    });
    invalidate();
  };

  const publish = async () => {
    if (!selectedSection) return;
    await customFetch(`/api/admin/homepage/sections/${selectedSection.id}/publish`, { method: "POST", responseType: "json" });
    invalidate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Homepage Management</h1>
          <p className="text-sm text-muted-foreground">Admin-only curated sections, product curation, scheduling, preview and audit.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create section</Button>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        {["Section Management", "Product Curation", "Zone-wise Homepage", "Analytics"].map((label, index) => (
          <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <LayoutGrid className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{index === 0 ? sections.length : index === 1 ? previewSection?.products?.length ?? 0 : index === 2 ? "5km" : audit.length}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.25fr_0.85fr]">
        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-bold">Sections</h2>
            <Badge variant="outline">{sections.length}</Badge>
          </div>
          <div className="max-h-[680px] min-w-0 space-y-2 overflow-y-auto p-3">
            {isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading sections...</p> : sections.map((section: any) => (
              <button key={section.id} type="button" onClick={() => setSelectedSectionId(section.id)} className={`w-full min-w-0 overflow-hidden rounded-lg border p-3 text-left transition-colors ${Number(selectedSection?.id) === Number(section.id) ? "border-primary bg-primary/5" : "bg-white hover:bg-gray-50"}`}>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words font-semibold">{section.title || "Untitled section"}</p>
                    <p className="mt-1 line-clamp-2 break-all text-xs text-muted-foreground">{section.sectionType} - {section.layoutType}</p>
                  </div>
                  <Badge className="w-fit shrink-0 self-start" variant={section.isActive ? "default" : "secondary"}>{section.isActive ? "Live" : "Off"}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEdit(section); }}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={(event) => { event.stopPropagation(); deleteSection(section); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div>
              <h2 className="font-bold">{selectedSection?.title ?? "Select a section"}</h2>
              <p className="text-xs text-muted-foreground">Drag/reorder simulation with move buttons. Seller cannot modify these lists.</p>
            </div>
            <Button size="sm" onClick={publish}><Megaphone className="mr-2 h-4 w-4" />Publish</Button>
          </div>
          <div className="space-y-3 p-4">
            {previewSection?.products?.length ? previewSection.products.map((product: any, index: number) => (
              <div key={product.id} draggable className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
                <div className="h-16 w-16 overflow-hidden rounded-lg bg-gray-50">
                  {product.images?.[0] && <img src={product.images[0]} alt={product.name} className="h-full w-full object-contain p-1" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.store?.name ?? "Store"} · Rs.{Number(product.price).toFixed(0)}</p>
                </div>
                <Button size="sm" variant="outline" disabled={index === 0} onClick={() => moveProduct(product, -1)}>Up</Button>
                <Button size="sm" variant="outline" disabled={index === previewSection.products.length - 1} onClick={() => moveProduct(product, 1)}>Down</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeProduct(product)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No curated products yet. Search approved products and add them.</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <h2 className="font-bold">Product search</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Name, SKU, brand, seller" />
            </div>
          </div>
          <div className="max-h-[500px] space-y-2 overflow-y-auto p-3">
            {products.map((product: any) => (
              <div key={product.id} className="rounded-lg border p-3">
                <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.store?.name ?? "Store"} · Stock {product.stock ?? product.stockQty ?? 0}</p>
                <Button className="mt-2 w-full" size="sm" variant="outline" onClick={() => addProduct(product)}><Pin className="mr-2 h-3.5 w-3.5" />Add to section</Button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold">Admin Preview</h2>
          <Select value={previewDevice} onValueChange={setPreviewDevice}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border bg-gray-50 p-3">
          <div className={`${previewDevice === "mobile" ? "mx-auto max-w-sm" : previewDevice === "tablet" ? "mx-auto max-w-2xl" : "w-full"} rounded-xl bg-white p-3 shadow-sm`}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-primary" />{previewSection?.title ?? "Preview"}</div>
            <div className="grid grid-cols-2 gap-2">
              {(previewSection?.products ?? []).slice(0, 4).map((product: any) => (
                <div key={product.id} className="rounded-lg border p-2">
                  <div className="aspect-square bg-gray-50">{product.images?.[0] && <img src={product.images[0]} className="h-full w-full object-contain p-2" alt={product.name} />}</div>
                  <p className="mt-2 line-clamp-1 text-xs font-semibold">{product.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Audit logs</h2>
        <div className="space-y-2">
          {audit.slice(0, 8).map((item: any) => (
            <div key={item.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{item.action}</p>
              <p className="text-xs text-muted-foreground">{item.timestamp}</p>
            </div>
          ))}
          {!audit.length && <p className="text-sm text-muted-foreground">No homepage admin actions yet.</p>}
        </div>
      </section>

      <Dialog open={sectionDialog} onOpenChange={setSectionDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Create"} homepage section</DialogTitle></DialogHeader>
          <form onSubmit={submitSection} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Section title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
              <Field label="Internal section name" value={form.slug} onChange={(value) => setForm({ ...form, slug: value })} />
            </div>
            <Field label="Subtitle" value={form.subtitle} onChange={(value) => setForm({ ...form, subtitle: value })} textarea />
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Section type" value={form.sectionType} onChange={(value) => setForm({ ...form, sectionType: value })} items={SECTION_TYPES} />
              <SelectField label="Display layout" value={form.layoutType} onChange={(value) => setForm({ ...form, layoutType: value })} items={LAYOUTS} />
              <Field label="Product limit" type="number" value={String(form.productLimit)} onChange={(value) => setForm({ ...form, productLimit: value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Icon" value={form.icon} onChange={(value) => setForm({ ...form, icon: value })} />
              <Field label="Zone" value={String(form.zoneId)} onChange={(value) => setForm({ ...form, zoneId: value })} />
              <Field label="Sort order" type="number" value={String(form.sortOrder)} onChange={(value) => setForm({ ...form, sortOrder: value })} />
            </div>
            <Field label="Banner image" value={form.bannerImageUrl} onChange={(value) => setForm({ ...form, bannerImageUrl: value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date" type="datetime-local" value={form.startAt} onChange={(value) => setForm({ ...form, startAt: value })} />
              <Field label="End date" type="datetime-local" value={form.endAt} onChange={(value) => setForm({ ...form, endAt: value })} />
            </div>
            <SwitchRow label="Active" checked={!!form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
            <SwitchRow label="Personalized recommendation enabled" checked={!!form.personalizedEnabled} onChange={(value) => setForm({ ...form, personalizedEnabled: value })} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSectionDialog(false)}>Cancel</Button>
              <Button type="submit">Save section</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, textarea, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; type?: string; required?: boolean }) {
  const isDateLike = type === "date" || type === "datetime-local";
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {textarea ? (
        <Textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      ) : isDateLike ? (
        <DateTextInput mode={type === "datetime-local" ? "datetime-local" : "date"} value={value ?? ""} onChange={onChange} required={required} />
      ) : (
        <Input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: string[] }) {
  return <div className="space-y-1"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>;
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border p-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
