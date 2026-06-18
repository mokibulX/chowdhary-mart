import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(10, "Enter a valid phone number").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "vendor", "delivery_partner"]),
  referralCode: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

export default function Register() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegister();

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { role: "customer" },
  });

  const onSubmit = (data: FormData) => {
    registerMutation.mutate(
      {
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || undefined,
          password: data.password,
          role: data.role,
        },
      },
      {
        onSuccess: (res) => {
          login(res.token);
          toast({ title: "Welcome to Chowdhary Mart!", description: `Account created for ${res.user.name}` });
          setLocation("/");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Registration failed";
          toast({ title: "Registration failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="text-3xl font-bold text-primary mb-1">Chowdhary Mart</div>
          <CardTitle className="text-xl">Create account</CardTitle>
          <CardDescription>Join thousands of happy customers</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" placeholder="Your name" {...register("name")} data-testid="input-name" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@email.com" {...register("email")} data-testid="input-email" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" placeholder="10-digit mobile number" {...register("phone")} data-testid="input-phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Min 6 characters" {...register("password")} data-testid="input-password" />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Account type</Label>
              <Select onValueChange={(v) => setValue("role", v as "customer" | "vendor" | "delivery_partner")} defaultValue="customer">
                <SelectTrigger data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor / Store owner</SelectItem>
                  <SelectItem value="delivery_partner">Delivery partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" placeholder="e.g. WELCOME50" {...register("referralCode")} data-testid="input-referral" />
            </div>
            <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="btn-register">
              {registerMutation.isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
