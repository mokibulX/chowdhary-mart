import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { uploadImageFile } from "@/lib/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgePercent, Grid3X3, Image, Images, Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/error-message";

type Mode = "products" | "banners" | "categories" | "media-library";

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

const EMPTY_MEDIA = {
  title: "",
  description: "",
  imageUrl: "",
  storagePath: "",
  storageProvider: "",
  mimeType: "",
  sizeBytes: "",
  categoryId: "",
  tags: "",
  sourceType: "admin_upload",
  isApproved: true,
};

export default function AdminCatalog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("products");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PRODUCT);
  const [mediaPage, setMediaPage] = useState(0);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaCategoryId, setMediaCategoryId] = useState("all");
  const mediaLimit = 60;

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
  const mediaUrl = `/api/admin/media-library?limit=${mediaLimit}&offset=${mediaPage * mediaLimit}${mediaSearch.trim() ? `&q=${encodeURIComponent(mediaSearch.trim())}` : ""}${mediaCategoryId !== "all" ? `&categoryId=${mediaCategoryId}` : ""}`;
  const { data: mediaResponse, isLoading: loadingMedia } = useQuery({
    queryKey: ["/api/admin/media-library", mediaPage, mediaSearch.trim(), mediaCategoryId],
    queryFn: () => customFetch<{ items: any[]; total: number; hasMore: boolean }>(mediaUrl),
  });
  const mediaItems = mediaResponse?.items ?? [];
  const mediaTotal = mediaResponse?.total ?? mediaItems.length;
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/admin/stores"],
    queryFn: () => customFetch<any[]>("/api/admin/stores"),
  });

  const activeData = mode === "products" ? products : mode === "banners" ? banners : mode === "categories" ? categories : mediaItems;
  const isLoading = mode === "products" ? loadingProducts : mode === "banners" ? loadingBanners : mode === "categories" ? loadingCategories : loadingMedia;
  const title = mode === "products" ? "Products" : mode === "banners" ? "Banners" : mode === "categories" ? "Categories" : "Image Library";
  const singularTitle = mode === "media-library" ? "Image" : title.slice(0, -1);

  const stats = useMemo(() => [
    { label: "Products", value: products.length, icon: Package, mode: "products" as Mode },
    { label: "Banners", value: banners.length, icon: Image, mode: "banners" as Mode },
    { label: "Categories", value: categories.length, icon: Grid3X3, mode: "categories" as Mode },
    { label: "Image Library", value: mediaTotal, icon: Images, mode: "media-library" as Mode },
  ], [banners.length, categories.length, mediaTotal, products.length]);

  const openCreate = (nextMode = mode) => {
    setMode(nextMode);
    setEditing(null);
    setForm(nextMode === "products" ? EMPTY_PRODUCT : nextMode === "banners" ? EMPTY_BANNER : nextMode === "categories" ? EMPTY_CATEGORY : EMPTY_MEDIA);
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
    } else if (mode === "categories") {
      setForm({ ...EMPTY_CATEGORY, ...item, sortOrder: String(item.sortOrder ?? 1) });
    } else {
      setForm({ ...EMPTY_MEDIA, ...item, categoryId: item.categoryId ? String(item.categoryId) : "", tags: Array.isArray(item.tags) ? item.tags.join(", ") : String(item.tags ?? "") });
    }
    setDialogOpen(true);
  };

  const endpoint = `/api/admin/${mode}`;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [endpoint], exact: false });
    qc.invalidateQueries({ queryKey: ["/api/categories"], exact: false });
    qc.invalidateQueries({ queryKey: ["/api/banners"], exact: false });
    qc.invalidateQueries({ queryKey: ["/api/admin/media-library"], exact: false });
  };

  const addProductToLibrary = async (item: any) => {
    const imageUrl = item.images?.[0] ?? item.imageUrl;
    if (!imageUrl) {
      toast({ title: "No product image", description: "Ei product-e kono image nei. Age product image add korun.", variant: "destructive" });
      return;
    }
    try {
      await customFetch("/api/admin/media-library", {
        method: "POST",
        body: JSON.stringify({
          title: item.name,
          description: item.description || `Reusable product image from ${item.store?.name ?? "seller product"}`,
          imageUrl,
          categoryId: item.categoryId ?? null,
          tags: [item.name, item.category?.name, item.store?.name].filter(Boolean),
          sourceType: "product_import",
          isApproved: true,
        }),
        responseType: "json",
      });
      invalidate();
      toast({ title: "Added to image library", description: "Seller-ra category wise ei image product-e use korte parbe." });
    } catch (error) {
      toast({ title: "Library add failed", description: getFriendlyErrorMessage(error, "Could not add this product image to library."), variant: "destructive" });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateCatalogForm(mode, form);
    if (validationError) {
      toast({ title: `Complete ${singularTitle.toLowerCase()} details`, description: validationError, variant: "destructive" });
      return;
    }
    try {
      const payload = buildPayload(mode, form);
      const url = editing ? `${endpoint}/${editing.id}` : endpoint;
      const saved = await customFetch<any>(url, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
        responseType: "json",
      });
      if (mode === "categories") {
        const mergeCategory = (oldData: any) => upsertCatalogItemInCache(oldData, saved);
        qc.setQueriesData({ queryKey: ["/api/admin/categories"], exact: false }, mergeCategory);
        qc.setQueriesData({ queryKey: ["/api/categories"], exact: false }, mergeCategory);
      }
      invalidate();
      setDialogOpen(false);
      toast({ title: editing ? `${singularTitle} updated` : `${singularTitle} created` });
    } catch (error) {
      toast({ title: `${singularTitle} save failed`, description: getFriendlyErrorMessage(error, "Please check the details and try again."), variant: "destructive" });
    }
  };

  const remove = async (item: any) => {
    if (!confirm(`Delete ${item.name ?? item.title}?`)) return;
    try {
      await customFetch(`${endpoint}/${item.id}`, { method: "DELETE", responseType: "json" });
      qc.setQueriesData({ queryKey: [endpoint], exact: false }, (oldData: any) => removeCatalogItemFromCache(oldData, item.id));
      if (mode === "categories") {
        qc.setQueriesData({ queryKey: ["/api/categories"], exact: false }, (oldData: any) => removeCatalogItemFromCache(oldData, item.id));
      }
      if (mode === "products") {
        qc.invalidateQueries({ queryKey: ["infinite-products"], exact: false });
        qc.invalidateQueries({ queryKey: ["/api/products"], exact: false });
        qc.invalidateQueries({ queryKey: ["/api/homepage"], exact: false });
      }
      invalidate();
      toast({ title: `${singularTitle} deleted` });
    } catch (error) {
      toast({ title: `${singularTitle} delete failed`, description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };

  const clearProductsAndSellers = async () => {
    if (!confirm("Remove all products, stores and seller accounts? You can add fresh products after this.")) return;
    try {
      await customFetch("/api/admin/catalog/clear-products-sellers", { method: "POST", responseType: "json" });
      qc.setQueriesData({ queryKey: ["/api/admin/products"], exact: false }, []);
      qc.setQueriesData({ queryKey: ["/api/admin/stores"], exact: false }, []);
      qc.invalidateQueries({ queryKey: ["/api/admin/products"], exact: false });
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"], exact: false });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"], exact: false });
      qc.invalidateQueries({ queryKey: ["/api/products"], exact: false });
      qc.invalidateQueries({ queryKey: ["infinite-products"], exact: false });
      toast({ title: "Products and sellers cleared", description: "Ekhon fresh product add korte parben." });
    } catch (error) {
      toast({ title: "Clear failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };

  const persistUploadedCategoryImage = async (nextForm: any) => {
    if (mode !== "categories" || !editing?.id) return;
    const saved = await customFetch<any>(`${endpoint}/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify(buildPayload("categories", nextForm)),
      responseType: "json",
    });
    const mergeCategory = (oldData: any) => upsertCatalogItemInCache(oldData, saved);
    qc.setQueriesData({ queryKey: ["/api/admin/categories"], exact: false }, mergeCategory);
    qc.setQueriesData({ queryKey: ["/api/categories"], exact: false }, mergeCategory);
    invalidate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catalog & Product Image Library</h1>
          <p className="text-sm text-muted-foreground">Manage products, banners, categories and reusable product images for sellers.</p>
        </div>
        <Button onClick={() => openCreate()} data-testid="btn-create-catalog">
          <Plus className="mr-2 h-4 w-4" />Add {singularTitle}
        </Button>
        {mode === "products" && (
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={clearProductsAndSellers}>
            <Trash2 className="mr-2 h-4 w-4" />Clear products & sellers
          </Button>
        )}
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
          <Badge variant="outline">{mode === "media-library" ? `${mediaTotal} total` : `${activeData.length} items`}</Badge>
        </div>
        {mode === "media-library" && (
          <div className="border-b bg-orange-50/60 p-4">
            <div className="flex flex-col gap-3 rounded-xl border border-orange-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold">Product Image Library for Sellers</h3>
                <p className="text-sm text-muted-foreground">Admin ekhane image, name, category, tags upload korbe. Seller product add korar somoy same category-r approved image use korte parbe.</p>
              </div>
              <Button type="button" onClick={() => openCreate("media-library")}>
                <Plus className="mr-2 h-4 w-4" /> Add Library Image
              </Button>
            </div>
          </div>
        )}
        {mode === "media-library" && (
          <div className="grid gap-3 border-b bg-gray-50/60 p-4 md:grid-cols-[1fr_220px_auto]">
            <Input
              value={mediaSearch}
              onChange={(event) => { setMediaPage(0); setMediaSearch(event.target.value); }}
              placeholder="Search image title, tags, description"
            />
            <Select value={mediaCategoryId} onValueChange={(value) => { setMediaPage(0); setMediaCategoryId(value); }}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((item: any) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={mediaPage === 0 || loadingMedia} onClick={() => setMediaPage((page) => Math.max(0, page - 1))}>Prev</Button>
              <Button type="button" variant="outline" disabled={!mediaResponse?.hasMore || loadingMedia} onClick={() => setMediaPage((page) => page + 1)}>Next</Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="grid gap-3 p-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
        ) : !activeData.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No {title.toLowerCase()} yet.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-3 p-4">
            {activeData.map((item: any) => (
              <CatalogCard key={item.id} mode={mode} item={item} onEdit={() => openEdit(item)} onDelete={() => remove(item)} onAddToLibrary={mode === "products" ? () => addProductToLibrary(item) : undefined} />
            ))}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {singularTitle}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {mode === "products" && <ProductForm form={form} setForm={setForm} categories={categories} stores={stores} />}
            {mode === "banners" && <BannerForm form={form} setForm={setForm} />}
            {mode === "categories" && <CategoryForm form={form} setForm={setForm} editing={editing} onUploadedForm={persistUploadedCategoryImage} />}
            {mode === "media-library" && <MediaLibraryForm form={form} setForm={setForm} categories={categories} />}
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

function removeCatalogItemFromCache(oldData: any, id: number) {
  if (Array.isArray(oldData)) return oldData.filter((item) => Number(item.id) !== Number(id));
  if (oldData?.items && Array.isArray(oldData.items)) {
    return {
      ...oldData,
      items: oldData.items.filter((item: any) => Number(item.id) !== Number(id)),
      total: Math.max(0, Number(oldData.total ?? oldData.items.length) - 1),
    };
  }
  return oldData;
}

function CatalogCard({ mode, item, onEdit, onDelete, onAddToLibrary }: { mode: Mode; item: any; onEdit: () => void; onDelete: () => void; onAddToLibrary?: () => void }) {
  const imageUrl = mode === "products" ? item.images?.[0] : item.imageUrl;
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="aspect-[1.8/1] bg-gray-50">
        {imageUrl ? <img src={imageUrl} alt={item.name ?? item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 font-bold">{item.name ?? item.title}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{mode === "media-library" ? (item.category?.name ?? "All categories") : item.description ?? item.subtitle ?? item.href ?? "Catalog item"}</p>
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-w-28 flex-1" onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>
          {onAddToLibrary && (
            <Button type="button" variant="outline" size="sm" className="min-w-28 flex-1" onClick={onAddToLibrary}><Images className="mr-2 h-3.5 w-3.5" />Library</Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-50" onClick={onDelete} title="Delete"><Trash2 className="h-4 w-4" /></Button>
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
      <ImageUrlUploadField form={form} setForm={setForm} folder="admin-products" />
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
      <ImageUrlUploadField form={form} setForm={setForm} folder="admin-banners" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link" value={form.href} onChange={(value) => setForm({ ...form, href: value })} />
        <Field label="Sort order" value={form.sortOrder} onChange={(value) => setForm({ ...form, sortOrder: value })} type="number" />
      </div>
      <SwitchRow label="Active banner" checked={!!form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
    </>
  );
}

function CategoryForm({ form, setForm, editing, onUploadedForm }: any) {
  return (
    <>
      <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Icon text" value={form.iconEmoji} onChange={(value) => setForm({ ...form, iconEmoji: value })} />
        <Field label="Sort order" value={form.sortOrder} onChange={(value) => setForm({ ...form, sortOrder: value })} type="number" />
      </div>
      <ImageUrlUploadField form={form} setForm={setForm} folder="admin-categories" onUploadedForm={editing ? onUploadedForm : undefined} />
      <SwitchRow label="Active category" checked={!!form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
    </>
  );
}

function MediaLibraryForm({ form, setForm, categories }: any) {
  return (
    <>
      <Field label="Image title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
      <Field label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} textarea />
      <SelectField
        label="Category"
        value={form.categoryId ? String(form.categoryId) : "all"}
        onChange={(value) => setForm({ ...form, categoryId: value === "all" ? "" : Number(value) })}
        items={[{ value: "all", label: "All categories" }, ...categories.map((item: any) => ({ value: String(item.id), label: item.name }))]}
      />
      <ImageUrlUploadField form={form} setForm={setForm} folder="media-library" required captureFileName />
      <Field label="Tags" value={form.tags} onChange={(value) => setForm({ ...form, tags: value })} />
      <SwitchRow label="Approved for seller use" checked={!!form.isApproved} onChange={(value) => setForm({ ...form, isApproved: value })} />
    </>
  );
}

function ImageUrlUploadField({ form, setForm, folder, required, captureFileName, onUploadedForm }: { form: any; setForm: (form: any) => void; folder: string; required?: boolean; captureFileName?: boolean; onUploadedForm?: (form: any) => Promise<void> | void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImageFile(file, folder);
      const nextForm = {
        ...form,
        imageUrl: uploaded.imageUrl,
        storagePath: uploaded.storagePath ?? form.storagePath,
        storageProvider: uploaded.provider ?? form.storageProvider,
        mimeType: uploaded.mime ?? form.mimeType,
        sizeBytes: uploaded.sizeBytes ? String(uploaded.sizeBytes) : form.sizeBytes,
        title: captureFileName && !form.title ? file.name.replace(/\.[^.]+$/, "") : form.title,
      };
      setForm(nextForm);
      await onUploadedForm?.(nextForm);
      toast({ title: "Image uploaded", description: onUploadedForm ? "Category image save hoyeche." : "URL field-e image bosheche. Save press korun." });
    } catch (error) {
      toast({ title: "Image upload failed", description: getFriendlyErrorMessage(error, "Please upload JPG, PNG, WEBP or GIF under 5 MB."), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <Label>Image URL{required ? " *" : ""}</Label>
      {form.imageUrl ? (
        <div className="overflow-hidden rounded-lg border bg-white">
          <img src={form.imageUrl} alt="" loading="lazy" decoding="async" className="max-h-48 w-full object-contain p-2" />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-white px-3 text-sm font-medium hover:bg-muted ${uploading ? "pointer-events-none opacity-70" : ""}`}>
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : "Upload image"}
          <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
        </label>
        <Input
          value={form.imageUrl ?? ""}
          onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
          onBlur={(event) => setForm({ ...form, imageUrl: normalizeImageUrl(event.target.value) })}
          placeholder="https://... or uploaded image"
          required={required}
        />
      </div>
      <p className="text-xs text-muted-foreground">File upload korle URL auto boshe jabe. Chaile direct image URL paste korte parben.</p>
    </div>
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
  const imageUrl = normalizeImageUrl(form.imageUrl);
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
      images: imageUrl ? [imageUrl] : [],
      isAvailable: !!form.isAvailable,
      isFeatured: !!form.isFeatured,
    };
  }
  if (mode === "banners") {
    return { ...form, sortOrder: Number(form.sortOrder ?? 0), isActive: !!form.isActive };
  }
  if (mode === "media-library") {
    return {
      title: form.title,
      description: form.description,
      imageUrl,
      storagePath: form.storagePath || null,
      storageProvider: form.storageProvider || null,
      mimeType: form.mimeType || null,
      sizeBytes: form.sizeBytes ? Number(form.sizeBytes) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      tags: String(form.tags ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      sourceType: form.sourceType || "admin_upload",
      isApproved: !!form.isApproved,
    };
  }
  return { ...form, imageUrl, sortOrder: Number(form.sortOrder ?? 0), isActive: !!form.isActive };
}

function normalizeImageUrl(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function upsertCatalogItemInCache(oldData: any, item: any) {
  if (!item?.id) return oldData;
  if (Array.isArray(oldData)) {
    const exists = oldData.some((entry: any) => Number(entry.id) === Number(item.id));
    return exists ? oldData.map((entry: any) => Number(entry.id) === Number(item.id) ? item : entry) : [item, ...oldData];
  }
  if (Array.isArray(oldData?.items)) {
    const exists = oldData.items.some((entry: any) => Number(entry.id) === Number(item.id));
    return { ...oldData, items: exists ? oldData.items.map((entry: any) => Number(entry.id) === Number(item.id) ? item : entry) : [item, ...oldData.items] };
  }
  return oldData;
}

function validateCatalogForm(mode: Mode, form: any) {
  if (mode === "products") {
    if (!String(form.name ?? "").trim()) return "Product name is required.";
    if (!Number(form.categoryId)) return "Please select a category.";
    if (!Number(form.storeId)) return "Please select a store.";
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) return "Please enter a valid product price.";
    if (!Number.isFinite(Number(form.mrp)) || Number(form.mrp) <= 0) return "Please enter a valid MRP.";
  }
  if (mode === "banners") {
    if (!String(form.title ?? "").trim()) return "Banner title is required.";
    if (!String(form.imageUrl ?? "").trim()) return "Banner image is required.";
  }
  if (mode === "categories") {
    if (!String(form.name ?? "").trim()) return "Category name is required.";
  }
  if (mode === "media-library") {
    if (!String(form.title ?? "").trim()) return "Image title is required.";
    if (!String(form.imageUrl ?? "").trim()) return "Please upload an image or paste image URL.";
  }
  return "";
}
