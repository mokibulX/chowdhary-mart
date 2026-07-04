import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Headphones, Mail, MessageCircle, Phone, Search } from "lucide-react";

const FAQS = [
  ["Where is my order?", "Open My Orders and tap Track Live to see rider location, ETA and order progress."],
  ["How do I cancel an order?", "Open the order detail page and use Cancel Order before it is delivered."],
  ["Which payments are accepted?", "Chowdhary Mart currently supports Cash on Delivery and UPI payment from any UPI app."],
  ["What is the delivery time?", "The delivery target is 40 minutes for serviceable addresses within 5 km of the local store/storage hub."],
  ["What can I return?", "Only damaged items are eligible for return. Please share details and proof from My Returns."],
  ["Can sellers upload multiple photos?", "Yes. Seller product form supports multiple uploads and image URLs."],
];

const POLICIES = [
  {
    title: "5 km service area",
    body: "Chowdhary Mart accepts orders only for addresses within 5 km of the local store/storage hub. Orders outside this range may be rejected or require manual support.",
  },
  {
    title: "40 minute delivery target",
    body: "Delivery is targeted within 40 minutes after order confirmation. ETA may change because of traffic, address accuracy, weather, stock checks or partner availability.",
  },
  {
    title: "Delivery acceptance",
    body: "If delivery cannot be completed because of wrong address, customer unavailability, local restriction or similar reason, the order remains payable and must be accepted when re-attempted or collected, unless Chowdhary Mart cancels it.",
  },
  {
    title: "Damaged item return only",
    body: "Returns are accepted only for damaged items reported with clear details and proof. Change of mind, size preference or normal taste/quality preference is not eligible in this local delivery policy.",
  },
];

export default function HelpSupport() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const filtered = FAQS.filter(([title, body]) => `${title} ${body}`.toLowerCase().includes(query.toLowerCase()));

  const submitTicket = (event: React.FormEvent) => {
    event.preventDefault();
    toast({ title: "Support ticket created", description: "Our team will get back shortly." });
    setMessage("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-lg border bg-white p-5">
        <Badge className="mb-3 bg-primary/10 text-primary hover:bg-primary/10">Help center</Badge>
        <h1 className="text-2xl font-bold">How can we help?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find order, payment, seller and delivery support in one place.</p>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search help topics..." />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <a href="tel:1800000000" className="rounded-lg border bg-white p-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <Phone className="mb-3 h-5 w-5 text-primary" />
          <p className="font-semibold">Call support</p>
          <p className="text-sm text-muted-foreground">10 AM - 8 PM</p>
        </a>
        <a href="mailto:support@chowdharymart.test" className="rounded-lg border bg-white p-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <Mail className="mb-3 h-5 w-5 text-blue-600" />
          <p className="font-semibold">Email us</p>
          <p className="text-sm text-muted-foreground">24 hour response</p>
        </a>
        <div className="rounded-lg border bg-white p-4">
          <MessageCircle className="mb-3 h-5 w-5 text-green-700" />
          <p className="font-semibold">Live chat</p>
          <p className="text-sm text-muted-foreground">Coming online soon</p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-bold">Popular questions</h2>
        <div className="space-y-2">
          {filtered.map(([title, body]) => (
            <div key={title} className="rounded-lg border p-3">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
          {!filtered.length && <p className="py-6 text-center text-sm text-muted-foreground">No matching help topic found.</p>}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-bold">Policies, Terms & Conditions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICIES.map((item) => (
            <div key={item.title} className="rounded-lg border bg-gray-50 p-3">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Headphones className="h-5 w-5 text-primary" />Create support ticket</h2>
        <form onSubmit={submitTicket} className="space-y-3">
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} required placeholder="Tell us what happened..." rows={4} />
          <Button type="submit" disabled={!message.trim()}>Submit ticket</Button>
        </form>
      </section>
    </div>
  );
}
