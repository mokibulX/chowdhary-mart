import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Gift, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type PartnerOffer = { id: number; title: string; subtitle?: string | null; imageUrl: string; linkUrl?: string | null; partnerBonus?: string | number | null };

export function DeliveryPartnerOffers() {
  const { data: offers = [] } = useQuery<PartnerOffer[]>({ queryKey: ["/api/delivery/offers"], queryFn: () => customFetch<PartnerOffer[]>("/api/delivery/offers"), retry: false });
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [offers.length]);
  useEffect(() => { if (offers.length < 2) return; const timer = window.setInterval(() => setIndex((current) => (current + 1) % offers.length), 5000); return () => window.clearInterval(timer); }, [offers.length]);
  if (!offers.length) return null;
  const offer = offers[index % offers.length];
  const bonus = Number(offer.partnerBonus ?? 0);
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-orange-600" /><h2 className="font-bold">Partner offers</h2></div>{offers.length > 1 && <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setIndex((index - 1 + offers.length) % offers.length)} aria-label="Previous offer"><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setIndex((index + 1) % offers.length)} aria-label="Next offer"><ChevronRight className="h-4 w-4" /></Button></div>}</div>
    <a href={offer.linkUrl || "#"} onClick={(event) => { if (!offer.linkUrl) event.preventDefault(); }} className="block"><img src={offer.imageUrl} alt={offer.title} className="aspect-[2.8/1] w-full object-cover" loading="lazy" /><div className="p-4"><h3 className="text-lg font-bold">{offer.title}</h3>{offer.subtitle && <p className="mt-1 text-sm text-muted-foreground">{offer.subtitle}</p>}{bonus > 0 && <p className="mt-3 flex items-center gap-2 font-semibold text-emerald-700"><Gift className="h-4 w-4" /> Earn Rs.{bonus.toFixed(0)} extra on every completed delivery</p>}</div></a>
  </section>;
}
