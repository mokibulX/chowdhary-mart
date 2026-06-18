import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
}).refine(data => data.email || data.phone, {
  message: "Either email or phone is required",
  path: ["email"]
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { login: setAuthContext } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema as any),
    defaultValues: {
      email: "",
      phone: "",
      password: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          setAuthContext(res.token);
          toast({
            title: "Welcome back!",
            description: "Successfully logged in.",
          });
          
          if (res.user.role === 'admin') {
            setLocation("/admin");
          } else if (res.user.role === 'vendor') {
            setLocation("/vendor");
          } else if (res.user.role === 'delivery_partner') {
            setLocation("/delivery");
          } else {
            setLocation("/");
          }
        },
        onError: (err) => {
          toast({
            title: "Login failed",
            description: err?.data?.error || "Invalid credentials",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 text-2xl font-bold">
            CM
          </div>
          <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          <CardDescription>Welcome back to Chowdhary Mart</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                <span className="relative bg-white px-2 text-xs text-gray-500">OR</span>
              </div>

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="9876543210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Create one
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
