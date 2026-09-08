import { cn } from "cn";
import { VIZ_ROOT } from "./viz";

/** Horizontal bar for a share (0-100 %). Thin, rounded at the data end, square at the baseline. */
export function ShareBar({ pct, className }: { pct: number; className?: string }) {
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className={cn("bg-muted h-3 w-full min-w-20 overflow-hidden rounded-[4px]", className)} aria-hidden="true">
      <div className={cn(VIZ_ROOT, "h-full rounded-r-[4px] bg-(--viz-accent)")} style={{ width: `${width}%` }} />
    </div>
  );
}
