import { Link } from "wouter";
import { ChefHat, ClipboardList, CookingPot, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const actions = [
  { href: "/food-partner/restaurant", title: "Restaurant or cafe", detail: "Add your restaurant name, address, phone number, food photos and opening status.", icon: Store },
  { href: "/food-partner/menu", title: "Food menu", detail: "List dishes with price, description, image and availability. Turn an item off when it is sold out.", icon: CookingPot },
  { href: "/food-partner/orders", title: "Food orders", detail: "Accept new orders, prepare food, mark it ready for pickup and follow each order status.", icon: ClipboardList },
];

export default function FoodPartner() {
  return <div className="mx-auto max-w-4xl space-y-5">
    <section className="flex flex-col gap-3 rounded-lg border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><ChefHat className="h-4 w-4" /> FOOD PARTNER</div>
        <h1 className="mt-1 text-2xl font-bold">Restaurant operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your restaurant, menu and kitchen order flow.</p>
      </div>
      <Link href="/food-partner/orders" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90">Open food orders</Link>
    </section>
    <section className="grid gap-4 md:grid-cols-3">
      {actions.map(({ href, title, detail, icon: Icon }) => <Link key={href} href={href}>
        <Card className="h-full border transition-shadow hover:shadow-md"><CardContent className="p-5"><Icon className="h-7 w-7 text-primary" /><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></CardContent></Card>
      </Link>)}
    </section>
  </div>;
}
