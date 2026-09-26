import { useEffect, useMemo, useState } from "react";
import { BusFront, CarFront, Clock3, MapPin, Search } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const BUSES = [
  { name: "Green Line Express", leave: "07:30", arrive: "13:10", duration: "5h 40m", type: "AC Sleeper", seats: 14, price: 699 },
  { name: "Shyamoli NR Travels", leave: "09:15", arrive: "15:35", duration: "6h 20m", type: "AC Seater", seats: 7, price: 620 },
  { name: "Hanif Enterprise", leave: "22:00", arrive: "04:15", duration: "6h 15m", type: "Non-AC Sleeper", seats: 22, price: 480 },
];
const CARS = [
  { name: "Mini", detail: "Compact ride for 3", eta: "3 min", price: 110, icon: "M" },
  { name: "Sedan", detail: "Comfort for 4", eta: "5 min", price: 165, icon: "S" },
  { name: "SUV", detail: "Space for 6", eta: "7 min", price: 260, icon: "SUV" },
];

export default function Travels() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [from, setFrom] = useState("Kolkata");
  const [to, setTo] = useState("Durgapur");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [travellers, setTravellers] = useState("1");
  const [busSearched, setBusSearched] = useState(false);
  const [pickup, setPickup] = useState("Current location");
  const [drop, setDrop] = useState("");
  const [selectedCar, setSelectedCar] = useState("Mini");
  const [activeTab, setActiveTab] = useState("bus");
  const validBusSearch = from.trim() && to.trim() && date;
  const car = useMemo(() => CARS.find((item) => item.name === selectedCar)!, [selectedCar]);
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    const requestedTab = params.get("tab");
    if (requestedTab === "bus" || requestedTab === "cab") setActiveTab(requestedTab);
    const search = params.get("search");
    if (search) setFrom(search);
  }, [location]);

  const bookBus = (name: string) => toast({ title: "Seat request created", description: `${name}: ${from} to ${to} on ${date}. Payment confirmation is next.` });
  const bookCar = () => {
    if (!drop.trim()) { toast({ title: "Enter your destination", description: "Add a drop location to request a car.", variant: "destructive" }); return; }
    toast({ title: "Cab requested", description: `${car.name} will pick you up from ${pickup}.` });
  };

  return <div className="mx-auto max-w-5xl space-y-5 pb-8">
    <section className="overflow-hidden rounded-lg bg-[#073b4c] text-white shadow-sm"><div className="grid gap-5 p-5 sm:grid-cols-[1fr_250px] sm:p-7"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#ffd166]"><BusFront className="h-4 w-4" /> CMART TRAVELS</p><h1 className="mt-3 text-3xl font-bold">Move around with ease.</h1><p className="mt-2 text-sm text-white/80">Book intercity bus tickets or find a car for your next ride.</p></div><img src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=85" alt="Intercity bus" className="hidden h-40 w-full rounded-lg object-cover sm:block" /></div></section>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full"><TabsList className="grid h-12 w-full grid-cols-2 bg-slate-200"><TabsTrigger value="bus" className="gap-2 data-[state=active]:bg-white"><BusFront className="h-4 w-4" />Bus tickets</TabsTrigger><TabsTrigger value="cab" className="gap-2 data-[state=active]:bg-white"><CarFront className="h-4 w-4" />Book a car</TabsTrigger></TabsList>
      <TabsContent value="bus" className="space-y-5"><section className="rounded-lg border bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_120px_auto]"><Field label="From" value={from} setValue={setFrom} icon={MapPin} /><Field label="To" value={to} setValue={setTo} icon={MapPin} /><label className="grid gap-1 text-xs font-semibold text-slate-600">Date<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Passengers<select value={travellers} onChange={(event) => setTravellers(event.target.value)} className="h-11 rounded-md border bg-white px-3 text-sm"><option>1</option><option>2</option><option>3</option><option>4</option></select></label><Button className="h-11 bg-[#118ab2] hover:bg-[#08769b]" onClick={() => validBusSearch ? setBusSearched(true) : toast({ title: "Complete your journey", variant: "destructive" })}><Search className="mr-2 h-4 w-4" />Search</Button></div></section>
        {busSearched && <section className="space-y-3"><div><h2 className="text-xl font-bold">{from} to {to}</h2><p className="mt-1 text-sm text-muted-foreground">{date} · {travellers} traveller{travellers === "1" ? "" : "s"}</p></div>{BUSES.map((bus) => <article key={bus.name} className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><div><h3 className="font-bold">{bus.name}</h3><p className="mt-1 text-sm text-muted-foreground">{bus.type}</p><div className="mt-4 flex items-center gap-4 text-sm"><span className="font-bold">{bus.leave}</span><span className="h-px w-10 bg-slate-300" /><span className="font-bold">{bus.arrive}</span><span className="flex items-center gap-1 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{bus.duration}</span></div></div><div className="text-sm text-emerald-700">{bus.seats} seats left</div><div className="flex items-center gap-4 md:block"><p className="font-bold">Rs.{bus.price}</p><p className="mb-2 text-xs text-muted-foreground">per seat</p><Button onClick={() => bookBus(bus.name)} className="bg-[#118ab2] hover:bg-[#08769b]">Select seats</Button></div></article>)}</section>}</TabsContent>
      <TabsContent value="cab" className="space-y-5"><section className="rounded-lg border bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2"><Field label="Pickup" value={pickup} setValue={setPickup} icon={MapPin} /><Field label="Drop location" value={drop} setValue={setDrop} icon={MapPin} /></div></section><section className="rounded-lg border bg-white"><div className="border-b p-4"><h2 className="text-xl font-bold">Choose your ride</h2><p className="mt-1 text-sm text-muted-foreground">Cars available near your pickup point.</p></div>{CARS.map((item) => <button type="button" key={item.name} onClick={() => setSelectedCar(item.name)} className={`flex w-full items-center gap-4 border-b p-4 text-left last:border-0 ${selectedCar === item.name ? "bg-cyan-50" : "hover:bg-slate-50"}`}><div className="flex h-11 w-12 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{item.icon}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-bold">{item.name}</span>{selectedCar === item.name && <span className="rounded bg-[#118ab2] px-2 py-0.5 text-[10px] font-bold text-white">SELECTED</span>}</div><p className="text-sm text-muted-foreground">{item.detail} · {item.eta}</p></div><span className="font-bold">Rs.{item.price}</span></button>)}</section><Button onClick={bookCar} className="h-12 w-full bg-[#118ab2] text-base hover:bg-[#08769b]"><CarFront className="mr-2 h-5 w-5" />Request {car.name} · Rs.{car.price}</Button></TabsContent>
    </Tabs>
  </div>;
}

function Field({ label, value, setValue, icon: Icon }: { label: string; value: string; setValue: (value: string) => void; icon: typeof MapPin }) {
  return <label className="grid gap-1 text-xs font-semibold text-slate-600">{label}<span className="relative"><Icon className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={value} onChange={(event) => setValue(event.target.value)} className="h-11 pl-9" /></span></label>;
}
