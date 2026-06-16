import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Star, Wallet, Copy, LogOut } from "lucide-react";
import { Link } from "wouter";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().optional().or(z.literal("")),
});
type FormData = z.infer<typeof schema>;

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMe = useUpdateMe();

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  if (!user) {
    return (
      <div className="text-center py-16">
        <p>Please <Link href="/login" className="text-primary underline">sign in</Link></p>
      </div>
    );
  }

  const onSubmit = (data: FormData) => {
    updateMe.mutate(
      { data: { name: data.name, phone: data.phone || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Profile updated" });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  const copyReferral = () => {
    if (user.referralCode) {
      navigator.clipboard.writeText(user.referralCode);
      toast({ title: "Copied!", description: `Referral code ${user.referralCode} copied` });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold">My Account</h1>

      {/* Avatar + quick stats */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="outline" className="text-xs mt-1 capitalize">{user.role?.replace("_", " ")}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/wallet">
              <div className="bg-orange-50 rounded-xl p-3 text-center cursor-pointer hover:bg-orange-100 transition-colors">
                <Wallet className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="font-bold text-lg">₹{Number(user.walletBalance ?? 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Wallet Balance</p>
              </div>
            </Link>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <Star className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="font-bold text-lg">{user.loyaltyPoints ?? 0}</p>
              <p className="text-xs text-muted-foreground">Loyalty Points</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" {...register("name")} data-testid="input-name" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" {...register("phone")} data-testid="input-phone" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user.email} disabled className="bg-muted/50" />
            </div>
            <Button type="submit" className="w-full" disabled={!isDirty || updateMe.isPending} data-testid="btn-save">
              {updateMe.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardContent className="p-0">
          {[
            { href: "/orders", label: "My Orders" },
            { href: "/addresses", label: "Saved Addresses" },
            { href: "/wallet", label: "Wallet & Transactions" },
            { href: "/coupons", label: "Offers & Coupons" },
            { href: "/notifications", label: "Notifications" },
            { href: "/wishlist", label: "Wishlist" },
          ].map(({ href, label }, i, arr) => (
            <div key={href}>
              <Link href={href}>
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 cursor-pointer transition-colors text-sm font-medium" data-testid={`link-${href.replace("/", "")}`}>
                  {label}
                  <span className="text-muted-foreground">›</span>
                </div>
              </Link>
              {i < arr.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Referral */}
      {user.referralCode && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Your Referral Code</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono font-bold tracking-widest">{user.referralCode}</div>
              <Button variant="outline" size="sm" onClick={copyReferral} data-testid="btn-copy-referral">
                <Copy className="w-3 h-3 mr-1" />Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Share to earn rewards when friends join</p>
          </CardContent>
        </Card>
      )}

      <Button variant="destructive" className="w-full" onClick={logout} data-testid="btn-logout">
        <LogOut className="w-4 h-4 mr-2" />Sign Out
      </Button>
    </div>
  );
}
