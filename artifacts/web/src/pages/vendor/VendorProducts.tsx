import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  useListVendorProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useListCategories,
  getListVendorProductsQueryKey, getListCategoriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Package, AlertTriangle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  description: z.string().optional().or(z.literal("")),
  categoryId: z.coerce.number().min(1, "Category required"),
  price: z.coerce.number().min(0.01, "Price required"),
  mrp: z.coerce.number().min(0.01, "MRP required"),
  stock: z.coerce.number().min(0),
  weight: z.string().optional().or(z.literal("")),
  unit: z.string().optional().or(z.literal("")),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
});
type FormData = z.infer<typeof schema>;

export default function VendorProducts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: products, isLoading } = useListVendorProducts({
    query: { enabled: !!user, queryKey: getListVendorProductsQueryKey() },
  });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const del = useDeleteProduct();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { isAvailable: true, isFeatured: false, stock: 0 },
  });
  const isAvailable = watch("isAvailable");
  const isFeatured = watch("isFeatured");

  const openCreate = () => {
    setEditId(null);
    reset({ isAvailable: true, isFeatured: false, stock: 0 });
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    reset({
      name: p.name, description: p.description ?? "",
      categoryId: p.categoryId, price: Number(p.price), mrp: Number(p.mrp),
      stock: p.stock, weight: p.weight ?? "", unit: p.unit ?? "",
      imageUrl: p.images?.[0] ?? "", isAvailable: !!p.isAvailable, isFeatured: !!p.isFeatured,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    const payload = {
      name: data.name,
      description: data.description,
      categoryId: data.categoryId,
      price: String(data.price),
      mrp: String(data.mrp),
      stock: data.stock,
      weight: data.weight,
      unit: data.unit,
      images: data.imageUrl ? [data.imageUrl] : [],
      isAvailable: data.isAvailable,
      isFeatured: data.isFeatured,
    };
    const onSuccess = () => {
      qc.invalidateQueries({ queryKey: getListVendorProductsQueryKey() });
      setDialogOpen(false);
      toast({ title: editId ? "Product updated" : "Product created" });
    };
    const onError = () => toast({ title: "Operation failed", variant: "destructive" });
    if (editId) {
      update.mutate({ productId: editId, data: payload }, { onSuccess, onError });
    } else {
      create.mutate({ data: payload as any }, { onSuccess, onError });
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products ({products?.length ?? 0})</h1>
        <Button onClick={openCreate} data-testid="btn-add-product">
          <Plus className="w-4 h-4 mr-2" />Add Product
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : !products?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No products yet. Add your first product!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(products as any[]).map((p: any) => (
            <div key={p.id} className="bg-white border rounded-xl overflow-hidden group" data-testid={`product-${p.id}`}>
              <div className="aspect-square bg-gray-50 relative overflow-hidden">
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain p-4" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
                )}
                {!p.isAvailable && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Badge variant="destructive" className="text-xs">Unavailable</Badge>
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
                  <span className="font-bold text-sm">â‚¹{Number(p.price).toFixed(0)}</span>
                  {p.mrp && Number(p.mrp) > Number(p.price) && (
                    <span className="text-xs text-muted-foreground line-through">â‚¹{Number(p.mrp).toFixed(0)}</span>
                  )}
                </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
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
              <Select onValueChange={v => setValue("categoryId", Number(v))}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.categoryId && <p className="text-xs text-red-500">{errors.categoryId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Selling Price (â‚¹) *</Label>
                <Input type="number" step="0.01" {...register("price")} data-testid="input-price" />
                {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>MRP (â‚¹) *</Label>
                <Input type="number" step="0.01" {...register("mrp")} data-testid="input-mrp" />
                {errors.mrp && <p className="text-xs text-red-500">{errors.mrp.message}</p>}
              </div>
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
            <div className="space-y-1">
              <Label>Image URL</Label>
              <Input type="url" placeholder="https://..." {...register("imageUrl")} data-testid="input-image" />
              {errors.imageUrl && <p className="text-xs text-red-500">{errors.imageUrl.message}</p>}
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-save">
                {create.isPending || update.isPending ? "Saving..." : "Save Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
