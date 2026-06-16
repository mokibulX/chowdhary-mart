import { useState } from "react";
import { useListAdminUsers, getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  vendor: "bg-purple-100 text-purple-700",
  customer: "bg-blue-100 text-blue-700",
  delivery_partner: "bg-green-100 text-green-700",
};

export default function AdminUsers() {
  const { user } = useAuth();
  const [role, setRole] = useState<string>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const params = { role: role || undefined, q: search || undefined, limit: 50 };
  const { data: users, isLoading } = useListAdminUsers(params, {
    query: { enabled: !!user, queryKey: getListAdminUsersQueryKey(params) },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Users ({users?.length ?? 0})</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && setSearch(q)}
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["", "customer", "vendor", "delivery_partner", "admin"].map(r => (
            <Button
              key={r}
              variant={role === r ? "default" : "outline"}
              size="sm"
              onClick={() => setRole(r)}
              className="whitespace-nowrap capitalize"
              data-testid={`filter-${r || "all"}`}
            >
              {r || "All Roles"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !users?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No users found</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Wallet</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Points</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(users as any[]).map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors" data-testid={`user-${u.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs border-0 ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                      {u.role?.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">₹{Number(u.walletBalance ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{u.loyaltyPoints ?? 0}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
