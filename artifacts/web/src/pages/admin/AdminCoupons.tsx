import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { customFetch, useListAdminCoupons, useCreateCoupon, getListAdminCouponsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Tag, Clock, Pencil, Trash2, Power } from "lucide-react";

const optionalNumber = (min = 0) =>
  z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : value,
    z.coerce.number().min(min).optional(),
  );

const schema = z.object({
  code: z.string().trim().min(3, "Min 3 characters").max(20, "Max 20 characters").regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, dash or underscore"),
  description: z.string().min(5, "Description required"),
  discountType: z.enum(["flat", "percent"]),
  discountValue: z.coerce.number().min(1, "Discount value required"),
  minOrderValue: optionalNumber(0),
  maxDiscount: optionalNumber(0),
  usageLimit: optionalNumber(1),
  perUserLimit: optionalNumber(1),
  expiresAt: z.string().optional().or(z.literal("")),
  isSpecial: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function AdminCoupons() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: coupons, isLoading } = useListAdminCoupons({
    query: { enabled: !!user, queryKey: getListAdminCouponsQueryKey() },
  });
  const create = useCreateCoupon();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { code: "", description: "", discountType: "flat", discountValue: 1, minOrderValue: undefined, maxDiscount: undefined, usageLimit: undefined, perUserLimit: undefined, expiresAt: "", isSpecial: false },
  });
  const discountType = watch("discountType");

  const refresh = () => qc.invalidateQueries({ queryKey: getListAdminCouponsQueryKey() });

  const openEdit = (coupon: any) => {
    setEditing(coupon);
    reset({
      code: coupon.code ?? "",
      description: coupon.description ?? "",
      discountType: coupon.discountType === "percent" ? "percent" : "flat",
      discountValue: Number(coupon.discountValue ?? 0),
      minOrderValue: Number(coupon.minOrderValue ?? 0),
      maxDiscount: Number(coupon.maxDiscount ?? 0),
      usageLimit: coupon.usageLimit ? Number(coupon.usageLimit) : undefined,
      perUserLimit: coupon.perUserLimit ? Number(coupon.perUserLimit) : undefined,
      expiresAt: coupon.expiresAt ? String(coupon.expiresAt).slice(0, 10) : "",
      isSpecial: !!coupon.isSpecial,
    });
    setDialogOpen(true);
  };

  const toggleCoupon = async (coupon: any) => {
    await customFetch(`/api/admin/coupons/${coupon.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !coupon.isActive }) });
    refresh();
    toast({ title: !coupon.isActive ? "Coupon activated" : "Coupon deactivated" });
  };

  const deleteCoupon = async (coupon: any) => {
    if (!confirm(`Delete coupon ${coupon.code}?`)) return;
    await customFetch(`/api/admin/coupons/${coupon.id}`, { method: "DELETE" });
    refresh();
    toast({ title: "Coupon deleted" });
  };

  const onSubmit = async (data: FormData) => {
    const payload = {
      code: data.code.trim().toUpperCase(),
      description: data.description.trim(),
      discountType: data.discountType,
      discountValue: String(data.discountValue),
      minOrderValue: data.minOrderValue !== undefined ? String(data.minOrderValue) : "0",
      maxDiscount: data.maxDiscount !== undefined ? String(data.maxDiscount) : undefined,
      usageLimit: data.usageLimit,
      perUserLimit: data.perUserLimit,
      expiresAt: data.expiresAt || undefined,
      isSpecial: !!data.isSpecial,
    } as any;
    if (editing) {
      try {
        await customFetch(`/api/admin/coupons/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        refresh();
        setDialogOpen(false);
        setEditing(null);
        toast({ title: "Coupon updated" });
      } catch (err: unknown) {
        const msg = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
          ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Failed to update coupon";
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
      return;
    }
    create.mutate(
      {
        data: payload
      },
      {
        onSuccess: () => {
          refresh();
          setDialogOpen(false);
          setEditing(null);
          reset();
          toast({ title: "Coupon created" });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
            ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Failed to create coupon";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coupons ({coupons?.length ?? 0})</h1>
        <Button onClick={() => { setEditing(null); reset({ code: "", description: "", discountType: "flat", discountValue: 1, minOrderValue: undefined, maxDiscount: undefined, usageLimit: undefined, perUserLimit: undefined, expiresAt: "", isSpecial: false }); setDialogOpen(true); }} data-testid="btn-create">
          <Plus className="w-4 h-4 mr-2" />Create Coupon
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !coupons?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No coupons yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(coupons as any[]).map((coupon: any) => {
            const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
            return (
              <div key={coupon.id} className={`bg-white border rounded-xl p-4 flex items-start gap-4 ${isExpired ? "opacity-60" : ""}`} data-testid={`coupon-${coupon.id}`}>
                <div className="bg-primary/10 rounded-xl p-3 flex-shrink-0">
                  <Tag className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <code className="font-bold tracking-wider text-primary">{coupon.code}</code>
                    <Badge variant={coupon.isActive && !isExpired ? "default" : "secondary"} className="text-xs">
                      {isExpired ? "Expired" : coupon.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {coupon.isSpecial && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-xs text-amber-700">Special</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{coupon.description}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {coupon.discountType === "flat" ? `â‚¹${Number(coupon.discountValue).toFixed(0)} off` : `${Number(coupon.discountValue).toFixed(0)}% off`}
                      {coupon.maxDiscount ? ` (max â‚¹${Number(coupon.maxDiscount).toFixed(0)})` : ""}
                    </span>
                    {coupon.minOrderValue && <span>Min â‚¹{Number(coupon.minOrderValue).toFixed(0)}</span>}
                    <span>Used {coupon.usedCount ?? 0}{coupon.usageLimit ? `/${coupon.usageLimit}` : ""} times</span>
                    {coupon.expiresAt && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(coupon.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEdit(coupon)} title="Edit coupon">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => toggleCoupon(coupon)} title={coupon.isActive ? "Deactivate" : "Activate"}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => deleteCoupon(coupon)} title="Delete coupon">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Coupon" : "Create Coupon"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code *</Label>
                <Input placeholder="e.g. SAVE20" {...register("code")} data-testid="input-code" />
                {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Type *</Label>
                <Select value={discountType} onValueChange={v => setValue("discountType", v as "flat" | "percent")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat (â‚¹)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description *</Label>
              <Input {...register("description")} data-testid="input-description" />
              {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{discountType === "flat" ? "Amount (â‚¹)" : "Percent (%)"} *</Label>
                <Input type="number" {...register("discountValue")} data-testid="input-value" />
                {errors.discountValue && <p className="text-xs text-red-500">{errors.discountValue.message}</p>}
              </div>
              {discountType === "percent" && (
                <div className="space-y-1">
                  <Label>Max Discount (â‚¹)</Label>
                  <Input type="number" {...register("maxDiscount")} data-testid="input-max" />
                </div>
              )}
              <div className="space-y-1">
                <Label>Min Order (â‚¹)</Label>
                <Input type="number" {...register("minOrderValue")} data-testid="input-min-order" />
              </div>
              <div className="space-y-1">
                <Label>Usage Limit</Label>
                <Input type="number" {...register("usageLimit")} data-testid="input-usage" />
              </div>
              <div className="space-y-1">
                <Label>Per User Limit</Label>
                <Input type="number" {...register("perUserLimit")} data-testid="input-per-user" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Expires At</Label>
              <Input type="date" {...register("expiresAt")} data-testid="input-expires" />
            </div>
            <label className="flex items-start gap-2 rounded-xl border bg-amber-50 p-3 text-sm">
              <input type="checkbox" className="mt-1 accent-primary" {...register("isSpecial")} />
              <span>
                <b>Special coupon</b>
                <span className="block text-xs text-muted-foreground">Only admin can create or edit this flag. Use it for special campaigns.</span>
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending} data-testid="btn-save">
                {create.isPending ? "Saving..." : editing ? "Save Coupon" : "Create Coupon"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
