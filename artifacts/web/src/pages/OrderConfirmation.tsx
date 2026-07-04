import { Link, useParams } from "wouter";
import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, MapPin, Navigation, Package } from "lucide-react";

export default function OrderConfirmation() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const { user } = useAuth();

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id && !!user, queryKey: getGetOrderQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    );
  }

  if (!order) return <div className="py-16 text-center text-muted-foreground">Order not found.</div>;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section className="rounded-lg border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <Badge className="mb-3 bg-green-100 text-green-700 hover:bg-green-100">Order confirmed</Badge>
        <h1 className="text-2xl font-bold">Thank you for shopping with Chowdhary Mart</h1>
        <p className="mt-2 text-sm text-muted-foreground">Order #{order.orderNumber} has been placed successfully.</p>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-orange-50 p-3">
            <Clock className="mb-2 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">ETA</p>
            <p className="font-bold">{order.estimatedDeliveryMins ?? 40} min</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3">
            <Package className="mb-2 h-5 w-5 text-blue-600" />
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-bold capitalize">{order.status.replace(/_/g, " ")}</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3">
            <MapPin className="mb-2 h-5 w-5 text-green-700" />
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold">Rs.{Number(order.total).toFixed(0)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/track/${id}`}>
          <Button className="w-full" size="lg">
            <Navigation className="mr-2 h-4 w-4" />Track live
          </Button>
        </Link>
        <Link href={`/orders/${id}`}>
          <Button variant="outline" className="w-full" size="lg">View details</Button>
        </Link>
      </div>
    </div>
  );
}
