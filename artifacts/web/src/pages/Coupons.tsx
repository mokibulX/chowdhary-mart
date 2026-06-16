import { useListCoupons, getListCouponsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag, Copy, Clock } from "lucide-react";
import { Link } from "wouter";

export default function Coupons() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: coupons, isLoading } = useListCoupons({
    query: { queryKey: getListCouponsQueryKey() },
  });

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `${code} copied to clipboard` });
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">Offers & Coupons</h1>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !coupons?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No coupons available right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon: any) => {
            const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
            const daysLeft = coupon.expiresAt
              ? Math.ceil((new Date(coupon.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <div
                key={coupon.id}
                className={`border rounded-xl overflow-hidden ${isExpired ? "opacity-60" : ""}`}
              >
                <div className="flex">
                  {/* Left accent */}
                  <div className="bg-primary w-2 flex-shrink-0" />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <code className="text-lg font-bold tracking-wider text-primary">{coupon.code}</code>
                          {isExpired && <Badge variant="secondary" className="text-xs">Expired</Badge>}
                        </div>
                        <p className="text-sm font-medium">{coupon.description}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          {coupon.discountType === "flat" ? (
                            <span>Flat ₹{Number(coupon.discountValue).toFixed(0)} off</span>
                          ) : (
                            <span>{Number(coupon.discountValue).toFixed(0)}% off{coupon.maxDiscount ? ` (max ₹${Number(coupon.maxDiscount).toFixed(0)})` : ""}</span>
                          )}
                          {coupon.minOrderValue && <span>Min order ₹{Number(coupon.minOrderValue).toFixed(0)}</span>}
                          {daysLeft !== null && daysLeft > 0 && (
                            <span className={`flex items-center gap-0.5 ${daysLeft <= 3 ? "text-red-500" : ""}`}>
                              <Clock className="w-3 h-3" />{daysLeft}d left
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(coupon.code)}
                        disabled={isExpired}
                        className="flex-shrink-0 text-primary border-primary/30 hover:bg-primary/5"
                        data-testid={`btn-copy-${coupon.code}`}
                      >
                        <Copy className="w-3 h-3 mr-1" />Copy
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-700">
        Apply coupon codes in the cart before checkout. Only one coupon can be applied per order.
      </div>
    </div>
  );
}
