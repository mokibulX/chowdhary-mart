import { useState } from "react";
import type { ElementType } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getGetMeQueryKey, useUpdateMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Bell,
  Camera,
  ChevronRight,
  CreditCard,
  Globe2,
  Heart,
  HelpCircle,
  Info,
  Lock,
  LogOut,
  MapPin,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User,
  WalletCards,
} from "lucide-react";
import { getFirstFormError, getFriendlyErrorMessage } from "@/lib/error-message";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().optional().or(z.literal("")),
});
type FormData = z.infer<typeof schema>;

type RowAction = {
  label: string;
  desc: string;
  icon: ElementType;
  color: string;
  href?: string;
  value?: string;
  action?: () => void;
};

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMe = useUpdateMe();
  const [manageOpen, setManageOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p>Please <Link href="/login" className="text-primary underline">sign in</Link></p>
      </div>
    );
  }

  const showSoon = (title: string) => toast({ title, description: "Settings are saved locally for this marketplace build." });

  const sections: { title: string; rows: RowAction[] }[] = [
    {
      title: "My Orders & Activity",
      rows: [
        { label: "My Orders", desc: "View and track your orders", icon: Package, color: "text-[#0757ee]", href: "/orders" },
        { label: "My Returns", desc: "View your return requests", icon: RotateCcw, color: "text-green-600", href: "/returns" },
        { label: "My Wishlist", desc: "Your saved products", icon: Heart, color: "text-pink-500", href: "/wishlist" },
        { label: "Recently Viewed", desc: "Products you viewed recently", icon: User, color: "text-[#0757ee]", href: "/search" },
      ],
    },
    {
      title: "Account Settings",
      rows: [
        { label: "Personal Information", desc: "Manage your name, email, phone number", icon: User, color: "text-purple-600", action: () => setManageOpen(true) },
        { label: "Chowdhary Plus", desc: "View Plus benefits and membership", icon: Sparkles, color: "text-yellow-500", href: "/coupons" },
        { label: "Saved Addresses", desc: "Manage delivery addresses", icon: MapPin, color: "text-orange-500", href: "/addresses" },
        { label: "Payment Methods", desc: "Cash on Delivery and UPI options", icon: CreditCard, color: "text-[#0757ee]", href: "/wallet" },
        { label: "Change Password", desc: "Update your account password", icon: Lock, color: "text-green-600", href: "/login" },
        { label: "Notification Preferences", desc: "Manage your notification settings", icon: Bell, color: "text-yellow-500", href: "/notifications" },
        { label: "Privacy Settings", desc: "Manage privacy and data settings", icon: ShieldCheck, color: "text-[#0757ee]", href: "/privacy" },
        { label: "Language", desc: "Change app language", icon: Globe2, color: "text-purple-600", value: localStorage.getItem("ekart_language") || "English", href: "/language" },
      ],
    },
    {
      title: "Support",
      rows: [
        { label: "Help Center", desc: "Get help and support", icon: HelpCircle, color: "text-[#0757ee]", href: "/help" },
        { label: "Report a Problem", desc: "Report an issue or share feedback", icon: AlertTriangle, color: "text-orange-600", href: "/help" },
        { label: "About Chowdhary Mart", desc: "App info, terms and policies", icon: Info, color: "text-[#0757ee]", href: "/help" },
      ],
    },
  ];

  const saveProfile = (data: FormData) => {
    updateMe.mutate(
      { data: { name: data.name, phone: data.phone || undefined, avatarUrl: avatarPreview || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setManageOpen(false);
          toast({ title: "Profile updated" });
        },
        onError: (error: unknown) => toast({ title: "Update failed", description: getFriendlyErrorMessage(error, "Please check your profile details and try again."), variant: "destructive" }),
      },
    );
  };

  const onInvalid = (formErrors: unknown) => {
    toast({
      title: "Complete profile details",
      description: getFirstFormError(formErrors, "Name must be at least 2 characters."),
      variant: "destructive",
    });
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setAvatarPreview(reader.result);
      updateMe.mutate(
        { data: { avatarUrl: reader.result } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            toast({ title: "Profile photo updated" });
          },
          onError: () => toast({ title: "Photo update failed", variant: "destructive" }),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 overflow-x-hidden pb-6">
      <section className="rounded-[22px] border bg-white p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative h-20 w-20 flex-shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#0757ee] text-white">
              {avatarPreview ? <img src={avatarPreview} alt={user.name} className="h-full w-full object-cover" /> : <User className="h-10 w-10" />}
            </div>
            <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-[#0757ee] shadow-md ring-1 ring-gray-200">
              <Camera className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} data-testid="input-avatar" />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.phone || "+91 98765 43210"}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="outline" className="hidden shrink-0 border-[#0757ee] text-[#0757ee] sm:flex" onClick={() => setManageOpen(true)}>
            Manage Account <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" className="mt-4 w-full border-[#0757ee] text-[#0757ee] sm:hidden" onClick={() => setManageOpen(true)}>
          Manage Account <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h2>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            {section.rows.map((row, index) => (
              <ActionRow key={row.label} row={row} last={index === section.rows.length - 1} />
            ))}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center gap-4 rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:bg-red-50"
        data-testid="btn-logout"
      >
        <LogOut className="h-7 w-7 text-red-500" />
        <span className="flex-1">
          <span className="block font-bold text-red-500">Log Out</span>
          <span className="text-sm text-muted-foreground">Securely log out from your account</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Manage Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(saveProfile, onInvalid)} className="space-y-4" noValidate>
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
              <Input value={user.email ?? ""} disabled className="bg-muted/50" />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-blue-50 p-3 text-sm">
              <div><WalletCards className="mb-1 h-5 w-5 text-[#0757ee]" />Rs.{Number(user.walletBalance ?? 0).toFixed(0)} wallet</div>
              <div><Sparkles className="mb-1 h-5 w-5 text-yellow-500" />{user.loyaltyPoints ?? 0} points</div>
            </div>
            <Button type="submit" className="w-full" disabled={(!isDirty && avatarPreview === user.avatarUrl) || updateMe.isPending} data-testid="btn-save">
              {updateMe.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionRow({ row, last }: { row: RowAction; last: boolean }) {
  const Icon = row.icon;
  const content = (
    <div className={`flex min-w-0 items-center gap-4 bg-white p-4 text-left transition-colors hover:bg-gray-50 ${last ? "" : "border-b"}`}>
      <Icon className={`h-7 w-7 flex-shrink-0 ${row.color}`} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-tight">{row.label}</span>
        <span className="line-clamp-1 text-sm text-muted-foreground">{row.desc}</span>
      </span>
      {row.value && <span className="text-sm text-muted-foreground">{row.value}</span>}
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );

  if (row.href) return <Link href={row.href}>{content}</Link>;
  return <button type="button" onClick={row.action} className="block w-full">{content}</button>;
}
