import { testMode } from "@/lib/test-mode";

export function DemoModeBadge() {
  if (!testMode.enabled || !testMode.showBadge) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 z-40 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 truncate rounded-full border border-amber-300 bg-amber-100/95 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-950 shadow-md bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:left-auto md:right-3 md:top-[calc(env(safe-area-inset-top)+122px)] md:bottom-auto md:translate-x-0 md:text-[11px]">
      DEMO MODE - GPS is live
    </div>
  );
}
