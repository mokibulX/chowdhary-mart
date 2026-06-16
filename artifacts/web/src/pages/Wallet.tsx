import { useGetWallet, useListWalletTransactions, getGetWalletQueryKey, getListWalletTransactionsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Wallet as WalletIcon, TrendingUp, TrendingDown, Star } from "lucide-react";
import { Link } from "wouter";

export default function Wallet() {
  const { user } = useAuth();

  const { data: wallet, isLoading: loadingWallet } = useGetWallet({
    query: { enabled: !!user, queryKey: getGetWalletQueryKey() },
  });

  const { data: transactions, isLoading: loadingTx } = useListWalletTransactions(
    { limit: 50 },
    { query: { enabled: !!user, queryKey: getListWalletTransactionsQueryKey({ limit: 50 }) } }
  );

  if (!user) return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">sign in</Link></p></div>;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">Wallet</h1>

      {/* Balance card */}
      {loadingWallet ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : (
        <div className="bg-gradient-to-br from-primary to-orange-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <WalletIcon className="w-5 h-5 opacity-80" />
            <span className="text-sm opacity-80">Chowdhary Mart Wallet</span>
          </div>
          <p className="text-4xl font-bold mt-2">₹{Number(wallet?.balance ?? 0).toFixed(0)}</p>
          <p className="text-sm opacity-80 mt-1">Available Balance</p>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-yellow-300" />
              <span className="text-sm">{wallet?.loyaltyPoints ?? 0} Loyalty Points</span>
            </div>
            {wallet?.pendingCashback && Number(wallet.pendingCashback) > 0 && (
              <div className="text-sm opacity-80">
                ₹{Number(wallet.pendingCashback).toFixed(0)} pending cashback
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
        Wallet balance is automatically applied at checkout. Earn 1 point for every ₹10 spent.
      </div>

      {/* Transactions */}
      <div>
        <h2 className="font-semibold mb-3">Transaction History</h2>
        {loadingTx ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !transactions?.length ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No transactions yet</div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "credit" ? "bg-green-100" : "bg-red-100"}`}>
                  {tx.type === "credit"
                    ? <TrendingUp className="w-4 h-4 text-green-600" />
                    : <TrendingDown className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold text-sm ${tx.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                    {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Bal: ₹{Number(tx.balance).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
