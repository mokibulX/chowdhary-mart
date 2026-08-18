import { useState } from "react";
import { customFetch, getListVendorOrdersQueryKey, useListVendorOrders, useUpdateOrderStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Eye, FileText, Package, Printer, XCircle } from "lucide-react";

const NEXT_STATUS: Record<string, string> = { pending: "confirmed", confirmed: "packed", preparing: "packed" };
const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700",
  preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700",
  picked_up: "bg-indigo-100 text-indigo-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  packed: "Packed",
  picked_up: "Picked Up",
  on_the_way: "On the Way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const NEXT_LABEL: Record<string, string> = { pending: "Accept order", confirmed: "Mark ready", preparing: "Mark ready" };
type PrintType = "customer_bill" | "packing_slip" | "preparation_slip";
const SELLER_REJECT_REASONS = ["Product out of stock", "Shop closed", "Unable to prepare", "Wrong product price", "Too many active orders", "Product unavailable", "Shop temporarily unavailable", "Delivery service unavailable", "Other"];
const SELLER_CANCEL_REASONS = ["Items became unavailable", "Shop emergency", "Unable to prepare on time", "Technical issue", "Shop closing", "Incorrect stock", "Other"];

export default function VendorOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [paperSize, setPaperSize] = useState("80mm");
  const [printType, setPrintType] = useState<PrintType>("customer_bill");
  const [decisionOrder, setDecisionOrder] = useState<any | null>(null);
  const [decisionType, setDecisionType] = useState<"reject" | "cancel" | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const params = filter !== "all" ? { status: filter } : {};
  const { data: orders, isLoading } = useListVendorOrders(params, {
    query: { enabled: !!user, queryKey: getListVendorOrdersQueryKey(params), refetchInterval: 5000 },
  });
  const updateStatus = useUpdateOrderStatus();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey({}) });
    qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey(params) });
  };

  const handleUpdate = (orderId: number, status: string) => {
    updateStatus.mutate(
      { orderId, data: { status } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Order updated to ${STATUS_LABEL[status] ?? status}` });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      },
    );
  };

  const openDecision = (order: any, type: "reject" | "cancel") => {
    setDecisionOrder(order);
    setDecisionType(type);
    setDecisionReason("");
    setCustomReason("");
  };

  const submitDecision = () => {
    if (!decisionOrder || !decisionType) return;
    const reason = decisionReason === "Other" ? customReason.trim() : decisionReason;
    if (!reason) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    updateStatus.mutate(
      { orderId: decisionOrder.id, data: { status: "cancelled", reason } as any },
      {
        onSuccess: () => {
          refresh();
          toast({ title: decisionType === "reject" ? "Order rejected" : "Accepted order cancelled", description: reason });
          setDecisionOrder(null);
          setDecisionType(null);
        },
        onError: (error: any) => toast({ title: error?.data?.error ?? "Action failed", variant: "destructive" }),
      },
    );
  };

  const logAndPrint = async (order: any, type: PrintType, duplicate = false) => {
    try {
      await customFetch(`/api/vendor/orders/${order.id}/print`, {
        method: "POST",
        body: JSON.stringify({ printType: type, paperSize, duplicate }),
        responseType: "json",
      });
      const popup = window.open("", "_blank", "width=420,height=720");
      if (!popup) {
        toast({ title: "Popup blocked", description: "Allow popup to print bill.", variant: "destructive" });
        return;
      }
      popup.document.write(buildPrintHtml(order, type, paperSize, duplicate));
      popup.document.close();
      popup.focus();
      setTimeout(() => popup.print(), 250);
      refresh();
      toast({ title: type === "customer_bill" ? "Bill ready" : "Slip ready", description: `${paperSize} print preview opened.` });
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error ?? "Print failed";
      toast({ title: message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Orders</h1>
          <p className="text-sm text-muted-foreground">Order details, item snapshots, bill and packing slip printing.</p>
        </div>
        <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {["all", "pending", "confirmed", "packed", "picked_up", "on_the_way", "delivered", "cancelled"].map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="shrink-0 whitespace-nowrap" data-testid={`filter-${f}`}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : !orders?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>No orders {filter !== "all" ? `with status "${STATUS_LABEL[filter]}"` : "yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(orders as any[]).map((order: any) => {
            const nextStatus = NEXT_STATUS[order.status];
            const pickupOtp = order.tracking?.pickupOtp ?? order.liveTracking?.pickupOtp;
            return (
              <div key={order.id} className="rounded-xl border bg-white p-4" data-testid={`order-${order.id}`}>
                <div className="mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="max-w-full break-all font-bold">#{order.orderNumber}</span>
                      <Badge className={`border-0 text-xs ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod} / {order.paymentStatus}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-xs text-muted-foreground">Invoice: {order.invoiceNumber ?? "Will generate on print"}</p>
                  </div>
                  <span className="whitespace-nowrap text-base font-bold sm:text-lg">Rs.{Number(order.total).toFixed(0)}</span>
                </div>

                {order.addressSnapshot && (
                  <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Deliver to: {maskIfClosed(order, order.addressSnapshot.name)} · {maskIfClosed(order, order.addressSnapshot.phone)}</p>
                    <p>{maskAddressIfClosed(order, order.addressSnapshot)}</p>
                  </div>
                )}

                <div className="mb-3 space-y-2">
                  {(order.items ?? []).map((item: any) => <OrderItemRow key={item.orderItemId ?? item.id} item={item} />)}
                </div>

                {["confirmed", "packed"].includes(order.status) && pickupOtp && (
                  <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    <p className="font-semibold">Pickup OTP for delivery partner</p>
                    <p className="mt-1 text-2xl font-bold tracking-widest">{pickupOtp}</p>
                    <p className="text-xs">Give this OTP only after the partner reaches your shop and receives the product.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)} data-testid={`btn-view-${order.id}`}>
                    <Eye className="mr-2 h-4 w-4" />Details
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => logAndPrint(order, "customer_bill")} data-testid={`btn-print-${order.id}`}>
                    <Printer className="mr-2 h-4 w-4" />Print bill
                  </Button>
                  {order.status === "pending" && (
                    <Button size="sm" variant="destructive" onClick={() => openDecision(order, "reject")} disabled={updateStatus.isPending} data-testid={`btn-reject-${order.id}`}>
                      <XCircle className="mr-2 h-4 w-4" />Reject
                    </Button>
                  )}
                  {["confirmed", "packed", "preparing"].includes(order.status) && (
                    <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => openDecision(order, "cancel")} disabled={updateStatus.isPending} data-testid={`btn-cancel-accepted-${order.id}`}>
                      <AlertTriangle className="mr-2 h-4 w-4" />Cancel accepted
                    </Button>
                  )}
                  {nextStatus && !["delivered", "cancelled"].includes(order.status) && (
                    <Button size="sm" onClick={() => handleUpdate(order.id, nextStatus)} disabled={updateStatus.isPending} data-testid={`btn-next-${order.id}`}>
                      {NEXT_LABEL[order.status] ?? `Mark ${STATUS_LABEL[nextStatus]}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Seller order details</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Info label="Order ID" value={`#${selectedOrder.orderNumber}`} />
                <Info label="Invoice" value={selectedOrder.invoiceNumber ?? "Will generate"} />
                <Info label="Deadline" value="40 minutes" />
                <Info label="Payment" value={`${selectedOrder.paymentMethod} / ${selectedOrder.paymentStatus}`} />
                <Info label="Status" value={STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status} />
                <Info label="Pickup OTP" value={selectedOrder.tracking?.pickupOtp ?? "After accept"} />
              </div>

              <div className="rounded-xl border bg-white p-4">
                <h3 className="mb-2 font-semibold">Customer fulfilment info</h3>
                <p className="text-sm">{maskIfClosed(selectedOrder, selectedOrder.addressSnapshot?.name)} · {maskIfClosed(selectedOrder, selectedOrder.addressSnapshot?.phone)}</p>
                <p className="text-sm text-muted-foreground">{maskAddressIfClosed(selectedOrder, selectedOrder.addressSnapshot)}</p>
                <p className="mt-2 text-xs text-muted-foreground">Exact customer details are hidden after delivery/cancellation.</p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <h3 className="mb-3 font-semibold">Ordered products</h3>
                <div className="space-y-2">{(selectedOrder.items ?? []).map((item: any) => <OrderItemRow key={item.orderItemId ?? item.id} item={item} detailed />)}</div>
              </div>

              <div className="rounded-xl border bg-gray-50 p-4">
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <Select value={paperSize} onValueChange={setPaperSize}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm thermal</SelectItem>
                      <SelectItem value="80mm">80mm thermal</SelectItem>
                      <SelectItem value="A4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={printType} onValueChange={(value) => setPrintType(value as PrintType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer_bill">Customer bill</SelectItem>
                      <SelectItem value="packing_slip">Packing slip</SelectItem>
                      <SelectItem value="preparation_slip">Preparation slip</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mb-3 rounded-lg border bg-white p-3 text-xs">
                  <div dangerouslySetInnerHTML={{ __html: buildReceiptBody(selectedOrder, printType, false) }} />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button onClick={() => logAndPrint(selectedOrder, printType)}><Printer className="mr-2 h-4 w-4" />Print</Button>
                  <Button variant="outline" onClick={() => logAndPrint(selectedOrder, "packing_slip")}><FileText className="mr-2 h-4 w-4" />Packing slip</Button>
                  <Button variant="outline" onClick={() => logAndPrint(selectedOrder, "customer_bill", true)}>Duplicate bill</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisionOrder} onOpenChange={(open) => !open && setDecisionOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decisionType === "reject" ? "Reject this order?" : "Cancel accepted order?"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {decisionType === "reject"
                ? "Are you sure you want to reject this order? Backend success hole stock, refund, customer notification and audit update hobe."
                : "Accepted order cancel korle delivery matching stop hobe, stock release hobe and customer/admin notification jabe."}
            </p>
            <div className="grid gap-2">
              {(decisionType === "reject" ? SELLER_REJECT_REASONS : SELLER_CANCEL_REASONS).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${decisionReason === reason ? "border-primary bg-primary/10 text-primary" : "bg-white hover:bg-gray-50"}`}
                  onClick={() => setDecisionReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            {decisionReason === "Other" && (
              <Textarea placeholder="Write reason..." value={customReason} onChange={(event) => setCustomReason(event.target.value)} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setDecisionOrder(null)} disabled={updateStatus.isPending}>Go Back</Button>
              <Button variant="destructive" onClick={submitDecision} disabled={updateStatus.isPending}>
                {updateStatus.isPending ? "Saving..." : decisionType === "reject" ? "Confirm Reject" : "Confirm Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderItemRow({ item, detailed = false }: { item: any; detailed?: boolean }) {
  const variant = [item.variantName, item.size && `Size ${item.size}`, (item.colour || item.color) && `Color ${item.colour ?? item.color}`, item.weight && `${item.weight} ${item.unit ?? ""}`].filter(Boolean).join(" · ") || "Standard";
  return (
    <div className="grid grid-cols-[54px_1fr_auto] gap-3 rounded-lg border bg-white p-2">
      <div className="h-14 w-14 overflow-hidden rounded-md bg-gray-50">
        {item.productImage || item.imageUrl ? <img src={item.productImage ?? item.imageUrl} alt={item.productName ?? item.name} className="h-full w-full object-cover" /> : <Package className="m-4 h-6 w-6 text-gray-300" />}
      </div>
      <div className="min-w-0 text-sm">
        <p className="line-clamp-1 font-semibold">{item.productName ?? item.name}</p>
        <p className="text-xs text-muted-foreground">{variant}</p>
        <p className="text-xs text-muted-foreground">SKU: {item.sku ?? `SKU-${item.productId}`} · Barcode: {item.barcode ?? "N/A"}</p>
        {detailed && <p className="text-xs text-muted-foreground">Brand: {item.brandName ?? "Chowdhary Mart"} · Stock at order: {item.stockAvailableAtOrder ?? "-"}</p>}
      </div>
      <div className="text-right text-sm">
        <p className="font-bold">Rs.{Number(item.itemTotal ?? item.total ?? 0).toFixed(0)}</p>
        <p className="text-xs text-muted-foreground">{item.quantity ?? item.qty} x Rs.{Number(item.sellingPrice ?? item.price ?? 0).toFixed(0)}</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold capitalize">{value}</p></div>;
}

function isClosedOrder(order: any) {
  return ["delivered", "cancelled"].includes(order?.status);
}

function maskIfClosed(order: any, value = "") {
  if (!isClosedOrder(order)) return value || "-";
  const text = String(value || "");
  if (/\d{6,}/.test(text)) return `******${text.slice(-4)}`;
  return text ? `${text.slice(0, 2)}***` : "-";
}

function maskAddressIfClosed(order: any, address: any = {}) {
  if (!address) return "-";
  if (isClosedOrder(order)) return `${address.city ?? "Area"} - ${address.pincode ?? ""}`;
  return [address.line1, address.line2, address.city, address.pincode].filter(Boolean).join(", ");
}

function buildReceiptBody(order: any, type: PrintType, duplicate: boolean) {
  const shop = order.store ?? {};
  const customer = order.addressSnapshot ?? {};
  const mrpTotal = (order.items ?? []).reduce((sum: number, item: any) => sum + Number(item.mrp ?? item.sellingPrice ?? item.price ?? 0) * Number(item.quantity ?? item.qty ?? 1), 0);
  const subtotal = Number(order.subtotal ?? 0);
  const coupon = Number(order.couponDiscount ?? 0);
  const delivery = Number(order.deliveryFee ?? 0);
  const total = Number(order.total ?? 0);
  const saved = Math.max(0, mrpTotal - subtotal + coupon);
  const rows = (order.items ?? []).map((item: any, index: number) => {
    const name = item.productName ?? item.name;
    const variant = [item.variantName, item.size, item.colour ?? item.color, item.weight && `${item.weight} ${item.unit ?? ""}`].filter(Boolean).join(" / ");
    if (type === "customer_bill") {
      return `<tr><td>${index + 1}</td><td><b>${escapeHtml(name)}</b><br/><small>Variant: ${escapeHtml(variant || "Standard")}</small></td><td class="right">${item.quantity ?? item.qty}</td><td class="right">Rs.${Number(item.sellingPrice ?? item.price ?? 0).toFixed(0)}</td><td class="right">Rs.${Number(item.discountAmount ?? 0).toFixed(0)}</td><td class="right">Rs.${Number(item.taxAmount ?? 0).toFixed(0)}</td><td class="right"><b>Rs.${Number(item.itemTotal ?? item.total ?? 0).toFixed(0)}</b></td></tr>`;
    }
    return `<div class="check">[ ] <b>${escapeHtml(name)}</b><br/><small>${variant ? `Variant: ${escapeHtml(variant)} - ` : ""}Qty ${item.quantity ?? item.qty}</small></div>`;
  }).join("");
  const duplicateLabel = duplicate ? `<div class="duplicate">DUPLICATE COPY</div>` : "";
  const cancelled = order.status === "cancelled" ? `<div class="watermark">CANCELLED</div>` : "";
  if (type !== "customer_bill") {
    return `${duplicateLabel}${cancelled}<div class="brand"><h2>CHOWDHARY MART</h2><p>${type === "packing_slip" ? "PACKING SLIP" : "PREPARATION SLIP"}</p></div><div class="box"><b>Order:</b> ${escapeHtml(order.orderNumber)}<br/><b>Time:</b> ${new Date(order.createdAt).toLocaleString("en-IN")}<br/><b>Shop:</b> ${escapeHtml(shop.name ?? "Seller store")}</div><hr/>${rows}<hr/><div class="box"><b>Customer:</b> ${escapeHtml(maskIfClosed(order, customer.name))}<br/><b>Area:</b> ${escapeHtml(customer.city ?? "")} ${escapeHtml(customer.pincode ?? "")}<br/><b>Instruction:</b> ${escapeHtml(order.notes ?? "No special instruction")}</div>${type === "packing_slip" ? `<div class="otp">Pickup OTP: ${order.tracking?.pickupOtp ?? "After accept"}</div>` : ""}`;
  }
  const cashToCollect = order.paymentMethod === "cod" ? Number(order.total ?? 0) : 0;
  return `${duplicateLabel}${cancelled}
    <div class="brand"><div class="logo">CM</div><h2>CHOWDHARY MART</h2><p>TAX INVOICE / CUSTOMER RECEIPT</p></div>
    <div class="shop"><b>${escapeHtml(shop.name ?? "Seller store")}</b><br/>${escapeHtml(shop.address ?? "Local store")}<br/>${shop.phone ? `Mobile: ${escapeHtml(shop.phone)}<br/>` : ""}${shop.gstin ? `GSTIN: ${escapeHtml(shop.gstin)}<br/>` : ""}${shop.fssai ? `FSSAI: ${escapeHtml(shop.fssai)}<br/>` : ""}</div>
    <div class="meta"><span>Invoice: <b>${escapeHtml(order.invoiceNumber ?? "Pending")}</b></span><span>Order: <b>${escapeHtml(order.orderNumber)}</b></span><span>Date: ${new Date(order.createdAt).toLocaleString("en-IN")}</span><span>Payment: <b>${escapeHtml(order.paymentMethod)} / ${escapeHtml(order.paymentStatus)}</b></span></div>
    <div class="badge">${order.paymentMethod === "cod" ? "CASH ON DELIVERY" : "PAID ONLINE"}</div>
    <div class="box"><b>Customer</b><br/>${escapeHtml(maskIfClosed(order, customer.name))}<br/>Phone: ${escapeHtml(maskIfClosed(order, customer.phone))}<br/>Address: ${escapeHtml(maskAddressIfClosed(order, customer))}<br/>Instruction: ${escapeHtml(order.notes ?? "No special instruction")}</div>
    <table><thead><tr><th>Sl.</th><th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Disc</th><th class="right">Tax</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="summary"><div class="line"><span>MRP Total</span><b>Rs.${mrpTotal.toFixed(0)}</b></div><div class="line"><span>Product Discount</span><b>-Rs.${Math.max(0, mrpTotal - subtotal).toFixed(0)}</b></div><div class="line"><span>Coupon Discount</span><b>-Rs.${coupon.toFixed(0)}</b></div><div class="line"><span>Subtotal</span><b>Rs.${subtotal.toFixed(0)}</b></div><div class="line"><span>Delivery Charge</span><b>Rs.${delivery.toFixed(0)}</b></div><div class="line"><span>Platform/Handling</span><b>Rs.${Number(order.platformFee ?? 0).toFixed(0)}</b></div><div class="line total"><span>Grand Total</span><b>Rs.${total.toFixed(0)}</b></div><div class="line collect"><span>${cashToCollect ? "CASH TO COLLECT" : "PAID AMOUNT"}</span><b>Rs.${cashToCollect ? cashToCollect.toFixed(0) : total.toFixed(0)}</b></div></div>
    ${saved > 0 ? `<div class="saving">YOU SAVED Rs.${saved.toFixed(0)}</div>` : ""}
    <div class="qr">QR: CM-${escapeHtml(order.orderNumber)}</div>
    <p class="center">Thank you for shopping with<br/><b>ChowdharyMart</b><br/><small>Damage items return only. Support: support@chowdharymart.local</small></p>`;
}

function buildPrintHtml(order: any, type: PrintType, paper: string, duplicate: boolean) {
  const width = paper === "58mm" ? "58mm" : paper === "A4" ? "210mm" : "80mm";
  return `<!doctype html><html><head><title>Print ${order.orderNumber}</title><style>@page{size:${width} auto;margin:4mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:${width};margin:0 auto;color:#111;font-size:${paper === "A4" ? "13px" : "11px"};line-height:1.35}h2{text-align:center;margin:2px 0;font-size:${paper === "A4" ? "20px" : "14px"};letter-spacing:0}.brand{text-align:center;border-bottom:1px solid #111;padding-bottom:6px;margin-bottom:6px}.brand p{margin:0;font-weight:700}.logo{display:inline-flex;border:1px solid #111;border-radius:50%;height:28px;width:28px;align-items:center;justify-content:center;font-weight:800}.shop,.box,.summary,.meta{border:1px solid #111;padding:6px;margin:6px 0}.meta{display:grid;gap:2px}.badge,.duplicate,.watermark,.saving,.otp,.qr{text-align:center;font-weight:800;border:1px solid #111;padding:4px;margin:6px 0}.watermark{font-size:1.3em}.line{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.total{font-size:1.18em;border-top:1px solid #111;padding-top:5px}.collect{border-top:1px dashed #111;padding-top:4px}.center{text-align:center}.check{margin:7px 0;break-inside:avoid}small{font-size:.86em;color:#333}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border-bottom:1px solid #ddd;padding:4px 2px;text-align:left;vertical-align:top;word-break:break-word}th{border-bottom:1px solid #111}.right{text-align:right}@media print{button{display:none}}</style></head><body>${buildReceiptBody(order, type, duplicate)}</body></html>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}
