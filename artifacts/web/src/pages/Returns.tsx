import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PackageOpen, RotateCcw } from "lucide-react";

const REASONS = ["Product damaged on delivery", "Broken or leaked item", "Damaged package and item"];

export default function Returns() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: orders } = useListOrders({ limit: 50 }, { query: { queryKey: getListOrdersQueryKey({ limit: 50 }) } });
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["/api/returns"],
    queryFn: () => customFetch<any[]>("/api/returns"),
  });

  const returnableOrders = useMemo(() => (orders ?? []).filter((order: any) => !["cancelled"].includes(order.status)), [orders]);
  const selectedOrder = returnableOrders.find((order: any) => String(order.id) === orderId);
  const selectedItems = selectedOrder?.items ?? [];

  const submitReturn = async () => {
    if (!orderId || !productId) {
      toast({ title: "Order and product required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await customFetch("/api/returns", {
        method: "POST",
        body: JSON.stringify({ orderId: Number(orderId), productId: Number(productId), reason, details }),
      });
      qc.invalidateQueries({ queryKey: ["/api/returns"] });
      setOpen(false);
      setDetails("");
      toast({ title: "Return request submitted", description: "You can track it from My Returns." });
    } catch (err) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Return request failed";
      toast({ title: "Return failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">My Returns</h1>
          <p className="text-sm text-muted-foreground">Only damaged items are eligible for return support.</p>
        </div>
        <Button onClick={() => setOpen(true)}><RotateCcw className="mr-2 h-4 w-4" />New Return</Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">Loading returns...</div>
      ) : returns.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <PackageOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold">No return requests yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a return only when an ordered item arrives damaged.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>Request return</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((item: any) => (
            <div key={item.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gray-50">
                  {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-contain p-1" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="line-clamp-1 font-semibold">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">Order #{item.orderNumber}</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{String(item.status).replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                  <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs">
                    {(item.timeline ?? []).map((step: any) => (
                      <div key={step.status} className="flex justify-between gap-2 py-1">
                        <span className="font-medium">{String(step.status).replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{step.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl">
          <DialogHeader><DialogTitle>Request a Return</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Return requests are allowed only for damaged items. Please add clear details so support can verify it.
            </div>
            <div className="space-y-1">
              <Label>Order</Label>
              <Select value={orderId} onValueChange={(value) => { setOrderId(value); setProductId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>
                  {returnableOrders.map((order: any) => (
                    <SelectItem key={order.id} value={String(order.id)}>#{order.orderNumber} - Rs.{Number(order.total).toFixed(0)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId} disabled={!selectedItems.length}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {selectedItems.map((item: any) => (
                    <SelectItem key={item.productId ?? item.id} value={String(item.productId ?? item.id)}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Details</Label>
              <Textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add more details for pickup/replacement..." />
            </div>
            <Button className="w-full" onClick={submitReturn} disabled={saving}>{saving ? "Submitting..." : "Submit return request"}</Button>
            <Link href="/orders" className="block text-center text-sm text-primary">View orders</Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
