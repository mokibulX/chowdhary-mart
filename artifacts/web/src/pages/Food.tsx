import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bike, Clock3, MapPin, Minus, Plus, ShoppingBag, Star, Store, UtensilsCrossed, Vegan } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

const CUISINES = ["All", "Biryani", "North Indian", "Pizza", "Burgers", "Chinese", "Desserts"];

type FoodDish = { productId?: number; name: string; price: number; veg: boolean; description: string; image: string };
type Restaurant = {
  id: number; name: string; cuisine: string; rating: string; time: string; cost: string;
  offer: string; fee: number; minimum: number; address: string; about: string; image: string; dishes: FoodDish[];
};

const RESTAURANTS = [
  { id: 1, name: "Biryani House", cuisine: "Biryani, North Indian", rating: "4.4", time: "28 min", cost: "Rs.250 for one", offer: "50% OFF up to Rs.100", fee: 29, minimum: 149, address: "Station Road, Hatsingimari", about: "Slow-cooked dum biryani and North Indian comfort food.", image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Hyderabadi chicken biryani", price: 249, veg: false, description: "Fragrant basmati rice with slow-cooked chicken.", image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=220&q=80" }, { name: "Paneer biryani", price: 199, veg: true, description: "Paneer, saffron rice and fragrant spices.", image: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&w=220&q=80" }, { name: "Seekh kebab", price: 169, veg: false, description: "Char-grilled kebabs with mint chutney.", image: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=220&q=80" }] },
  { id: 2, name: "The Burger Yard", cuisine: "Burgers, Fast Food", rating: "4.3", time: "22 min", cost: "Rs.180 for one", offer: "Free delivery", fee: 0, minimum: 129, address: "College Chowk, Hatsingimari", about: "Fresh smash burgers, loaded fries and quick bites.", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Classic smash burger", price: 189, veg: false, description: "Double patty, cheese and house sauce.", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=220&q=80" }, { name: "Crispy veg burger", price: 149, veg: true, description: "Crisp vegetable patty with fresh salad.", image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=220&q=80" }, { name: "Loaded fries", price: 129, veg: true, description: "Seasoned fries with cheese sauce.", image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=220&q=80" }] },
  { id: 3, name: "Oven Story Pizza", cuisine: "Pizza, Italian", rating: "4.2", time: "32 min", cost: "Rs.220 for one", offer: "Buy 1 get 1", fee: 39, minimum: 199, address: "Market Lane, Hatsingimari", about: "Hand-stretched pizzas, baked fresh to order.", image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Farmhouse pizza", price: 299, veg: true, description: "Bell pepper, onion, corn and cheese.", image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=220&q=80" }, { name: "Margherita pizza", price: 229, veg: true, description: "Tomato, basil and mozzarella.", image: "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=220&q=80" }, { name: "Garlic bread", price: 109, veg: true, description: "Toasted garlic bread with herb butter.", image: "https://images.unsplash.com/photo-1573140401552-3fab0b24306f?auto=format&fit=crop&w=220&q=80" }] },
  { id: 4, name: "Wok & Roll", cuisine: "Chinese, Asian", rating: "4.5", time: "25 min", cost: "Rs.200 for one", offer: "20% OFF", fee: 25, minimum: 149, address: "River View Road, Hatsingimari", about: "Wok-tossed noodles, rice bowls and Asian favourites.", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Chilli chicken", price: 219, veg: false, description: "Spicy chicken with peppers and onions.", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=220&q=80" }, { name: "Veg hakka noodles", price: 169, veg: true, description: "Wok-tossed noodles with seasonal vegetables.", image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=220&q=80" }, { name: "Schezwan rice", price: 179, veg: true, description: "Hot and tangy fried rice.", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=220&q=80" }] },
  { id: 5, name: "Saffron Thali", cuisine: "North Indian, Vegetarian", rating: "4.6", time: "30 min", cost: "Rs.190 for one", offer: "Thali from Rs.149", fee: 29, minimum: 149, address: "Main Bazaar, Hatsingimari", about: "Comforting vegetarian thalis and homestyle Indian meals.", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Royal veg thali", price: 219, veg: true, description: "Three curries, dal, rice, roti and dessert.", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=220&q=80" }, { name: "Dal makhani", price: 159, veg: true, description: "Creamy slow-cooked black lentils.", image: "https://images.unsplash.com/photo-1626500155537-93690c24099e?auto=format&fit=crop&w=220&q=80" }, { name: "Butter naan", price: 45, veg: true, description: "Fresh tandoor bread with butter.", image: "https://images.unsplash.com/photo-1610057099431-d73a1c9d2f2f?auto=format&fit=crop&w=220&q=80" }] },
  { id: 6, name: "Sweet Truth", cuisine: "Desserts, Bakery", rating: "4.3", time: "20 min", cost: "Rs.160 for one", offer: "Flat Rs.75 OFF", fee: 20, minimum: 99, address: "Bus Stand Road, Hatsingimari", about: "Cakes, brownies, waffles and sweet treats.", image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80", dishes: [{ name: "Chocolate truffle cake", price: 349, veg: true, description: "Rich chocolate cake for sharing.", image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=220&q=80" }, { name: "Brownie box", price: 179, veg: true, description: "Four fudgy chocolate brownies.", image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=220&q=80" }, { name: "Belgian waffle", price: 149, veg: true, description: "Warm waffle with chocolate drizzle.", image: "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=220&q=80" }] },
] satisfies Restaurant[];
type FoodCartLine = { productId?: number; restaurantId: number; restaurantName: string; dish: string; price: number; quantity: number };
const CART_KEY = "cm_food_cart";

function readFoodCart(): FoodCartLine[] { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]") as FoodCartLine[]; } catch { return []; } }
function money(value: number) { return `Rs.${value.toFixed(0)}`; }

function toLiveRestaurants(items: any[]): Restaurant[] {
  const grouped = new Map<number, any[]>();
  for (const item of items) {
    const storeId = Number(item.store?.id ?? item.storeId);
    if (!Number.isFinite(storeId)) continue;
    grouped.set(storeId, [...(grouped.get(storeId) ?? []), item]);
  }
  return [...grouped.entries()].map(([id, dishes]) => {
    const store = dishes[0].store ?? {};
    const prices = dishes.map((dish) => Number(dish.price) || 0).filter(Boolean);
    return {
      id,
      name: String(store.name ?? "Restaurant"),
      cuisine: String(dishes[0].category?.name ?? "Food & beverages"),
      rating: Number(store.rating ?? 4).toFixed(1),
      time: `${Number(store.estimatedDeliveryMins ?? 30)} min`,
      cost: prices.length ? `${money(Math.min(...prices))} onwards` : "Menu available",
      offer: store.deliveryFee ? `${money(Number(store.deliveryFee))} delivery` : "Free delivery",
      fee: Number(store.deliveryFee ?? 0),
      minimum: Number(store.minimumOrder ?? 0),
      address: String(store.address ?? "Restaurant location"),
      about: String(store.description ?? "Freshly prepared food from this restaurant."),
      image: String(store.bannerUrl ?? dishes[0].images?.[0] ?? "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80"),
      dishes: dishes.map((dish) => ({
        productId: Number(dish.id),
        name: String(dish.name),
        price: Number(dish.price),
        veg: String(dish.specifications?.DietaryType ?? "veg") !== "non_veg",
        description: String(dish.description ?? `${dish.weight ?? "1"} ${dish.unit ?? "portion"}`).trim(),
        image: String(dish.images?.[0] ?? store.bannerUrl ?? "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=220&q=80"),
      })),
    };
  });
}

export default function Food() {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("All");
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<FoodCartLine[]>(readFoodCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [movingToCheckout, setMovingToCheckout] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: foodResponse } = useQuery({
    queryKey: ["/api/products", "food-menu"],
    queryFn: () => customFetch<any>("/api/products?surface=food&limit=100", { responseType: "json" }),
    staleTime: 15_000,
  });
  const { data: foodCategories = [] } = useQuery({
    queryKey: ["/api/categories", "food"],
    queryFn: () => customFetch<any[]>("/api/categories?surface=food", { responseType: "json" }),
  });

  useEffect(() => { setQuery(new URLSearchParams(location.split("?")[1] ?? "").get("q") ?? ""); }, [location]);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  const restaurants = useMemo(() => {
    const live = toLiveRestaurants(foodResponse?.items ?? []);
    return live.length ? live : RESTAURANTS;
  }, [foodResponse]);
  const visibleRestaurants = useMemo(() => restaurants.filter((restaurant) => {
    const matchesCuisine = cuisine === "All" || restaurant.cuisine.toLowerCase().includes(cuisine.toLowerCase());
    const haystack = `${restaurant.name} ${restaurant.cuisine} ${restaurant.dishes.map((dish) => dish.name).join(" ")}`.toLowerCase();
    return matchesCuisine && haystack.includes(query.toLowerCase());
  }), [cuisine, query, restaurants]);
  const cartRestaurant = cart.length ? restaurants.find((item) => item.id === cart[0].restaurantId) ?? null : null;
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const deliveryFee = cartRestaurant?.fee ?? 0;
  const total = subtotal + deliveryFee;

  const changeQuantity = (restaurant: Restaurant, dish: Restaurant["dishes"][number], delta: number) => {
    const existing = cart.find((item) => item.restaurantId === restaurant.id && item.dish === dish.name);
    if (delta > 0 && cart.length > 0 && cart[0].restaurantId !== restaurant.id) {
      setCart([{ productId: dish.productId, restaurantId: restaurant.id, restaurantName: restaurant.name, dish: dish.name, price: dish.price, quantity: 1 }]);
      toast({ title: "Started a new food cart", description: "Food from the previous restaurant was removed." });
      return;
    }
    if (!existing && delta < 0) return;
    setCart((current) => !existing ? [...current, { productId: dish.productId, restaurantId: restaurant.id, restaurantName: restaurant.name, dish: dish.name, price: dish.price, quantity: 1 }] : existing.quantity + delta <= 0 ? current.filter((item) => item !== existing) : current.map((item) => item === existing ? { ...item, quantity: item.quantity + delta } : item));
  };

  const moveFoodCartToCheckout = async () => {
    if (!user) { toast({ title: "Sign in to continue", description: "Please sign in before placing a food order.", variant: "destructive" }); setLocation("/login"); return; }
    if (!cart.length) return;
    const checkoutItems = cart.map((item) => ({
      ...item,
      productId: item.productId ?? restaurants.find((restaurant) => restaurant.id === item.restaurantId)?.dishes.find((dish) => dish.name === item.dish)?.productId,
    }));
    if (checkoutItems.some((item) => !item.productId)) {
      toast({ title: "Menu item unavailable", description: "Choose a dish added by a food partner to place an order.", variant: "destructive" });
      return;
    }

    setMovingToCheckout(true);
    try {
      for (const [index, item] of checkoutItems.entries()) {
        await customFetch("/api/cart/items", {
          method: "POST",
          body: JSON.stringify({ productId: item.productId, qty: item.quantity, replaceCart: index === 0 }),
          responseType: "json",
        });
      }
      setCart([]);
      setCartOpen(false);
      setLocation("/checkout");
    } catch (error: any) {
      toast({ title: "Could not continue to checkout", description: error?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setMovingToCheckout(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5 pb-24">
    <section className="overflow-hidden rounded-lg bg-[#e23744] text-white shadow-sm"><div className="grid gap-5 p-5 sm:grid-cols-[1fr_220px] sm:p-7"><div><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/85"><UtensilsCrossed className="h-4 w-4" /> FOOD DELIVERY</div><h1 className="text-3xl font-bold">What are you craving?</h1><p className="mt-2 text-sm text-white/85">Restaurant details, menu selection and checkout are ready. Use the header search to find any dish or restaurant.</p></div><img src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=700&q=85" alt="Prepared food" className="hidden h-44 w-full rounded-lg object-cover sm:block" /></div></section>
    <section className="flex gap-2 overflow-x-auto pb-1">{["All", ...(foodCategories.length ? foodCategories.map((item: any) => item.name) : CUISINES.slice(1))].map((item) => <button key={item} type="button" onClick={() => setCuisine(item)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${cuisine === item ? "border-[#e23744] bg-[#e23744] text-white" : "bg-white hover:border-[#e23744] hover:text-[#e23744]"}`}>{item}</button>)}</section>
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Restaurants near you</h2><p className="mt-1 text-sm text-muted-foreground">{query ? `Results for “${query}” · ` : ""}{visibleRestaurants.length} places delivering now</p></div><Link href="/" className="text-sm font-semibold text-primary">Back to shopping</Link></div>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleRestaurants.map((restaurant) => <article key={restaurant.id} className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md"><div className="relative h-44"><img src={restaurant.image} alt={restaurant.name} className="h-full w-full object-cover" /><Badge className="absolute bottom-3 left-3 border-0 bg-white text-slate-900">{restaurant.offer}</Badge></div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{restaurant.name}</h3><p className="mt-1 text-sm text-muted-foreground">{restaurant.cuisine}</p></div><span className="flex shrink-0 items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white"><Star className="h-3 w-3 fill-current" />{restaurant.rating}</span></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{restaurant.time}</span><span>{restaurant.cost}</span></div><Button className="mt-4 w-full bg-[#e23744] hover:bg-[#c91e2d]" onClick={() => setSelected(restaurant)}>View restaurant</Button></div></article>)}</section>
    {!visibleRestaurants.length && <div className="rounded-lg border bg-white py-14 text-center text-muted-foreground">No restaurant matches this search.</div>}

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1"><Star className="h-4 w-4 fill-emerald-600 text-emerald-600" />{selected.rating} rating</span><span className="flex items-center gap-1"><Clock3 className="h-4 w-4 text-[#e23744]" />{selected.time}</span><span className="flex items-center gap-1"><Bike className="h-4 w-4 text-[#e23744]" />{selected.fee ? `${money(selected.fee)} delivery` : "Free delivery"}</span></div><div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-900">{selected.about}</p><p className="mt-1 flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{selected.address} · Minimum order {money(selected.minimum)}</p></div><div className="space-y-2">{selected.dishes.map((dish) => { const quantity = cart.find((item) => item.restaurantId === selected.id && item.dish === dish.name)?.quantity ?? 0; return <div key={dish.name} className="flex items-center gap-3 rounded-lg border p-3"><img src={dish.image} alt={dish.name} className="h-20 w-20 shrink-0 rounded-md object-cover" /><Vegan className={`h-4 w-4 shrink-0 self-start ${dish.veg ? "text-emerald-600" : "text-red-500"}`} /><div className="min-w-0 flex-1"><p className="font-medium">{dish.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{dish.description}</p><p className="mt-1 text-sm font-bold">{money(dish.price)}</p></div>{quantity ? <QuantityControl quantity={quantity} onMinus={() => changeQuantity(selected, dish, -1)} onPlus={() => changeQuantity(selected, dish, 1)} /> : <Button variant="outline" size="sm" className="border-[#e23744] text-[#e23744] hover:bg-red-50 hover:text-[#c91e2d]" onClick={() => changeQuantity(selected, dish, 1)}>Add</Button>}</div>; })}</div>{cartRestaurant?.id === selected.id && <Button className="w-full bg-[#e23744] hover:bg-[#c91e2d]" onClick={() => { setSelected(null); setCartOpen(true); }}>View food cart · {itemCount} item{itemCount === 1 ? "" : "s"}</Button>}</div>}</DialogContent></Dialog>

    <Dialog open={cartOpen} onOpenChange={setCartOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-[#e23744]" />Your food cart</DialogTitle></DialogHeader>{cartRestaurant && <div className="space-y-4"><div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm"><Store className="h-4 w-4 text-[#e23744]" /><span className="font-semibold">{cartRestaurant.name}</span><span className="ml-auto text-muted-foreground">{cartRestaurant.time}</span></div>{cart.map((item) => { const dish = cartRestaurant.dishes.find((candidate) => candidate.name === item.dish); return <div key={item.dish} className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.dish}</p><p className="text-sm text-muted-foreground">{money(item.price)} each</p></div><div className="flex items-center gap-3"><QuantityControl quantity={item.quantity} onMinus={() => dish && changeQuantity(cartRestaurant, dish, -1)} onPlus={() => dish && changeQuantity(cartRestaurant, dish, 1)} /><span className="w-16 text-right text-sm font-bold">{money(item.price * item.quantity)}</span></div></div>; })}<Separator /><PriceRow label="Item total" value={money(subtotal)} /><PriceRow label="Delivery fee" value={deliveryFee ? money(deliveryFee) : "Free"} /><PriceRow label="To pay" value={money(total)} strong /><p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">Your saved address and live map location will appear in checkout. You can also add a separate new delivery address there.</p><Button className="h-11 w-full bg-[#e23744] hover:bg-[#c91e2d]" disabled={subtotal < cartRestaurant.minimum || movingToCheckout} onClick={() => void moveFoodCartToCheckout()}>{subtotal < cartRestaurant.minimum ? `Add ${money(cartRestaurant.minimum - subtotal)} more to continue` : movingToCheckout ? "Opening checkout..." : `Continue to checkout · ${money(total)}`}</Button></div>}</DialogContent></Dialog>

    {itemCount > 0 && <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-xl items-center justify-between rounded-lg bg-[#e23744] px-4 py-3 text-left text-white shadow-lg sm:bottom-6"><span><span className="block text-sm font-bold">{itemCount} item{itemCount === 1 ? "" : "s"} from {cartRestaurant?.name}</span><span className="text-xs text-white/85">View cart and checkout</span></span><span className="font-bold">{money(total)}</span></button>}
  </div>;
}

function QuantityControl({ quantity, onMinus, onPlus }: { quantity: number; onMinus: () => void; onPlus: () => void }) {
  return <div className="flex h-9 items-center overflow-hidden rounded-md border border-[#e23744] text-[#e23744]"><button type="button" onClick={onMinus} className="px-2.5 hover:bg-red-50" aria-label="Remove item"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-7 text-center text-sm font-bold">{quantity}</span><button type="button" onClick={onPlus} className="px-2.5 hover:bg-red-50" aria-label="Add item"><Plus className="h-3.5 w-3.5" /></button></div>;
}

function PriceRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between text-sm ${strong ? "text-base font-bold" : "text-muted-foreground"}`}><span>{label}</span><span className={strong ? "text-slate-950" : "font-medium text-slate-700"}>{value}</span></div>;
}
