import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  useListAddresses, useCreateAddress, useUpdateAddress, useDeleteAddress,
  getListAddressesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";

const schema = z.object({
  label: z.string().optional().or(z.literal("")),
  name: z.string().min(2, "Name required"),
  phone: z.string().min(10, "Valid phone required"),
  line1: z.string().min(3, "Address required"),
  line2: z.string().optional().or(z.literal("")),
  city: z.string().min(2, "City required"),
  state: z.string().min(2, "State required"),
  pincode: z.string().length(6, "Valid 6-digit pincode"),
  isDefault: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function Addresses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: addresses, isLoading } = useListAddresses({
    query: { enabled: !!user, queryKey: getListAddressesQueryKey() },
  });
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const del = useDeleteAddress();

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { label: "home", state: "Delhi", isDefault: false },
  });

  const openCreate = () => {
    setEditId(null);
    reset({ label: "home", state: "Delhi", isDefault: false });
    setDialogOpen(true);
  };

  const openEdit = (addr: any) => {
    setEditId(addr.id);
    reset({
      label: addr.label ?? "", name: addr.name, phone: addr.phone,
      line1: addr.line1, line2: addr.line2 ?? "", city: addr.city,
      state: addr.state, pincode: addr.pincode, isDefault: !!addr.isDefault,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    const payload = { ...data, isDefault: data.isDefault ?? false };
    const onSuccess = () => {
      qc.invalidateQueries({ queryKey: getListAddressesQueryKey() });
      setDialogOpen(false);
      toast({ title: editId ? "Address updated" : "Address added" });
    };
    const onError = () => toast({ title: "Failed to save address", variant: "destructive" });
    if (editId) {
      update.mutate({ addressId: editId, data: payload }, { onSuccess, onError });
    } else {
      create.mutate({ data: payload }, { onSuccess, onError });
    }
  };

  const handleDelete = (id: number) => {
    del.mutate({ addressId: id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAddressesQueryKey() });
        toast({ title: "Address deleted" });
      },
    });
  };

  if (!user) return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">sign in</Link></p></div>;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Saved Addresses</h1>
        <Button size="sm" onClick={openCreate} data-testid="btn-add-address">
          <Plus className="w-4 h-4 mr-1" />Add New
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !addresses?.length ? (
        <div className="text-center py-16 space-y-3">
          <MapPin className="w-14 h-14 mx-auto text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No addresses saved yet</p>
          <Button onClick={openCreate}>Add Your First Address</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr: any) => (
            <div key={addr.id} className={`border rounded-xl p-4 ${addr.isDefault ? "border-primary bg-orange-50" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-medium text-sm">{addr.name}</span>
                      {addr.label && <Badge variant="outline" className="text-xs capitalize">{addr.label}</Badge>}
                      {addr.isDefault && <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Default</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}</p>
                    <p className="text-sm text-muted-foreground">{addr.city}, {addr.state} - {addr.pincode}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{addr.phone}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(addr)} data-testid={`btn-edit-${addr.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleDelete(addr.id)} data-testid={`btn-delete-${addr.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Address" : "Add New Address"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Label</Label>
                <Select onValueChange={v => setValue("label", v)} defaultValue="home">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["home", "work", "other"].map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input {...register("name")} data-testid="input-addr-name" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input {...register("phone")} data-testid="input-addr-phone" />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Flat / House No., Street *</Label>
              <Input {...register("line1")} placeholder="e.g. 42B, Sector 14" data-testid="input-addr-line1" />
              {errors.line1 && <p className="text-xs text-red-500">{errors.line1.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Landmark / Area (optional)</Label>
              <Input {...register("line2")} placeholder="e.g. Near Metro Station" data-testid="input-addr-line2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>City *</Label>
                <Input {...register("city")} data-testid="input-addr-city" />
                {errors.city && <p className="text-xs text-red-500">{errors.city.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Pincode *</Label>
                <Input {...register("pincode")} maxLength={6} data-testid="input-addr-pincode" />
                {errors.pincode && <p className="text-xs text-red-500">{errors.pincode.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>State *</Label>
              <Input {...register("state")} data-testid="input-addr-state" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register("isDefault")} className="accent-primary" data-testid="checkbox-default" />
              <span className="text-sm">Set as default address</span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-save-addr">
                {create.isPending || update.isPending ? "Saving..." : "Save Address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
