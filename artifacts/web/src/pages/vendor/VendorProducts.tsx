import { useState } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  useListVendorProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useListCategories,
  getListVendorProductsQueryKey, getListCategoriesQueryKey, customFetch
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BadgePercent, Camera, CheckCircle2, ImagePlus, Loader2, Plus, Pencil, ScanBarcode, Trash2, Package, AlertTriangle, X } from "lucide-react";
import { uploadImageFile } from "@/lib/image-upload";
import { getFriendlyErrorMessage, getFirstFormError } from "@/lib/error-message";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  description: z.string().optional().or(z.literal("")),
  barcode: z.string().regex(/^\d{8,14}$/, "Enter a valid 8 to 14 digit barcode").optional().or(z.literal("")),
  productDate: z.string().optional().or(z.literal("")),
  mfgDate: z.string().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  expiryRequired: z.boolean(),
  categoryId: z.coerce.number().min(1, "Category required"),
  price: z.coerce.number().min(0.01, "Price required"),
  mrp: z.coerce.number().min(0.01, "MRP required"),
  stock: z.coerce.number().min(0),
  weight: z.string().optional().or(z.literal("")),
  unit: z.string().optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
  sizes: z.string().optional().or(z.literal("")),
  colors: z.string().optional().or(z.literal("")),
  returnWindow: z.string().optional().or(z.literal("")),
  warranty: z.string().optional().or(z.literal("")),
  paymentOptions: z.string().optional().or(z.literal("")),
  deliveryNote: z.string().optional().or(z.literal("")),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
});
type FormData = z.infer<typeof schema>;

const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "28", "30", "32", "34", "36", "38", "40", "42", "Free Size"];
const FOOTWEAR_SIZES = ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const PRODUCT_COLORS = ["Black", "White", "Blue", "Red", "Green", "Yellow", "Brown", "Grey", "Navy", "Pink", "Purple", "Orange", "Beige", "Gold", "Silver"];
const PRODUCT_STEPS = ["Basics", "Variants", "Media", "Policy", "Preview"];
const PRODUCT_PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=900&q=80";
const COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#facc15",
  brown: "#92400e",
  grey: "#9ca3af",
  gray: "#9ca3af",
  navy: "#1e3a8a",
  pink: "#ec4899",
  purple: "#9333ea",
  orange: "#f97316",
  beige: "#d6b98c",
  gold: "#d4af37",
  silver: "#c0c0c0",
};

function measurementOptions(categoryName = "") {
  const lower = categoryName.toLowerCase();
  if (lower.includes("grocery") || lower.includes("tea") || lower.includes("snack") || lower.includes("pet")) {
    return [
      { label: "1 kg", weight: "1", unit: "kg" },
      { label: "500 g", weight: "500", unit: "g" },
      { label: "1 L", weight: "1", unit: "L" },
      { label: "12 pcs", weight: "12", unit: "pcs" },
    ];
  }
  if (lower.includes("fashion")) {
    return [
      { label: "Shirt/T-shirt size", weight: "M", unit: "size" },
      { label: "Jeans waist", weight: "32", unit: "waist" },
      { label: "Footwear number", weight: "UK 8", unit: "pair" },
      { label: "Free size", weight: "Free", unit: "size" },
    ];
  }
  if (lower.includes("mobile") || lower.includes("electronic")) {
    return [
      { label: "128 GB unit", weight: "128 GB", unit: "unit" },
      { label: "8 GB RAM", weight: "8 GB", unit: "RAM" },
      { label: "1 pc", weight: "1", unit: "pc" },
    ];
  }
  return [
    { label: "1 pc", weight: "1", unit: "pc" },
    { label: "500 ml", weight: "500", unit: "ml" },
    { label: "1 set", weight: "1", unit: "set" },
  ];
}

function normalizeSizes(value: string | string[] | undefined | null) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(source.map((item) => item.trim()).filter(Boolean)));
}

function categoryRequiresExpiry(name = "") {
  return /(food|grocery|beverage|drink|snack|chocolate|dairy|milk|cosmetic|beauty|medicine|supplement|pet food)/i.test(name);
}

function BarcodeResultCard({ product }: { product: any }) {
  const specs = product.specifications && typeof product.specifications === "object" ? product.specifications : {};
  const images: string[] = Array.isArray(product.images) ? Array.from(new Set<string>(product.images.filter((url: unknown): url is string => typeof url === "string" && Boolean(url.trim())).map((url: string) => url.trim()))).slice(0, 12) : [];
  const image = images[0] ?? "";
  const value = (item: unknown) => String(item ?? "").trim() || "Not available";
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-28 shrink-0">
          <div className="h-28 w-28 overflow-hidden rounded-lg border bg-white">{image ? <img src={image} alt={product.name || "Scanned product"} className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">Image not available</div>}</div>
          {images.length > 1 && <div className="mt-1 grid grid-cols-4 gap-1">{images.slice(0, 4).map((url: string, index: number) => <div key={`${url}-${index}`} className="h-6 overflow-hidden rounded border bg-white"><img src={url} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /></div>)}</div>}
        </div>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Barcode product found</p><h3 className="mt-1 text-lg font-bold break-words">{value(product.name)}</h3><p className="text-sm text-muted-foreground">{value(product.brand || specs.Brand)}</p><p className="mt-1 text-xs font-medium">Barcode: {value(product.barcode)}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><InfoCell label="Category" value={product.category || specs.Category} /><InfoCell label="MRP" value={product.mrp ? `₹${product.mrp}` : undefined} /><InfoCell label="Pack size" value={product.quantity || specs.Quantity} /><InfoCell label="Manufacturer" value={specs.Manufacturer} /><InfoCell label="Origin" value={specs.Origin || specs.Countries} /><InfoCell label="Description" value={product.description} /></div>
      <p className="mt-3 text-xs text-emerald-800">Review the imported information below. Missing values remain editable and are shown as Not available.</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value?: unknown }) {
  return <div className="rounded-md border border-emerald-100 bg-white p-2"><p className="font-semibold text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{String(value ?? "").trim() || "Not available"}</p></div>;
}

export default function VendorProducts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [colorImageUrls, setColorImageUrls] = useState<Record<string, string>>({});
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [productStep, setProductStep] = useState(0);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<any | null>(null);
  const [importedSpecifications, setImportedSpecifications] = useState<Record<string, unknown>>({});

  const { data: products, isLoading } = useListVendorProducts({
    query: { enabled: !!user, queryKey: getListVendorProductsQueryKey() },
  });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const del = useDeleteProduct();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { isAvailable: true, isFeatured: false, stock: 10, expiryRequired: false },
  });
  const isAvailable = watch("isAvailable");
  const isFeatured = watch("isFeatured");
  const expiryRequired = watch("expiryRequired");
  const selectedCategoryId = watch("categoryId");
  const { data: libraryImages = [], isLoading: loadingLibrary } = useQuery({
    queryKey: ["/api/vendor/media-library", selectedCategoryId],
    queryFn: () => customFetch<any[]>(`/api/vendor/media-library?limit=40${selectedCategoryId ? `&categoryId=${selectedCategoryId}` : ""}`, { responseType: "json" }),
    enabled: !!user && !!selectedCategoryId && dialogOpen,
  });
  const selectedCategory = (categories as any[] | undefined)?.find((item) => Number(item.id) === Number(selectedCategoryId));
  const isFashionCategory = selectedCategory?.name?.toLowerCase().includes("fashion") || selectedCategory?.name?.toLowerCase().includes("cloth");
  const isFootwearProduct = watch("name")?.toLowerCase().includes("shoe") || watch("name")?.toLowerCase().includes("sandal") || watch("name")?.toLowerCase().includes("chappal");
  const activeSizeOptions = isFootwearProduct ? FOOTWEAR_SIZES : CLOTHING_SIZES;

  useEffect(() => {
    if (dialogOpen && !editId && selectedCategory?.name) setValue("expiryRequired", categoryRequiresExpiry(selectedCategory.name), { shouldDirty: false });
  }, [dialogOpen, editId, selectedCategory?.name, setValue]);

  const openCreate = (asOffer = false) => {
    setEditId(null);
    setImageUrls([]);
    setColorImageUrls({});
    setSelectedSizes([]);
    setSelectedColors([]);
    setProductStep(0);
    setBarcodeLoading(false);
    setBarcodeProduct(null);
    setImportedSpecifications({});
    reset({
      categoryId: Number((categories as any[] | undefined)?.[0]?.id ?? 2),
      barcode: "",
      productDate: "",
      mfgDate: "",
      expiryDate: "",
      expiryRequired: false,
      isAvailable: true,
      isFeatured: asOffer,
      stock: 10,
      weight: "1",
      unit: "pc",
      returnWindow: "Damaged items only",
      warranty: "Seller assured",
      paymentOptions: "Cash on Delivery, UPI",
      deliveryNote: "40 minute local target",
    });
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setBarcodeProduct(null);
    setProductStep(0);
    setImageUrls(Array.isArray(p.images) ? p.images : []);
    setColorImageUrls(p.colorImages && typeof p.colorImages === "object" ? p.colorImages : {});
    setSelectedSizes(normalizeSizes(p.sizes ?? p.specifications?.Sizes ?? p.specifications?.Size));
    setSelectedColors(normalizeSizes(p.colors ?? p.specifications?.Colors ?? p.specifications?.Color));
    setImportedSpecifications(p.specifications && typeof p.specifications === "object" ? p.specifications : {});
    reset({
      name: p.name, description: p.description ?? "",
      barcode: p.sku ?? "", productDate: p.specifications?.ProductDate ?? "",
      mfgDate: p.specifications?.MFGDate ?? "", expiryDate: p.specifications?.ExpiryDate ?? "",
      expiryRequired: String(p.specifications?.ExpiryRequired ?? "false").toLowerCase() === "true",
      categoryId: p.categoryId, price: Number(p.price), mrp: Number(p.mrp),
      stock: p.stock, weight: p.weight ?? "", unit: p.unit ?? "",
      imageUrl: p.images?.[0] ?? "", sizes: normalizeSizes(p.sizes ?? p.specifications?.Sizes ?? p.specifications?.Size).join(", "),
      colors: normalizeSizes(p.colors ?? p.specifications?.Colors ?? p.specifications?.Color).join(", "),
      returnWindow: p.returnWindow ?? p.returnPolicy ?? p.specifications?.Return ?? "Damaged items only",
      warranty: p.warranty ?? p.specifications?.Warranty ?? "Seller assured",
      paymentOptions: p.paymentOptions ?? p.specifications?.Payment ?? "Cash on Delivery, UPI",
      deliveryNote: p.deliveryNote ?? p.specifications?.Delivery ?? "40 minute local target",
      isAvailable: !!p.isAvailable, isFeatured: !!p.isFeatured,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    if (data.expiryRequired) {
      if (!data.mfgDate || !data.expiryDate) {
        toast({ title: "Expiry dates required", description: "Enter both manufacturing date and expiry date for this product.", variant: "destructive" });
        setProductStep(0);
        return;
      }
      if (data.expiryDate <= data.mfgDate) {
        toast({ title: "Invalid expiry date", description: "Expiry date must be after the manufacturing date.", variant: "destructive" });
        setProductStep(0);
        return;
      }
      if (data.expiryDate < new Date().toISOString().slice(0, 10) && data.isAvailable) {
        toast({ title: "Product already expired", description: "Expired products cannot be added as active inventory.", variant: "destructive" });
        setProductStep(0);
        return;
      }
    }
    const cleanImages = imageUrls.map(url => url.trim()).filter(Boolean);
    const duplicate = (products as any[] | undefined)?.some((product) => product.id !== editId && String(product.name).trim().toLowerCase() === data.name.trim().toLowerCase());
    if (duplicate) {
      toast({ title: "Duplicate product title", description: "This product is already in your inventory. Edit the existing product instead.", variant: "destructive" });
      setProductStep(0);
      return;
    }
    const duplicateBarcode = data.barcode && (products as any[] | undefined)?.some((product) => product.id !== editId && String(product.sku ?? product.specifications?.Barcode ?? "") === data.barcode);
    if (duplicateBarcode) {
      toast({ title: "Barcode already exists", description: "A product with this barcode is already in your inventory. Edit the existing product instead.", variant: "destructive" });
      setProductStep(0);
      return;
    }
    if (!cleanImages.length) cleanImages.push(PRODUCT_PLACEHOLDER_IMAGE);
    const sizes = normalizeSizes([...selectedSizes, ...normalizeSizes(data.sizes)]);
    const colors = normalizeSizes([...selectedColors, ...normalizeSizes(data.colors)]);
    const colorImages = Object.fromEntries(
      colors
        .map((color) => [color, String(colorImageUrls[color] ?? "").trim()])
        .filter(([, url]) => Boolean(url))
    );
    const specifications = {
      ...importedSpecifications,
      ...(sizes.length ? { Sizes: sizes.join(", ") } : {}),
      ...(colors.length ? { Colors: colors.join(", ") } : {}),
      Return: data.returnWindow || "Damaged items only",
      Warranty: data.warranty || "Seller assured",
      Payment: data.paymentOptions || "Cash on Delivery, UPI",
      Delivery: data.deliveryNote || "40 minute local target",
      ...(data.productDate ? { ProductDate: data.productDate } : {}),
      ExpiryRequired: String(data.expiryRequired),
      ...(data.expiryRequired ? { MFGDate: data.mfgDate, ExpiryDate: data.expiryDate } : {}),
      ...(data.barcode ? { Barcode: data.barcode } : {}),
    };
    const payload = {
      name: data.name,
      description: data.description,
      categoryId: data.categoryId,
      price: String(data.price),
      mrp: String(data.mrp),
      stock: data.stock,
      weight: data.weight,
      unit: data.unit,
      sku: data.barcode || undefined,
      images: cleanImages,
      colorImages,
      sizes,
      colors,
      returnWindow: data.returnWindow || "Damaged items only",
      warranty: data.warranty || "Seller assured",
      paymentOptions: data.paymentOptions || "Cash on Delivery, UPI",
      deliveryNote: data.deliveryNote || "40 minute local target",
      specifications,
      isAvailable: data.isAvailable,
      isFeatured: data.isFeatured,
    };
    const onSuccess = () => {
      qc.invalidateQueries({ queryKey: getListVendorProductsQueryKey() });
      setDialogOpen(false);
      toast({ title: editId ? "Product updated" : "Product created" });
    };
    const onError = (err: unknown) => {
      toast({ title: "Product save failed", description: getFriendlyErrorMessage(err, "Please check product details and try again."), variant: "destructive" });
    };
    if (editId) {
      update.mutate({ productId: editId, data: payload }, { onSuccess, onError });
    } else {
      create.mutate({ data: payload as any }, { onSuccess, onError });
    }
  };

  const lookupBarcode = async (barcodeOverride?: string, allowCurrentLookup = false) => {
    if (barcodeLoading && !allowCurrentLookup) return;
    const barcode = String(barcodeOverride ?? watch("barcode") ?? "").replace(/\D/g, "");
    setValue("barcode", barcode, { shouldDirty: true, shouldValidate: true });
    if (!/^\d{8,14}$/.test(barcode)) {
      toast({ title: "Invalid barcode", description: "Please enter a valid barcode.", variant: "destructive" });
      return;
    }
    setBarcodeLoading(true);
    try {
      const found = await customFetch<any>(`/api/vendor/barcode/${barcode}`, { responseType: "json" });
      setBarcodeProduct(found);
      setValue("name", found.name || "", { shouldDirty: true, shouldValidate: true });
      const imported = found.specifications && typeof found.specifications === "object" ? found.specifications : {};
      setImportedSpecifications(imported);
      const detailLines = Object.entries(imported)
        .filter(([key, value]) => !["Nutrition", "Barcode", "Source", "ExpiryDate", "MFGDate"].includes(key) && typeof value !== "object")
        .map(([key, value]) => `${key}: ${String(value)}`);
      const description = [found.description || "", ...detailLines].filter(Boolean).join("\n");
      setValue("description", description, { shouldDirty: true });

      const categoryText = `${found.category || ""} ${(found.categoryTags || []).join(" ")}`.toLowerCase();
      const matchedCategory = (categories as any[] | undefined)?.find((category) => {
        const name = String(category.name ?? "").toLowerCase();
        return name && (categoryText.includes(name) || name.split(/\s+|&/).some((word: string) => word.length > 3 && categoryText.includes(word)));
      });
      if (matchedCategory) setValue("categoryId", Number(matchedCategory.id), { shouldDirty: true, shouldValidate: true });

      const quantity = String(found.quantity || "").trim();
      const quantityMatch = quantity.match(/^([\d.]+)\s*([a-zA-Z]+|pcs?)?/);
      if (quantityMatch) {
        setValue("weight", quantityMatch[1], { shouldDirty: true });
        setValue("unit", quantityMatch[2] || "pc", { shouldDirty: true });
      }
      if (found.mrp && Number(found.mrp) > 0) {
        setValue("mrp", Number(found.mrp), { shouldDirty: true, shouldValidate: true });
      }
      const images: string[] = Array.isArray(found.images)
        ? Array.from(new Set<string>(found.images.filter((url: unknown): url is string => typeof url === "string" && /^(https?:\/\/|\/api\/)/i.test(url)).map((url: string) => url.trim()))).slice(0, 12)
        : [];
      if (images.length) setImageUrls(images);
      setValue("expiryRequired", Boolean(found.expiryRequired), { shouldDirty: true });
      toast({ title: "Product details imported", description: `${images.length} company image(s) and available product details added. Review or edit everything before saving.` });
    } catch (err) {
      const description = getFriendlyErrorMessage(err, "Product not found. Please add the product details manually.");
      toast({ title: description.includes("not found") ? "Product not found" : "Barcode lookup failed", description, variant: "destructive" });
    } finally {
      setBarcodeLoading(false);
    }
  };

  const scanBarcodeImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      toast({ title: "Camera scanner unavailable", description: "This browser cannot read barcodes from photos. Enter the barcode number or use Chrome on Android.", variant: "destructive" });
      return;
    }
    setBarcodeLoading(true);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const results = await detector.detect(bitmap);
      const barcode = String(results?.[0]?.rawValue ?? "").replace(/\D/g, "");
      if (!/^\d{8,14}$/.test(barcode)) throw new Error("No valid product barcode was found in the photo.");
      setValue("barcode", barcode, { shouldDirty: true, shouldValidate: true });
      await lookupBarcode(barcode, true);
    } catch (error) {
      setBarcodeLoading(false);
      toast({ title: "Barcode scan failed", description: getFriendlyErrorMessage(error, "Keep the barcode clear, well-lit and fully inside the camera frame."), variant: "destructive" });
    } finally {
      bitmap?.close();
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this product?")) return;
    del.mutate({ productId: id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListVendorProductsQueryKey() });
        toast({ title: "Product deleted" });
      },
    });
  };

  const addImageField = () => setImageUrls(prev => [...prev, ""]);
  const updateImageField = (index: number, value: string) => {
    setImageUrls(prev => prev.map((url, i) => i === index ? value : url));
  };
  const removeImageField = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };
  const setMainImage = (index: number) => {
    setImageUrls((prev) => {
      if (index <= 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
  };
  const toggleSize = (size: string) => {
    setSelectedSizes((prev) => prev.includes(size) ? prev.filter((item) => item !== size) : [...prev, size]);
  };
  const toggleColor = (color: string) => {
    setSelectedColors((prev) => prev.includes(color) ? prev.filter((item) => item !== color) : [...prev, color]);
  };
  const updateColorImage = (color: string, value: string) => {
    setColorImageUrls((prev) => ({ ...prev, [color]: value }));
  };
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith("image/"));
    if (!files.length) return;

    Promise.all(files.map((file) => uploadImageFile(file, "seller-products"))).then((uploads) => {
      const urls = uploads.map((item) => item.imageUrl).filter(Boolean);
      setImageUrls(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} photo uploaded`, description: "Storage URL saved for this product." });
    }).catch((error) => {
      toast({ title: "Photo upload failed", description: getFriendlyErrorMessage(error, "Please try another image."), variant: "destructive" });
    });
  };
  const addLibraryImage = (url: string) => {
    if (!url) return;
    setImageUrls((prev) => prev.includes(url) ? prev : [...prev, url]);
    toast({ title: "Library image added", description: "Image added to this product photo list." });
  };

  const goNextStep = async () => {
    if (productStep === 0 && (!watch("name")?.trim() || !selectedCategoryId || !watch("price") || !watch("mrp"))) {
      toast({ title: "Basic details required", description: "Enter the name, category, price and MRP.", variant: "destructive" });
      return;
    }
    setProductStep((step) => Math.min(PRODUCT_STEPS.length - 1, step + 1));
  };

  const onInvalid = (formErrors: unknown) => {
    toast({
      title: "Complete product details",
      description: getFirstFormError(formErrors, "Name, category, price, MRP and stock are required."),
      variant: "destructive",
    });
    setProductStep(0);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage stock, pricing, photos and offer placement from one place.</p>
        </div>
        <Button onClick={() => openCreate(false)} data-testid="btn-add-product">
          <Plus className="w-4 h-4 mr-2" />Add Product
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total products</p>
          <p className="mt-1 text-2xl font-bold">{products?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Live products</p>
          <p className="mt-1 text-2xl font-bold">{(products as any[] | undefined)?.filter((item) => item.isAvailable).length ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Offer products</p>
          <p className="mt-1 text-2xl font-bold">{(products as any[] | undefined)?.filter((item) => item.isFeatured).length ?? 0}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><BadgePercent className="h-5 w-5 text-primary" />Offer products</h2>
            <p className="text-sm text-muted-foreground">Products marked as offer appear in Flash Deals and promotional rows on the home page.</p>
          </div>
          <Button variant="outline" onClick={() => openCreate(true)} data-testid="btn-add-offer-product">
            <Plus className="mr-2 h-4 w-4" />Add Offer Product
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(products as any[] | undefined)?.filter((item) => item.isFeatured).slice(0, 4).map((p) => (
            <button key={p.id} type="button" onClick={() => openEdit(p)} className="flex items-center gap-3 rounded-lg border bg-orange-50/60 p-3 text-left transition-colors hover:border-primary/40">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-white">
                {p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" /> : <Package className="m-4 h-6 w-6 text-gray-300" />}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">Rs.{Number(p.price).toFixed(0)} · {Number(p.discountPercent ?? 0).toFixed(0)}% off</p>
              </div>
            </button>
          ))}
          {!((products as any[] | undefined)?.some((item) => item.isFeatured)) && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
              No offer product selected yet. Add a new offer product or edit any product and turn on Featured.
            </div>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : !products?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No products yet. Add your first product to start selling.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(products as any[]).map((p: any) => (
            <div key={p.id} className="bg-white border rounded-xl overflow-hidden group" data-testid={`product-${p.id}`}>
              <div className="aspect-square bg-gray-50 relative overflow-hidden">
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-contain p-4" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
                )}
                {!p.isAvailable && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Badge variant="destructive" className="text-xs">Unavailable</Badge>
                  </div>
                )}
                {p.isFeatured && (
                  <div className="absolute left-2 top-2">
                    <Badge className="bg-primary text-white">
                      <BadgePercent className="mr-1 h-3 w-3" />Offer
                    </Badge>
                  </div>
                )}
                {p.stock <= 5 && p.stock >= 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="text-xs bg-white text-orange-600 border-orange-200">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />{p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-sm line-clamp-2 mb-1">{p.name}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="font-bold text-sm">Rs.{Number(p.price).toFixed(0)}</span>
                  {p.mrp && Number(p.mrp) > Number(p.price) && (
                    <span className="text-xs text-muted-foreground line-through">Rs.{Number(p.mrp).toFixed(0)}</span>
                  )}
                </div>
                {Array.isArray(p.sizes) && p.sizes.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {p.sizes.slice(0, 5).map((size: string) => (
                      <span key={size} className="rounded-full border bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-700">{size}</span>
                    ))}
                    {p.sizes.length > 5 && <span className="text-[10px] text-muted-foreground">+{p.sizes.length - 5}</span>}
                  </div>
                )}
                {Array.isArray(p.colors) && p.colors.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {p.colors.slice(0, 5).map((color: string) => (
                      <span key={color} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                        {color}
                      </span>
                    ))}
                    {p.colors.length > 5 && <span className="text-[10px] text-muted-foreground">+{p.colors.length - 5}</span>}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openEdit(p)} data-testid={`btn-edit-${p.id}`}>
                    <Pencil className="w-3 h-3 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => handleDelete(p.id)} data-testid={`btn-del-${p.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmitCapture={(event) => {
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
              const activeElement = document.activeElement as HTMLElement | null;
              if (submitter?.dataset.testid === "btn-save") return;
              if (activeElement?.id === "product-barcode") {
                event.preventDefault();
                event.stopPropagation();
                void lookupBarcode();
              }
            }}
            onSubmit={handleSubmit(onSubmit, onInvalid)}
            className="space-y-3"
            noValidate
          >
            <div className="grid grid-cols-5 gap-1 rounded-xl border bg-gray-50 p-2">
              {PRODUCT_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setProductStep(index)}
                  className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${productStep === index ? "bg-primary text-white shadow-sm" : index < productStep ? "bg-green-50 text-green-700" : "bg-white text-gray-600"}`}
                >
                  <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-current/10">
                    {index < productStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  {step}
                </button>
              ))}
            </div>

            {productStep === 0 && (
              <section className="space-y-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-2 flex items-start gap-2">
                    <ScanBarcode className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                    <div>
                      <Label htmlFor="product-barcode" className="font-bold text-blue-950">Add product by barcode</Label>
                      <p className="text-xs text-blue-700">A valid barcode imports available details, pack size and images. Review the result and set the price yourself.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Input
                      id="product-barcode"
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="Scan or enter 8-14 digit barcode"
                      {...register("barcode", { onChange: (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 14); } })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.stopPropagation();
                          void lookupBarcode();
                        }
                      }}
                      data-testid="input-barcode"
                    />
                    <Button type="button" variant="outline" className="shrink-0 bg-white" onClick={() => void lookupBarcode()} disabled={barcodeLoading} data-testid="btn-barcode-lookup">
                      {barcodeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanBarcode className="mr-2 h-4 w-4" />}
                      {barcodeLoading ? "Looking up product..." : "Find"}
                    </Button>
                    <label className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-blue-200 bg-white px-3 text-sm font-medium hover:bg-blue-50 ${barcodeLoading ? "pointer-events-none opacity-60" : ""}`}>
                      <Camera className="mr-2 h-4 w-4" /> Scan
                      <input type="file" accept="image/*" capture="environment" className="hidden" disabled={barcodeLoading} onChange={scanBarcodeImage} />
                    </label>
                  </div>
                  {errors.barcode && <p className="mt-1 text-xs text-red-500">{errors.barcode.message}</p>}
                </div>
                {barcodeProduct && (
                  <BarcodeResultCard product={barcodeProduct} />
                )}
                <div className="space-y-1">
                  <Label>Product Name *</Label>
                  <Input {...register("name")} data-testid="input-name" />
                  {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea {...register("description")} rows={2} data-testid="input-description" />
                </div>
                <div className="space-y-1">
                  <Label>Category *</Label>
                  <Select value={selectedCategoryId ? String(selectedCategoryId) : undefined} onValueChange={v => setValue("categoryId", Number(v))}>
                    <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.categoryId && <p className="text-xs text-red-500">{errors.categoryId.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Selling Price (Rs.) *</Label>
                    <Input type="number" step="0.01" {...register("price")} data-testid="input-price" />
                    {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>MRP (Rs.) *</Label>
                    <Input type="number" step="0.01" {...register("mrp")} data-testid="input-mrp" />
                    {errors.mrp && <p className="text-xs text-red-500">{errors.mrp.message}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product-date">Product / stock date</Label>
                  <Input id="product-date" type="date" {...register("productDate")} data-testid="input-product-date" />
                  <p className="text-xs text-muted-foreground">Optional stock reference date.</p>
                </div>
                <div className="rounded-lg border bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3"><div><Label>Expiry tracking</Label><p className="text-xs text-muted-foreground">Enable only when this product has a manufacturing and expiry date.</p></div><Switch checked={expiryRequired} onCheckedChange={(value) => setValue("expiryRequired", value, { shouldDirty: true })} /></div>
                  {expiryRequired && <div className="mt-3 grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Manufacturing date *</Label><Input type="date" {...register("mfgDate")} /></div><div className="space-y-1"><Label>Expiry date *</Label><Input type="date" {...register("expiryDate")} /></div></div>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Stock</Label>
                    <Input type="number" {...register("stock")} data-testid="input-stock" />
                  </div>
                  <div className="space-y-1">
                    <Label>Weight</Label>
                    <Input placeholder="e.g. 500" {...register("weight")} data-testid="input-weight" />
                  </div>
                  <div className="space-y-1">
                    <Label>Unit</Label>
                    <Input placeholder="g, ml, pcs" {...register("unit")} data-testid="input-unit" />
                  </div>
                </div>
              </section>
            )}

            {productStep === 1 && (
              <section className="space-y-3">
                <div className="rounded-lg border bg-blue-50 p-3">
                  <Label>Category-wise measurement</Label>
                  <p className="mb-2 text-xs text-blue-700">Choose a shortcut that matches how this item is measured.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {measurementOptions(selectedCategory?.name).map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setValue("weight", option.weight, { shouldDirty: true });
                          setValue("unit", option.unit, { shouldDirty: true });
                        }}
                        className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-blue-800 hover:border-primary"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                  <div>
                    <Label>Available clothing sizes</Label>
                    <p className="text-xs text-muted-foreground">Select sizes for fashion products. You can also enter custom sizes separated by commas.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSizeOptions.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleSize(size)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selectedSizes.includes(size) ? "border-primary bg-primary text-white" : "bg-white text-gray-700 hover:border-primary/50"}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <Input
                    {...register("sizes")}
                    placeholder="Custom sizes: 44, 46, Kids 6Y"
                    onBlur={(event) => setSelectedSizes(normalizeSizes([...selectedSizes, ...normalizeSizes(event.target.value)]))}
                    data-testid="input-sizes"
                  />
                  {!isFashionCategory && <p className="text-xs text-muted-foreground">Optional for non-fashion products.</p>}
                </div>
                <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                  <div>
                    <Label>Available colors</Label>
                    <p className="text-xs text-muted-foreground">Add colors when customers need to choose a color before ordering.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRODUCT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => toggleColor(color)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selectedColors.includes(color) ? "border-primary bg-primary text-white" : "bg-white text-gray-700 hover:border-primary/50"}`}
                      >
                        <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                        {color}
                      </button>
                    ))}
                  </div>
                  <Input
                    {...register("colors")}
                    placeholder="Custom colors: Maroon, Sky Blue, Cream"
                    onBlur={(event) => setSelectedColors(normalizeSizes([...selectedColors, ...normalizeSizes(event.target.value)]))}
                    data-testid="input-colors"
                  />
                  {selectedColors.length > 0 && (
                    <div className="space-y-2 rounded-lg border bg-white p-2">
                      <p className="text-xs font-semibold text-gray-700">Color-wise product image</p>
                      {selectedColors.map((color) => (
                        <div key={color} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold">
                            <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                            {color}
                          </span>
                          <Input
                            value={colorImageUrls[color] ?? ""}
                            onChange={(event) => updateColorImage(color, event.target.value)}
                            placeholder={`${color} image URL`}
                            data-testid={`input-color-image-${color}`}
                          />
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">The selected color image will appear in product details, cart and order views.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {productStep === 2 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Product Photos</Label>
                  <div className="flex gap-2">
                    <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium hover:bg-muted">
                      <ImagePlus className="mr-1 h-3.5 w-3.5" />
                      Upload
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} data-testid="input-product-images" />
                    </label>
                    <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-medium text-orange-700 hover:bg-orange-100">
                      <Camera className="mr-1 h-3.5 w-3.5" /> Camera
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} data-testid="input-product-camera" />
                    </label>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addImageField}>
                      <Plus className="mr-1 h-3 w-3" />URL
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border bg-orange-50/50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">Admin Image Library</p>
                      <p className="text-xs text-muted-foreground">Category-wise approved photos. Tap an image to use it for this product.</p>
                    </div>
                    <Badge variant="outline">{libraryImages.length} images</Badge>
                  </div>
                  {loadingLibrary ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
                    </div>
                  ) : libraryImages.length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {libraryImages.slice(0, 15).map((item: any) => (
                        <button key={item.id} type="button" onClick={() => addLibraryImage(item.imageUrl)} className="overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:border-primary">
                          <div className="aspect-square bg-white">
                            <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          </div>
                          <p className="truncate px-1.5 py-1 text-[11px] font-medium">{item.title}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed bg-white p-3 text-xs text-muted-foreground">
                      No approved library image for this category yet. Admin can add images from Catalog Management → Image Library.
                    </p>
                  )}
                </div>
                {!imageUrls.length ? (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                    Add one or more product photos. Main image will be the first image.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {imageUrls.map((url, index) => (
                      <div key={`${index}-${url.slice(0, 12)}`} className="flex items-center gap-2">
                        <div className="h-12 w-12 overflow-hidden rounded-md border bg-gray-50">
                          {url ? <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Package className="m-3 h-6 w-6 text-gray-300" />}
                        </div>
                        <div className="w-20 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">
                          {index === 0 ? "Main image" : <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-[11px]" onClick={() => setMainImage(index)}>Set main</Button>}
                        </div>
                        <Input
                          value={url}
                          onChange={(event) => updateImageField(index, event.target.value)}
                          placeholder="https://... or uploaded image"
                          data-testid={`input-image-${index}`}
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeImageField(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {productStep === 3 && (
              <section className="space-y-3">
                <div className="space-y-3 rounded-lg border bg-white p-3">
                  <div>
                    <Label>Return / warranty / payment policy</Label>
                    <p className="text-xs text-muted-foreground">Customers will see these details on the product page.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Return window</Label>
                      <Input placeholder="Damaged items only" {...register("returnWindow")} data-testid="input-return-window" />
                    </div>
                    <div className="space-y-1">
                      <Label>Warranty</Label>
                      <Input placeholder="1 Year warranty / Seller assured" {...register("warranty")} data-testid="input-warranty" />
                    </div>
                    <div className="space-y-1">
                      <Label>Payment options</Label>
                      <Input placeholder="Cash on Delivery, UPI" {...register("paymentOptions")} data-testid="input-payment-options" />
                    </div>
                    <div className="space-y-1">
                      <Label>Delivery note</Label>
                      <Input placeholder="40 minute local target" {...register("deliveryNote")} data-testid="input-delivery-note" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={isAvailable} onCheckedChange={v => setValue("isAvailable", v)} data-testid="switch-available" />
                    <Label>Available for purchase</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={isFeatured} onCheckedChange={v => setValue("isFeatured", v)} data-testid="switch-featured" />
                    <Label>Featured</Label>
                  </div>
                </div>
              </section>
            )}

            {productStep === 4 && (
              <section className="space-y-3">
                <div className="rounded-xl border bg-white p-3 shadow-sm">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Customer preview</p>
                  <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                    <div className="aspect-square overflow-hidden rounded-lg bg-gray-50">
                      {imageUrls[0] ? <img src={imageUrls[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-3" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-lg font-bold">{watch("name") || "Product title"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedCategory?.name ?? "Category"} · {watch("weight") || "1"} {watch("unit") || "pc"}</p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-bold">Rs.{Number(watch("price") || 0).toFixed(0)}</span>
                        <span className="text-sm text-muted-foreground line-through">Rs.{Number(watch("mrp") || 0).toFixed(0)}</span>
                      </div>
                      <p className="mt-2 text-sm text-green-700">{watch("deliveryNote") || "40 minute local target"}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {[...selectedSizes, ...normalizeSizes(watch("sizes"))].slice(0, 6).map((size) => <Badge key={size} variant="outline">{size}</Badge>)}
                        {[...selectedColors, ...normalizeSizes(watch("colors"))].slice(0, 6).map((color) => <Badge key={color} variant="outline">{color}</Badge>)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {false && (
              <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Stock</Label>
                <Input type="number" {...register("stock")} data-testid="input-stock" />
              </div>
              <div className="space-y-1">
                <Label>Weight</Label>
                <Input placeholder="e.g. 500" {...register("weight")} data-testid="input-weight" />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Input placeholder="g, ml, pcs" {...register("unit")} data-testid="input-unit" />
              </div>
            </div>
            <div className="rounded-lg border bg-blue-50 p-3">
              <Label>Category-wise measurement</Label>
              <p className="mb-2 text-xs text-blue-700">Choose a shortcut that matches how this item is measured.</p>
              <div className="flex flex-wrap gap-1.5">
                {measurementOptions(selectedCategory?.name).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setValue("weight", option.weight, { shouldDirty: true });
                      setValue("unit", option.unit, { shouldDirty: true });
                    }}
                    className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-blue-800 hover:border-primary"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
              <div>
                <Label>Available clothing sizes</Label>
                <p className="text-xs text-muted-foreground">Select sizes for fashion products. You can also enter custom sizes separated by commas.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selectedSizes.includes(size) ? "border-primary bg-primary text-white" : "bg-white text-gray-700 hover:border-primary/50"}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <Input
                {...register("sizes")}
                placeholder="Custom sizes: 44, 46, Kids 6Y"
                onBlur={(event) => setSelectedSizes(normalizeSizes([...selectedSizes, ...normalizeSizes(event.target.value)]))}
                data-testid="input-sizes"
              />
              {!isFashionCategory && <p className="text-xs text-muted-foreground">Optional for non-fashion products.</p>}
            </div>
            <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
              <div>
                <Label>Available colors</Label>
                <p className="text-xs text-muted-foreground">Add colors when customers need to choose a color before ordering.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleColor(color)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selectedColors.includes(color) ? "border-primary bg-primary text-white" : "bg-white text-gray-700 hover:border-primary/50"}`}
                  >
                    <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                    {color}
                  </button>
                ))}
              </div>
              <Input
                {...register("colors")}
                placeholder="Custom colors: Maroon, Sky Blue, Cream"
                onBlur={(event) => setSelectedColors(normalizeSizes([...selectedColors, ...normalizeSizes(event.target.value)]))}
                data-testid="input-colors"
              />
              {selectedColors.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-white p-2">
                  <p className="text-xs font-semibold text-gray-700">Color-wise product image</p>
                  {selectedColors.map((color) => (
                    <div key={color} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                        {color}
                      </span>
                      <Input
                        value={colorImageUrls[color] ?? ""}
                        onChange={(event) => updateColorImage(color, event.target.value)}
                        placeholder={`${color} image URL`}
                        data-testid={`input-color-image-${color}`}
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">The selected color image will appear in product details, cart and order views.</p>
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-lg border bg-white p-3">
              <div>
                <Label>Return / warranty / payment policy</Label>
                <p className="text-xs text-muted-foreground">Customers will see these details on the product page.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Return window</Label>
                  <Input placeholder="Damaged items only" {...register("returnWindow")} data-testid="input-return-window" />
                </div>
                <div className="space-y-1">
                  <Label>Warranty</Label>
                  <Input placeholder="1 Year warranty / Seller assured" {...register("warranty")} data-testid="input-warranty" />
                </div>
                <div className="space-y-1">
                  <Label>Payment options</Label>
                  <Input placeholder="Cash on Delivery, UPI" {...register("paymentOptions")} data-testid="input-payment-options" />
                </div>
                <div className="space-y-1">
                  <Label>Delivery note</Label>
                  <Input placeholder="40 minute local target" {...register("deliveryNote")} data-testid="input-delivery-note" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Product Photos</Label>
                <div className="flex flex-wrap justify-end gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium hover:bg-muted">
                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                    Upload
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} data-testid="input-product-images" />
                  </label>
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-medium text-orange-700 hover:bg-orange-100">
                    <Camera className="mr-1 h-3.5 w-3.5" /> Camera
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} data-testid="input-product-camera" />
                  </label>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addImageField}>
                    <Plus className="mr-1 h-3 w-3" />URL
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border bg-orange-50/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">Admin Image Library</p>
                    <p className="text-xs text-muted-foreground">Category-wise approved photos. Tap an image to use it for this product.</p>
                  </div>
                  <Badge variant="outline">{libraryImages.length} images</Badge>
                </div>
                {loadingLibrary ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
                  </div>
                ) : libraryImages.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {libraryImages.slice(0, 15).map((item: any) => (
                      <button key={item.id} type="button" onClick={() => addLibraryImage(item.imageUrl)} className="overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:border-primary">
                        <div className="aspect-square bg-white">
                          <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        </div>
                        <p className="truncate px-1.5 py-1 text-[11px] font-medium">{item.title}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed bg-white p-3 text-xs text-muted-foreground">
                    No approved library image for this category yet. Admin can add images from Catalog Management to Image Library.
                  </p>
                )}
              </div>
              {!imageUrls.length ? (
                <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  Add one or more product photos.
                </div>
              ) : (
                <div className="space-y-2">
                  {imageUrls.map((url, index) => (
                    <div key={`${index}-${url.slice(0, 12)}`} className="flex items-center gap-2">
                      <div className="h-12 w-12 overflow-hidden rounded-md border bg-gray-50">
                        {url ? <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Package className="m-3 h-6 w-6 text-gray-300" />}
                      </div>
                      <Input
                        value={url}
                        onChange={(event) => updateImageField(index, event.target.value)}
                        placeholder="https://... or uploaded image"
                        data-testid={`input-image-${index}`}
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeImageField(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={isAvailable} onCheckedChange={v => setValue("isAvailable", v)} data-testid="switch-available" />
                <Label>Available for purchase</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isFeatured} onCheckedChange={v => setValue("isFeatured", v)} data-testid="switch-featured" />
                <Label>Featured</Label>
              </div>
            </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => productStep === 0 ? setDialogOpen(false) : setProductStep((step) => Math.max(0, step - 1))}>
                {productStep === 0 ? "Cancel" : "Back"}
              </Button>
              {productStep < PRODUCT_STEPS.length - 1 ? (
                <Button type="button" onClick={goNextStep}>Continue</Button>
              ) : (
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-save">
                  {create.isPending || update.isPending ? "Saving..." : "Publish Product"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
