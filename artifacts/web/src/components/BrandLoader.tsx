import { Apple, Coffee, Headphones, Package, Shirt, Smartphone, ShoppingBag } from "lucide-react";

type BrandLoaderProps = {
  label?: string;
};

export function BrandLoader({ label = "Loading..." }: BrandLoaderProps) {
  const floatingItems = [
    { Icon: ShoppingBag, className: "lch-loader-item-1" },
    { Icon: Smartphone, className: "lch-loader-item-2" },
    { Icon: Apple, className: "lch-loader-item-3" },
    { Icon: Headphones, className: "lch-loader-item-4" },
    { Icon: Shirt, className: "lch-loader-item-5" },
    { Icon: Coffee, className: "lch-loader-item-6" },
    { Icon: Package, className: "lch-loader-item-7" },
  ];

  return (
    <div
      className="app-shell min-h-screen items-center justify-center bg-slate-50"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {floatingItems.map(({ Icon, className }) => (
              <span key={className} className={`lch-loader-item ${className}`}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
            ))}
          </div>
          <span className="absolute inset-0 rounded-full border border-orange-200/80 shadow-[0_8px_25px_rgba(249,115,22,0.12)]" />
          <span className="absolute inset-1 rounded-full border-2 border-transparent border-t-orange-500 border-r-emerald-400 motion-safe:animate-spin motion-safe:[animation-duration:2.8s]" />
          <span className="absolute inset-3 rounded-full border border-transparent border-b-sky-400 border-l-orange-300 motion-safe:animate-spin motion-safe:[animation-direction:reverse] motion-safe:[animation-duration:2.1s]" />
          <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.16)]">
            <img src="/app-logo.png" alt="" className="h-full w-full rounded-xl object-contain" />
          </span>
        </div>
        <span className="text-sm font-semibold tracking-wide text-slate-600">{label}</span>
      </div>
    </div>
  );
}
