import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CheckCircle2, CreditCard, Save, Send, Star, TrendingDown, TrendingUp, Wallet as WalletIcon, XCircle } from "lucide-react";

export default function Wallet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("500");
  const [upiId, setUpiId] = useState("customer@upi");
  const [isAdding, setIsAdding] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("8");
  const [sellerCycle, setSellerCycle] = useState("weekly");
  const [deliveryCycle, setDeliveryCycle] = useState("weekly");
  const [transferAmount, setTransferAmount] = useState("500");
  const [transferMethod, setTransferMethod] = useState<"upi" | "bank">("upi");
  const [transferUpi, setTransferUpi] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const { data: wallet, isLoading: loadingWallet } = useGetWallet({
    query: { enabled: !!user, queryKey: getGetWalletQueryKey() },
  });
  const { data: transactions, isLoading: loadingTx } = useListWalletTransactions(
    { limit: 50 },
    { query: { enabled: !!user, queryKey: getListWalletTransactionsQueryKey({ limit: 50 }) } },
  );
  const { data: adminWallets } = useQuery({
    queryKey: ["/api/admin/wallets"],
    queryFn: () => customFetch<any[]>("/api/admin/wallets"),
    enabled: user?.role === "admin",
  });
  const { data: payoutSettings } = useQuery({
    queryKey: ["/api/admin/payout-settings"],
    queryFn: async () => {
      const settings = await customFetch<any>("/api/admin/payout-settings");
      setCommissionPercent(String(settings.adminCommissionPercent ?? 8));
      setSellerCycle(settings.sellerPayoutCycle ?? "weekly");
      setDeliveryCycle(settings.deliveryPayoutCycle ?? "weekly");
      return settings;
    },
    enabled: user?.role === "admin",
  });
  const { data: withdrawals } = useQuery({
    queryKey: ["/api/wallet/withdrawals"],
    queryFn: () => customFetch<any[]>("/api/wallet/withdrawals"),
    enabled: !!user,
  });
  const { data: adminWithdrawals } = useQuery({
    queryKey: ["/api/admin/wallet-withdrawals"],
    queryFn: () => customFetch<any[]>("/api/admin/wallet-withdrawals"),
    enabled: user?.role === "admin",
  });

  if (!user) return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">sign in</Link></p></div>;
  const roleLabel = user.role === "admin" ? "Admin" : user.role === "vendor" ? "Seller" : user.role === "delivery_partner" ? "Delivery Partner" : "Customer";
  const canTopUp = user.role !== "delivery_partner";

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

  const savePayoutSettings = async () => {
    await customFetch("/api/admin/payout-settings", {
      method: "PATCH",
      body: JSON.stringify({
        adminCommissionPercent: Number(commissionPercent),
        sellerPayoutCycle: sellerCycle,
        deliveryPayoutCycle: deliveryCycle,
      }),
    });
    qc.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
    toast({ title: "Payout settings saved", description: "New orders will use this commission and payout cycle." });
  };

  const refreshWallet = () => {
    qc.invalidateQueries({ queryKey: getGetWalletQueryKey() });
    qc.invalidateQueries({ queryKey: getListWalletTransactionsQueryKey({ limit: 50 }) });
    qc.invalidateQueries({ queryKey: ["/api/wallet/withdrawals"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/wallet-withdrawals"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
    qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const requestTransfer = async () => {
    setIsTransferring(true);
    try {
      await customFetch("/api/wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(transferAmount),
          method: transferMethod,
          upiId: transferUpi,
          accountName,
          accountNumber,
          ifsc,
        }),
      });
      refreshWallet();
      toast({ title: user.role === "admin" ? "Transfer completed" : "Transfer request sent", description: user.role === "admin" ? "Money has been debited from admin wallet." : "Admin approval hole bank/UPI transfer complete hobe." });
    } catch (err) {
      const msg = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Transfer request failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsTransferring(false);
    }
  };

  const reviewWithdrawal = async (request: any, action: "approve" | "reject") => {
    await customFetch(`/api/admin/wallet-withdrawals/${request.id}/${action}`, {
      method: "POST",
      body: JSON.stringify(action === "reject" ? { reason: "Rejected by admin" } : {}),
    });
    refreshWallet();
    toast({ title: action === "approve" ? "Transfer approved" : "Transfer rejected" });
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-xl font-bold">{roleLabel} Wallet</h1>

      {loadingWallet ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-[#0757ee] to-[#062c9c] p-6 text-white shadow-lg">
          <div className="mb-1 flex items-center gap-2">
            <WalletIcon className="h-5 w-5 opacity-80" />
            <span className="text-sm opacity-80">Chowdhary Mart {roleLabel} Wallet</span>
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

      {canTopUp && <section className="rounded-xl border bg-white p-4 shadow-sm">
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
      </section>}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        {user.role === "delivery_partner"
          ? "Delivery earnings are credited after successful OTP-verified delivery."
          : user.role === "vendor"
            ? "Online order payments and seller settlements are credited here."
            : user.role === "admin"
              ? "Admin wallet tracks marketplace funds, manual topups and settlement history."
              : "Checkout currently supports Cash on Delivery and direct UPI payment. Wallet balance is kept for loyalty and future refunds."}
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-5 w-5 text-[#0757ee]" />
          <div>
            <h2 className="font-semibold">Transfer to bank or UPI</h2>
            <p className="text-xs text-muted-foreground">{user.role === "admin" ? "Admin transfers instantly." : "Transfer will complete after admin approval."}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setTransferMethod("upi")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${transferMethod === "upi" ? "border-primary bg-blue-50 text-primary" : "bg-white"}`}>UPI</button>
          <button type="button" onClick={() => setTransferMethod("bank")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${transferMethod === "bank" ? "border-primary bg-blue-50 text-primary" : "bg-white"}`}>Bank</button>
        </div>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" min={10} value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} />
          </div>
          {transferMethod === "upi" ? (
            <div className="space-y-1">
              <Label>UPI ID</Label>
              <Input value={transferUpi} onChange={(event) => setTransferUpi(event.target.value)} placeholder="name@upi" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Account holder name</Label>
                <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Account holder" />
              </div>
              <div className="space-y-1">
                <Label>Account number</Label>
                <Input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="Bank account number" />
              </div>
              <div className="space-y-1">
                <Label>IFSC</Label>
                <Input value={ifsc} onChange={(event) => setIfsc(event.target.value.toUpperCase())} placeholder="SBIN0000001" />
              </div>
            </div>
          )}
          <Button className="w-full" onClick={requestTransfer} disabled={isTransferring}>
            {isTransferring ? "Processing..." : user.role === "admin" ? "Transfer now" : "Request transfer"}
          </Button>
        </div>
      </section>

      {user.role === "admin" && (
        <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-semibold">Admin payout controls</h2>
            <p className="text-xs text-muted-foreground">Set commission and weekly payout policy for seller and delivery partner wallets.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Admin commission (%)</Label>
              <Input type="number" min={0} max={40} value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Seller payout</Label>
              <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={sellerCycle} onChange={(event) => setSellerCycle(event.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Delivery payout</Label>
              <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={deliveryCycle} onChange={(event) => setDeliveryCycle(event.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <Button onClick={savePayoutSettings}>
            <Save className="mr-2 h-4 w-4" /> Save payout policy
          </Button>
          {payoutSettings && (
            <p className="text-xs text-muted-foreground">
              Current policy: {payoutSettings.adminCommissionPercent}% commission, seller {payoutSettings.sellerPayoutCycle}, delivery {payoutSettings.deliveryPayoutCycle}.
            </p>
          )}
        </section>
      )}

      {user.role === "admin" && (
        <section>
          <h2 className="mb-3 font-semibold">All wallet access</h2>
          <div className="grid gap-2">
            {(adminWallets ?? []).map((walletUser: any) => (
              <div key={walletUser.id} className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{walletUser.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{walletUser.role?.replace("_", " ")} | {walletUser.email || walletUser.phone || "No contact"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Rs.{Number(walletUser.walletBalance ?? 0).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{walletUser.transactionCount ?? 0} tx</p>
                  </div>
                </div>
                {walletUser.transactions?.[0] && (
                  <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">Last: {walletUser.transactions[0].description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {user.role === "admin" && (
        <section>
          <h2 className="mb-3 font-semibold">Pending transfer approvals</h2>
          <div className="space-y-2">
            {(adminWithdrawals ?? []).filter((item: any) => item.status === "pending").map((request: any) => (
              <div key={request.id} className="rounded-xl border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">Rs.{Number(request.amount).toFixed(0)} - {request.user?.name}</p>
                    <p className="text-xs text-muted-foreground">{request.method === "bank" ? `${request.accountName} | ${request.accountNumber} | ${request.ifsc}` : request.upiId}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" className="h-8 w-8" onClick={() => reviewWithdrawal(request, "approve")}><CheckCircle2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 text-red-600" onClick={() => reviewWithdrawal(request, "reject")}><XCircle className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {!((adminWithdrawals ?? []).some((item: any) => item.status === "pending")) && (
              <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">No pending transfer requests.</div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Transfer Requests</h2>
        <div className="space-y-2">
          {(withdrawals ?? []).slice(0, 6).map((request: any) => (
            <div key={request.id} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Rs.{Number(request.amount).toFixed(0)} to {request.method === "bank" ? "Bank" : "UPI"}</p>
                <p className="text-xs text-muted-foreground">{new Date(request.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${request.status === "transferred" ? "bg-green-100 text-green-700" : request.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                {request.status}
              </span>
            </div>
          ))}
          {!withdrawals?.length && <div className="py-6 text-center text-sm text-muted-foreground">No transfer requests yet</div>}
        </div>
      </section>

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
