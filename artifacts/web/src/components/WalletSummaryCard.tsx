import { Link } from "wouter";
import { useGetWallet, useListWalletTransactions, getGetWalletQueryKey, getListWalletTransactionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, TrendingUp, Wallet } from "lucide-react";

type WalletSummaryCardProps = {
  href?: string;
  title?: string;
  tone?: "dark" | "green";
};

export function WalletSummaryCard({ href = "/wallet", title = "Wallet", tone = "green" }: WalletSummaryCardProps) {
  const { data: wallet, isLoading: loadingWallet } = useGetWallet({
    query: { queryKey: getGetWalletQueryKey() },
  });
  const { data: transactions, isLoading: loadingTx } = useListWalletTransactions(
    { limit: 3 },
    { query: { queryKey: getListWalletTransactionsQueryKey({ limit: 3 }) } },
  );
  const lastCredit = (transactions ?? []).find((tx: any) => tx.type === "credit");
  const wrapper = tone === "dark"
    ? "border-slate-800 bg-slate-950 text-white"
    : "border-emerald-200 bg-emerald-50 text-emerald-950";

  return (
    <Card className={wrapper}>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <p className="text-sm font-semibold opacity-80">{title}</p>
          </div>
          {loadingWallet ? (
            <Skeleton className="h-9 w-32 bg-white/30" />
          ) : (
            <p className="text-3xl font-bold">Rs.{Number(wallet?.balance ?? 0).toFixed(0)}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs opacity-80">
            <span>{wallet?.loyaltyPoints ?? 0} loyalty points</span>
            {!loadingTx && lastCredit && (
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Last credit Rs.{Number(lastCredit.amount ?? 0).toFixed(0)}
              </span>
            )}
          </div>
        </div>
        <Link href={href} className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-bold text-primary shadow-sm hover:bg-white/90">
          Open wallet <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
