import { useState } from "react";
import { customFetch, getListAdminUsersQueryKey, useListAdminUsers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Search, ShieldOff, Trash2, Users } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/error-message";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  vendor: "bg-purple-100 text-purple-700",
  customer: "bg-blue-100 text-blue-700",
  delivery_partner: "bg-green-100 text-green-700",
};

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [role, setRole] = useState<string>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const params = { role: role || undefined, q: search || undefined, limit: 50 };
  const { data: users, isLoading } = useListAdminUsers(params, {
    query: { enabled: !!user, queryKey: getListAdminUsersQueryKey(params) },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey(params) });

  const warnUser = async (target: any) => {
    const warning = prompt(`Warning message for ${target.name}`, "Please follow marketplace policy. Repeated issues may restrict your account.");
    if (!warning) return;
    try {
      await customFetch(`/api/admin/users/${target.id}`, { method: "PATCH", body: JSON.stringify({ warning }) });
      toast({ title: "Warning sent" });
      refresh();
    } catch (error) {
      toast({ title: "Warning failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };

  const toggleUser = async (target: any) => {
    try {
      await customFetch(`/api/admin/users/${target.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !target.isActive }) });
      toast({ title: target.isActive ? "User blocked" : "User activated" });
      refresh();
    } catch (error) {
      toast({ title: "User update failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };

  const deleteUser = async (target: any) => {
    if (!confirm(`Delete ${target.name}?`)) return;
    try {
      await customFetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
      toast({ title: "User deleted" });
      refresh();
    } catch (error) {
      toast({ title: "User delete failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Users ({users?.length ?? 0})</h1>
        <p className="text-sm text-muted-foreground">Filter users by role, send warnings, block/activate or delete accounts.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email or phone..."
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && setSearch(q)}
            data-testid="input-search"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["", "customer", "vendor", "delivery_partner", "admin"].map((item) => (
            <Button
              key={item}
              variant={role === item ? "default" : "outline"}
              size="sm"
              onClick={() => setRole(item)}
              className="whitespace-nowrap capitalize"
              data-testid={`filter-${item || "all"}`}
            >
              {item ? item.replace("_", " ") : "All Roles"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !users?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>No users found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Wallet</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Points</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Joined</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(users as any[]).map((item: any) => (
                <tr key={item.id} className="transition-colors hover:bg-gray-50" data-testid={`user-${item.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.email || item.phone || "No contact"}</p>
                    {item.warning && <p className="mt-1 text-xs font-medium text-orange-600">Warning: {item.warning}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`border-0 text-xs ${ROLE_COLORS[item.role] ?? "bg-gray-100 text-gray-700"}`}>
                      {item.role?.replace("_", " ")}
                    </Badge>
                    {item.vendorStatus && <Badge variant="outline" className="ml-1 text-xs">{item.vendorStatus}</Badge>}
                    {item.deliveryStatus && <Badge variant="outline" className="ml-1 text-xs">{item.deliveryStatus}</Badge>}
                    {item.isActive === false && <Badge variant="destructive" className="ml-1 text-xs">blocked</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">Rs.{Number(item.walletBalance ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{item.loyaltyPoints ?? 0}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-600" onClick={() => warnUser(item)}>
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleUser(item)}>
                        <ShieldOff className="h-4 w-4" />
                      </Button>
                      {item.id !== user?.id && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => deleteUser(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
