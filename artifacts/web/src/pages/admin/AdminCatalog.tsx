import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgePercent, Grid3X3, Image, Package, Pencil, Plus, Trash2 } from "lucide-react";

type Mode = "products" | "banners" | "categories";

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  categoryId: 2,
  storeId: 2,
  price: "99",
  mrp: "120",
  stock: "20",
  weight: "1",
  unit: "pc",
  imageUrl: "",
  isAvailable: true,
  isFeatured: false,
};

const EMPTY_BANNER = {
  title: "",
  subtitle: "",
  imageUrl: "",
  href: "/search",
  sortOrder: "1",
  isActive: true,
};

const EMPTY_CATEGORY = {
  name: "",
  iconEmoji: "C",
  imageUrl: "",
  colorClass: "bg-blue-50",
  sortOrder: "1",
  isActive: true,
};

export default function AdminCatalog() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("products");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PRODUCT);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/admin/products"],
    queryFn: () => customFetch<any[]>("/api/admin/products"),
  });
  const { data: banners = [], isLoading: loadingBanners } = useQuery({
    queryKey: ["/api/admin/banners"],
    queryFn: () => customFetch<any[]>("/api/admin/banners"),
  });
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["/api/admin/categories"],
    queryFn: () => customFetch<any[]>("/api/admin/categories"),
  });
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/admin/stores"],
    queryFn: () => customFetch<any[]>("/api/admin/stores"),
  });

  const activeData = mode === "products" ? products : mode === "banners" ? banners : categories;
  const isLoading = mode === "products" ? loadingProducts : mode === "banners" ? loadingBanners : loadingCategories;
  const title = mode === "products" ? "Products" : mode === "banners" ? "Banners" : "Categories";

  const stats = useMemo(() => [
    { label: "Products", value: products.length, icon: Package, mode: "products" as Mode },
    { label: "Banners", value: banners.length, icon: Image, mode: "banners" as Mode },
    { label: "Categories", value: categories.length, icon: Grid3X3, mode: "categories" as Mode },
  ], [banners.length, categories.length, products.length]);

  const openCreate = (nextMode = mode) => {
    setMode(nextMode);
    setEditing(null);
    setForm(nextMode === "products" ? EMPTY_PRODUCT : nextMode === "banners" ? EMPTY_BANNER : EMPTY_CATEGORY);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    if (mode === "products") {
      setForm({
        ...EMPTY_PRODUCT,
        ...item,
        price: String(item.price ?? ""),
        mrp: String(item.mrp ?? ""),
        stock: String(item.stock ?? item.stockQty ?? 0),
        imageUrl: item.images?.[0] ?? "",
      });
    } else if (mode === "banners") {
      setForm({ ...EMPTY_BANNER, ...item, sortOrder: String(item.sortOrder ?? 1) });
    } else {
      setForm({ ...EMPTY_CATEGORY, ...item, sortOrder: String(item.sortOrder ?? 1) });
    }
    setDialogOpen(true);
  };

  const endpoint = `/api/admin/${mode}`;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [endpoint] });
    qc.invalidateQueries({ queryKey: ["/api/categories"] });
    qc.invalidateQueries({ queryKey: ["/api/banners"] });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildPayload(mode, form);
    const url = editing ? `${endpoint}/${editing.id}` : endpoint;
    await customFetch(url, {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(payload),
      responseType: "json",
    });
    invalidate();
    setDialogOpen(false);
  };

  const remove = async (item: any) => {
    if (!confirm(`Delete ${item.name ?? item.title}?`)) return;
    await customFetch(`${endpoint}/${item.id}`, { method: "DELETE", responseType: "json" });
    invalidate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catalog Management</h1>
          <p className="text-sm text-muted-foreground">Create, update and delete products, homepage banners and categories.</p>
        </div>
        <Button onClick={() => openCreate()} data-testid="btn-create-catalog">
          <Plus className="mr-2 h-4 w-4" />Add {title.slice(0, -1)}
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, mode: statMode }) => (
          <button key={label} type="button" onClick={() => setMode(statMode)} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-colors ${mode === statMode ? "border-primary ring-1 ring-primary/20" : "hover:border-primary/40"}`}>
            <Icon className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </button>
        ))}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <Badge variant="outline">{activeData.length} items</Badge>
        </div>
        {isLoading ? (
          <div className="grid gap-3 p-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
        ) : !activeData.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No {title.toLowerCase()} yet.</div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {activeData.map((item: any) => (
              <CatalogCard key={item.id} mode={mode} item={item} onEdit={() => openEdit(item)} onDelete={() => remove(item)} />
            ))}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {title.slice(0, -1)}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {mode === "products" && <ProductForm form={form} setForm={setForm} categories={categories} stores={stores} />}
            {mode === "banners" && <BannerForm form={form} setForm={setForm} />}
            {mode === "categories" && <CategoryForm form={form} setForm={setForm} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogCard({ mode, item, onEdit, onDelete }: { mode: Mode; item: any; onEdit: () => void; onDelete: () => void }) {
  const imageUrl = mode === "products" ? item.images?.[0] : item.imageUrl;
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="aspect-[1.8/1] bg-gray-50">
        {imageUrl ? <img src={imageUrl} alt={item.name ?? item.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 font-bold">{item.name ?? item.title}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{item.description ?? item.subtitle ?? item.href ?? "Catalog item"}</p>
          </div>
          <Badge variant={item.isActive === false || item.isAvailable === false ? "secondary" : "default"}>
            {item.isActive === false || item.isAvailable === false ? "Hidden" : "Live"}
          </Badge>
        </div>
        {mode === "products" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">Rs.{Number(item.price).toFixed(0)}</span>
            {item.mrp && <span className="text-muted-foreground line-through">Rs.{Number(item.mrp).toFixed(0)}</span>}
            {item.isFeatured && <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100"><BadgePercent className="mr-1 h-3 w-3" />Offer</Badge>}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function ProductForm({ form, setForm, categories, stores }: any) {
  return (
    <>
      <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
      <Field label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} textarea />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Category" value={String(form.categoryId)} onChange={(value) => setForm({ ...form, categoryId: Number(value) })} items={categories.map((item: any) => ({ value: String(item.id), label: item.name }))} />
        <SelectField label="Store" value={String(form.storeId)} onChange={(value) => setForm({ ...form, storeId: Number(value) })} items={stores.map((item: any) => ({ value: String(item.id), label: item.name }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Price" value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" required />
        <Field label="MRP" value={form.mrp} onChange={(value) => setForm({ ...form, mrp: value })} type="number" required />
        <Field label="Stock" value={form.stock} onChange={(value) => setForm({ ...form, stock: value })} type="number" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Weight" value={form.weight} onChange={(value) => setForm({ ...form, weight: value })} />
        <Field label="Unit" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
      </div>
      <Field label="Image URL" value={form.imageUrl} onChange={(value) => setForm({ ...form, imageUrl: value })} />
      <SwitchRow label="Available" checked={!!form.isAvailable} onChange={(value) => setForm({ ...form, isAvailable: value })} />
      <SwitchRow label="Offer / Featured product" checked={!!form.isFeatured} onChange={(value) => setForm({ ...form, isFeatured: value })} />
    </>
  );
}

function BannerForm({ form, setForm }: any) {
  return (
    <>
      <Field label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
      <Field label="Subtitle" value={form.subtitle} onChange={(value) => setForm({ ...form, subtitle: value })} />
      <Field label="Image URL" value={form.imageUrl} onChange={(value) => setForm({ ...form, imageUrl: value })} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link" value={form.href} onChange={(value) => setForm({ ...form, href: value })} />
        <Field label="Sort order" value={form.sortOrder} onChange={(value) => setForm({ ...form, sortOrder: value })} type="number" />
      </div>
      <SwitchRow label="Active banner" checked={!!form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
    </>
  );
}

function CategoryForm({ form, setForm }: any) {
  return (
    <>
      <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Icon text" value={form.iconEmoji} onChange={(value) => setForm({ ...form, iconEmoji: value })} />
        <Field label="Sort order" value={form.sortOrder} onChange={(value) => setForm({ ...form, sortOrder: value })} type="number" />
      </div>
      <Field label="Image URL" value={form.imageUrl} onChange={(value) => setForm({ ...form, imageUrl: value })} />
      <SwitchRow label="Active category" checked={!!form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
    </>
  );
}

function Field({ label, value, onChange, textarea, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}{required ? " *" : ""}</Label>
      {textarea ? <Textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} /> : <Input value={value ?? ""} onChange={(event) => onChange(event.target.value)} type={type} required={required} />}
    </div>
  );
}

function SelectField({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function buildPayload(mode: Mode, form: any) {
  if (mode === "products") {
    return {
      name: form.name,
      description: form.description,
      categoryId: Number(form.categoryId),
      storeId: Number(form.storeId),
      price: String(form.price),
      mrp: String(form.mrp),
      stock: Number(form.stock ?? 0),
      weight: form.weight,
      unit: form.unit,
      images: form.imageUrl ? [form.imageUrl] : [],
      isAvailable: !!form.isAvailable,
      isFeatured: !!form.isFeatured,
    };
  }
  if (mode === "banners") {
    return { ...form, sortOrder: Number(form.sortOrder ?? 0), isActive: !!form.isActive };
  }
  return { ...form, sortOrder: Number(form.sortOrder ?? 0), isActive: !!form.isActive };
}
