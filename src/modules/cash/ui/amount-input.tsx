"use client";

import { Input } from "@/components/ui/input";
import { cn } from "cn";

/** Text input for money with the currency symbol on the left. Accepts "1.234,56" or "1234.56". */
export function AmountInput({ symbol, className, ...props }: React.ComponentProps<typeof Input> & { symbol: string }) {
  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">{symbol}</span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={cn("h-11 pl-12 text-right text-lg tabular-nums", className)}
        {...props}
      />
    </div>
  );
}
