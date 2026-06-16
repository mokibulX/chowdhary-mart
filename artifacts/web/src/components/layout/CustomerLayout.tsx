import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { ShoppingCart, User, Search, Store, LogOut, Home, Package, MapPin, Wallet, Ticket, Bell, Heart, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface CustomerLayoutProps {
  children: ReactNode;
}

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: cart } = useGetCart({
    query: { enabled: !!user, queryKey: getGetCartQueryKey() },
  });

  const cartItemCount = cart?.itemCount || 0;

  const NavLinks = () => (
    <>
      <Link href="/" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:text-primary transition-colors font-medium">
        <Home className="w-4 h-4" /> Home
      </Link>
      <Link href="/search" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:text-primary transition-colors font-medium">
        <Search className="w-4 h-4" /> Search
      </Link>
      {user && (
        <>
          <Link href="/orders" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:text-primary transition-colors font-medium">
            <Package className="w-4 h-4" /> Orders
          </Link>
          <Link href="/wishlist" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:text-primary transition-colors font-medium">
            <Heart className="w-4 h-4" /> Wishlist
          </Link>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <div className="font-bold text-xl text-primary mb-6 mt-4">Chowdhary Mart</div>
                <div className="flex flex-col gap-2">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>

            <Link href="/" className="font-bold text-xl md:text-2xl text-primary tracking-tight">
              Chowdhary Mart
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-4">
            <NavLinks />
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
            {user ? (
              <>
                <Link href="/cart">
                  <Button variant="ghost" className="relative p-2" data-testid="link-cart">
                    <ShoppingCart className="w-5 h-5 text-gray-700" />
                    {cartItemCount > 0 && (
                      <span className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                        {cartItemCount}
                      </span>
                    )}
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="hidden md:flex" data-testid="link-profile">
                    <User className="w-4 h-4 mr-2" />
                    {user.name}
                  </Button>
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Register</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
        {children}
      </main>
      
      <footer className="bg-white border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Chowdhary Mart. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
