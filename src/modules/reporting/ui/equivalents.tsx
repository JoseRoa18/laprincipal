import { formatMoney } from "@/lib/format";
import type { Num } from "@/lib/money";
import { fromUsd, type RateSet } from "@/modules/currency/domain/conversion";

/** "Bs 1.234,56 · COP 52.000" for a USD amount, omitting currencies without a rate. */
export function equivalentsText(usd: Num, rates: RateSet): string {
  const parts: string[] = [];
  if (rates.VES) parts.push(formatMoney(fromUsd(usd, "VES", rates), "VES"));
  if (rates.COP) parts.push(formatMoney(fromUsd(usd, "COP", rates, 0), "COP"));
  return parts.join(" · ");
}

export function Equivalents({ usd, rates, className }: { usd: Num; rates: RateSet; className?: string }) {
  const text = equivalentsText(usd, rates);
  if (!text) return null;
  return <span className={className ?? "text-muted-foreground text-xs tabular-nums"}>{text}</span>;
}
