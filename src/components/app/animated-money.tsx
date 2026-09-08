"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { formatMoney } from "@/lib/format";

/**
 * Counts up from 0 to the amount on first render (about 700 ms, ease-out).
 * Jumps straight to the value when the user prefers reduced motion.
 */
export function AnimatedMoney({
  value,
  currency = "USD",
  className,
  durationMs = 700,
}: {
  value: string | number;
  currency?: string;
  className?: string;
  durationMs?: number;
}) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0 : durationMs;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return <span className={cn("tabular-nums whitespace-nowrap", className)}>{formatMoney(shown, currency)}</span>;
}
