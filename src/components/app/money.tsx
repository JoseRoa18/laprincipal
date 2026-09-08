import { cn } from "cn";
import { formatMoney } from "@/lib/format";
import type { Num } from "@/lib/money";

/** Renders an amount with its currency symbol, tabular digits and optional sign color. */
export function Money({
  value,
  currency = "USD",
  className,
  colored = false,
  decimals,
}: {
  value: Num;
  currency?: string;
  className?: string;
  colored?: boolean;
  decimals?: number;
}) {
  const text = formatMoney(value, currency, { decimals });
  const negative = text.startsWith("-");
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        colored && (negative ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"),
        className,
      )}
    >
      {text}
    </span>
  );
}
