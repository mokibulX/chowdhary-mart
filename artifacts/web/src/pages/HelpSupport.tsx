import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListOrders } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  ChevronRight,
  CircleHelp,
  Headphones,
  Mail,
  MessageCircle,
  PackageSearch,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  action?: { label: string; href: string };
};

type SupportTopic = {
  label: string;
  icon: typeof PackageSearch;
  keywords: string[];
  answer: string;
  action?: { label: string; href: string };
};

const STATUS_LABELS: Record<string, string> = {
  pending: "The order is waiting for seller confirmation",
  confirmed: "The order is confirmed and being prepared",
  preparing: "The seller is preparing your order",
  packed: "The order is packed and waiting for rider pickup",
  picked_up: "The rider has picked up the order",
  on_the_way: "The order is on the way to your address",
  delivered: "The order has been delivered",
  cancelled: "The order has been cancelled",
};

const TOPICS: SupportTopic[] = [
  {
    label: "Where is my order?",
    icon: PackageSearch,
    keywords: ["order", "অর্ডার", "kothay", "কোথায়", "status", "track", "tracking", "late", "দেরি", "delivery"],
    answer: "Here is the live status of your latest order. Once a rider is assigned, the Track Order page will show the ETA and live location.",
    action: { label: "My orders", href: "/orders" },
  },
  {
    label: "Refund status",
    icon: WalletCards,
    keywords: ["refund", "রিফান্ড", "money back", "টাকা ফেরত", "payment back"],
    answer: "Refunds for cancelled orders or approved returns are sent to the original payment source or Chowdhary Mart Wallet. UPI and card refunds usually take 5-7 working days, depending on the bank. Wallet refunds appear sooner.",
    action: { label: "Check wallet", href: "/wallet" },
  },
  {
    label: "Return damaged item",
    icon: RotateCcw,
    keywords: ["return", "damage", "damaged", "ভাঙা", "নষ্ট", "খারাপ", "wrong item", "ভুল product"],
    answer: "For a damaged, leaking, expired, or incorrect item, submit a request from My Returns. Add clear photos and details as soon as possible after delivery. A replacement or refund decision will be provided after verification.",
    action: { label: "Start a return", href: "/returns" },
  },
  {
    label: "Cancel an order",
    icon: CircleHelp,
    keywords: ["cancel", "বাতিল", "cancellation"],
    answer: "You can cancel from the Order Details page before delivery. Cancellation may be restricted after seller packing or rider pickup. Eligible prepaid amounts are refunded after cancellation.",
    action: { label: "Open orders", href: "/orders" },
  },
  {
    label: "Payment problem",
    icon: ShieldCheck,
    keywords: ["payment", "upi", "card", "cod", "paid", "পেমেন্ট", "টাকা কেটেছে", "failed"],
    answer: "If payment failed but money was deducted, do not pay again immediately for the same order. Allow time for the bank reversal. If no order was created, submit a support request with the transaction reference. COD payment is collected at delivery.",
    action: { label: "View transactions", href: "/wallet" },
  },
  {
    label: "Delivery and address",
    icon: Headphones,
    keywords: ["address", "location", "gps", "distance", "5 km", "fee", "charge", "ঠিকানা", "লোকেশন"],
    answer: "Delivery depends on nearby seller coverage and your live location. Set the correct pin or GPS location before checkout. Delivery fee, free-delivery rules, and ETA are shown in the cart before order confirmation.",
    action: { label: "Manage addresses", href: "/addresses" },
  },
];

const FAQS = [
  ["How long does delivery take?", "The target delivery time is about 40 minutes. ETA may change because of traffic, weather, stock checks, or rider availability."],
  ["When will I receive a refund?", "Wallet refunds appear quickly. UPI and card refunds usually take 5-7 working days, depending on bank processing."],
  ["Which items can be returned?", "Damaged, expired, leaking, or incorrect items are eligible for return review when proof is provided."],
  ["Why is my order late?", "Seller preparation, traffic, weather, or rider availability can cause delays. Check the Track page for the latest status."],
  ["Can I change my delivery address?", "Edit the address before placing the order. A confirmed order may require a support request for an address change."],
  ["Payment deducted but order failed", "Do not pay again immediately. Wait for a bank reversal and submit a support request with the transaction reference if needed."],
];

function findOrderFromQuestion(input: string, orders: any[]) {
  const normalized = input.toLowerCase();
  return orders.find((order) => normalized.includes(String(order.orderNumber ?? "").toLowerCase()))
    ?? orders.find((order) => !["delivered", "cancelled"].includes(order.status))
    ?? orders[0];
}

function makeReply(input: string, orders: any[]) {
  const normalized = input.trim().toLowerCase();
  const exactTopic = TOPICS.find((item) => item.label.toLowerCase() === normalized);
  const topic = exactTopic ?? TOPICS.reduce<{ item: SupportTopic; score: number } | null>((best, item) => {
    const score = item.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
    if (!score || (best && best.score > score)) return best;
    return { item, score };
  }, null)?.item;

  if (!topic) {
    return {
      text: "I can help with order tracking, late delivery, cancellation, refunds, returns, payments, wallet, and address questions. Choose a quick question below or describe the issue in more detail.",
    };
  }

  if (topic.label === "Where is my order?") {
    const order = findOrderFromQuestion(input, orders);
    if (!order) {
      return { text: "No orders were found in your account. After placing an order, you can get status and tracking help here.", action: topic.action };
    }
    const status = STATUS_LABELS[order.status] ?? `Current status: ${order.status}`;
    const store = order.store?.name ? ` from ${order.store.name}` : "";
    return {
      text: `Order #${order.orderNumber}${store}: ${status}.${["picked_up", "on_the_way"].includes(order.status) ? " Open live tracking to see the rider location and ETA." : " You will receive an app notification when the status changes."}`,
      action: { label: "Track this order", href: `/orders/${order.id}` },
    };
  }

  return { text: topic.answer, action: topic.action };
}

export default function HelpSupport() {
  const { toast } = useToast();
  const { data } = useListOrders({});
  const orders = useMemo(() => Array.isArray(data) ? data : [], [data]);
  const [question, setQuestion] = useState("");
  const [ticket, setTicket] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Welcome. Ask where your order is, why delivery is late, when a refund will arrive, or how to return an item. I will help immediately.",
    },
  ]);

  const ask = (value = question) => {
    const clean = value.trim();
    if (!clean) return;
    const reply = makeReply(clean, orders);
    const stamp = Date.now();
    setMessages((current) => [
      ...current,
      { id: stamp, role: "user", text: clean },
      { id: stamp + 1, role: "assistant", text: reply.text, action: reply.action },
    ]);
    setQuestion("");
  };

  const submitTicket = (event: React.FormEvent) => {
    event.preventDefault();
    toast({ title: "Support request received", description: "Your request has been added to the review queue." });
    setTicket("");
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      <section className="border-b bg-white px-4 py-5 sm:px-6">
        <Badge className="mb-3 bg-primary/10 text-primary hover:bg-primary/10">Smart help</Badge>
        <h1 className="text-2xl font-bold">How can we help?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Get instant answers, tracking links, and refund guidance for orders and payments.</p>
      </section>

      <section className="grid min-h-[480px] overflow-hidden rounded-lg border bg-white shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-[480px] flex-col">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white"><Bot className="h-5 w-5" /></span>
            <div><p className="font-bold">Chowdhary Assistant</p><p className="text-xs text-green-700">Instant reply available</p></div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4 sm:p-5">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && <span className="mt-1 grid h-7 w-7 flex-none place-items-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>}
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-primary text-white" : "border bg-white text-gray-800"}`}>
                  <p>{message.text}</p>
                  {message.action && (
                    <Link href={message.action.href}>
                      <Button variant="link" className="mt-1 h-auto p-0 font-semibold text-primary">{message.action.label}<ChevronRight className="ml-1 h-4 w-4" /></Button>
                    </Link>
                  )}
                </div>
                {message.role === "user" && <span className="mt-1 grid h-7 w-7 flex-none place-items-center rounded-full bg-gray-200"><UserRound className="h-4 w-4" /></span>}
              </div>
            ))}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="flex gap-2 border-t bg-white p-3 sm:p-4">
            <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: Where is my order?" className="h-11" />
            <Button type="submit" size="icon" className="h-11 w-11 flex-none" disabled={!question.trim()} aria-label="Send question"><Send className="h-5 w-5" /></Button>
          </form>
        </div>

        <aside className="border-t bg-white p-4 lg:border-l lg:border-t-0">
          <h2 className="mb-3 font-bold">Quick questions</h2>
          <div className="space-y-2">
            {TOPICS.map((topic) => {
              const Icon = topic.icon;
              return (
                <button key={topic.label} type="button" onClick={() => ask(topic.label)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:border-primary hover:bg-orange-50">
                  <Icon className="h-4 w-4 flex-none text-primary" />
                  <span>{topic.label}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="rounded-lg border bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-bold">Frequently asked questions</h2>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {FAQS.map(([title, body]) => (
            <details key={title} className="group border-b py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold"><span>{title}</span><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></summary>
              <p className="pt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-white p-4 sm:grid-cols-[1fr_280px] sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-primary" />Still need help?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Include the order number, transaction reference, and issue details. Never share a password, OTP, or full card details.</p>
          <form onSubmit={submitTicket} className="mt-3 space-y-3">
            <Textarea value={ticket} onChange={(event) => setTicket(event.target.value)} required placeholder="Describe your issue..." rows={4} />
            <Button type="submit" disabled={!ticket.trim()}><Send className="mr-2 h-4 w-4" />Submit support request</Button>
          </form>
        </div>
        <div className="space-y-3 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <p className="font-semibold">Other support</p>
          <a href="mailto:support@chowdharymart.test" className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:bg-gray-50"><Mail className="h-4 w-4 text-primary" /><span><strong>Email support</strong><br /><span className="text-muted-foreground">Within 24 hours</span></span></a>
          <div className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Headphones className="h-4 w-4 text-primary" /><span><strong>Support hours</strong><br /><span className="text-muted-foreground">10 AM - 8 PM</span></span></div>
        </div>
      </section>
    </div>
  );
}
