import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Gift, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function AdminIncentives() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("Order milestone");
  const [partnerUserId, setPartnerUserId] = useState("");
  const [ordersRequired, setOrdersRequired] = useState("5");
  const [bonusAmount, setBonusAmount] = useState("50");
  const [onlineStartTime, setOnlineStartTime] = useState("");
  const [onlineEndTime, setOnlineEndTime] = useState("");
  const { data: rules = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/incentive-rules"],
    queryFn: () => customFetch<any[]>("/api/admin/incentive-rules"),
  });
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users", "delivery_partner"],
    queryFn: () => customFetch<any[]>("/api/admin/users?role=delivery_partner&limit=100"),
  });
  const createRule = useMutation({
    mutationFn: () => customFetch<any>("/api/admin/incentive-rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        partnerUserId: partnerUserId ? Number(partnerUserId) : null,
        ordersRequired: Number(ordersRequired),
        bonusAmount: Number(bonusAmount),
        onlineStartTime: onlineStartTime || null,
        onlineEndTime: onlineEndTime || null,
      }),
      responseType: "json",
    }),
    onSuccess: () => {
      toast({ title: "Incentive rule saved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/incentive-rules"] });
      setName("Order milestone");
      setPartnerUserId("");
      setOrdersRequired("5");
      setBonusAmount("50");
      setOnlineStartTime("");
      setOnlineEndTime("");
    },
    onError: (error: any) => toast({ title: error?.data?.error ?? "Could not save incentive rule", variant: "destructive" }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/incentive-rules/${id}`, { method: "DELETE", responseType: "json" }),
    onSuccess: () => {
      toast({ title: "Incentive rule deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/incentive-rules"] });
    },
    onError: () => toast({ title: "Could not delete incentive rule", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Partner incentives</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set extra earnings for every partner or for one delivery partner.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Gift className="h-5 w-5 text-orange-600" /> Create incentive rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Rule name<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend milestone" /></label>
            <label className="space-y-1 text-sm font-medium">Partner<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={partnerUserId} onChange={(event) => setPartnerUserId(event.target.value)}><option value="">All delivery partners</option>{users.map((partner: any) => <option key={partner.id} value={partner.id}>{partner.name || partner.email || `Partner ${partner.id}`}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">Completed orders required<Input type="number" min="0" step="1" value={ordersRequired} onChange={(event) => setOrdersRequired(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium">Extra earning (Rs.)<Input type="number" min="0.01" step="0.01" value={bonusAmount} onChange={(event) => setBonusAmount(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium">Online from (optional)<Input type="time" value={onlineStartTime} onChange={(event) => setOnlineStartTime(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium">Online until (optional)<Input type="time" value={onlineEndTime} onChange={(event) => setOnlineEndTime(event.target.value)} /></label>
          </div>
          <Button type="button" onClick={() => createRule.mutate()} disabled={createRule.isPending || !name.trim() || Number(bonusAmount) <= 0}>
            <Gift className="mr-2 h-4 w-4" /> {createRule.isPending ? "Saving..." : "Save incentive rule"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Configured rules</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y rounded-lg border">
            {isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading incentive rules...</p> : !rules.length ? <p className="p-3 text-sm text-muted-foreground">No incentive rules configured.</p> : rules.map((rule: any) => {
              const partner = users.find((item: any) => Number(item.id) === Number(rule.partnerUserId));
              const cadence = Number(rule.ordersRequired) > 0 ? `after every ${rule.ordersRequired} completed orders` : "on every completed order";
              const window = rule.onlineStartTime && rule.onlineEndTime ? ` · online ${rule.onlineStartTime}-${rule.onlineEndTime}` : "";
              return <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-semibold">{rule.name} <span className="font-normal text-muted-foreground">· {partner?.name || partner?.email || "All partners"}</span></p><p className="text-muted-foreground">₹{Number(rule.bonusAmount).toFixed(2)} {cadence}{window}</p></div><Button type="button" variant="ghost" size="icon" className="text-red-600" aria-label={`Delete ${rule.name}`} onClick={() => deleteRule.mutate(Number(rule.id))} disabled={deleteRule.isPending}><Trash2 className="h-4 w-4" /></Button></div>;
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
