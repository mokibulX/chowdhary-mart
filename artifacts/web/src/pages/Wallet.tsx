import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useGetWallet,
  useListWalletTransactions,
  getGetMeQueryKey,
  getGetWalletQueryKey,
  getListWalletTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Star, TrendingDown, TrendingUp, Wallet as WalletIcon } from "lucide-react";

export default function Wallet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("500");
  const [upiId, setUpiId] = useState("customer@upi");
  const [isAdding, setIsAdding] = useState(false);

  const { data: wallet, isLoading: loadingWallet } = useGetWallet({
    query: { enabled: !!user, queryKey: getGetWalletQueryKey() },
  });
  const { data: transactions, isLoading: loadingTx } = useListWalletTransactions(
    { limit: 50 },
    { query: { enabled: !!user, queryKey: getListWalletTransactionsQueryKey({ limit: 50 }) } },
  );

  if (!user) return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">sign in</Link></p></div>;

  const addMoney = async () => {
    setIsAdding(true);
    try {
      await customFetch("/api/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), upiId }),
      });
      qc.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      qc.invalidateQueries({ queryKey: getListWalletTransactionsQueryKey({ limit: 50 }) });
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Money added", description: `Rs.${Number(amount).toFixed(0)} added through UPI.` });
    } catch (err) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Payment failed";
      toast({ title: "UPI payment failed", description: msg, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-xl font-bold">Wallet</h1>

      {loadingWallet ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-[#0757ee] to-[#062c9c] p-6 text-white shadow-lg">
          <div className="mb-1 flex items-center gap-2">
            <WalletIcon className="h-5 w-5 opacity-80" />
            <span className="text-sm opacity-80">Chowdhary Mart Wallet</span>
          </div>
          <p className="mt-2 text-4xl font-bold">Rs.{Number(wallet?.balance ?? 0).toFixed(0)}</p>
          <p className="mt-1 text-sm opacity-80">Available Balance</p>
          <div className="mt-4 flex items-center gap-4 border-t border-white/20 pt-4">
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 text-yellow-300" />
              <span className="text-sm">{wallet?.loyaltyPoints ?? 0} Loyalty Points</span>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#0757ee]" />
          <h2 className="font-semibold">Add money with UPI</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[250, 500, 1000, 2000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className={`rounded-lg border px-2 py-2 text-sm font-semibold ${Number(amount) === value ? "border-[#0757ee] bg-blue-50 text-[#0757ee]" : "bg-white"}`}
            >
              Rs.{value}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" min={1} max={50000} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>UPI ID</Label>
            <Input value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@upi" />
          </div>
        </div>
        <Button className="mt-4 w-full" size="lg" onClick={addMoney} disabled={isAdding}>
          {isAdding ? "Processing UPI..." : `Pay Rs.${Number(amount || 0).toFixed(0)} and add money`}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Demo UPI mode. Real gateway keys can be connected later.</p>
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        Checkout currently supports Cash on Delivery and direct UPI payment. Wallet balance is kept for loyalty and future refunds.
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Transaction History</h2>
        {loadingTx ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !transactions?.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No transactions yet</div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${tx.type === "credit" ? "bg-green-100" : "bg-red-100"}`}>
                  {tx.type === "credit" ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-bold ${tx.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                    {tx.type === "credit" ? "+" : "-"}Rs.{Number(tx.amount).toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Bal: Rs.{Number(tx.balance).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
