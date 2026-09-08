import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPct } from "@/lib/format";

/**
 * Stat tile: label, a headline value and an optional signed delta against a
 * named period. The delta always carries an icon and text, never color alone.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  upIsGood = true,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Percentage change; null hides the delta; undefined shows nothing. */
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold whitespace-nowrap">{value}</div>
        {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
        {delta === null && deltaLabel ? <p className="text-muted-foreground text-xs">Sin datos para comparar con {deltaLabel}</p> : null}
        {typeof delta === "number" ? <Delta value={delta} label={deltaLabel} upIsGood={upIsGood} /> : null}
      </CardContent>
    </Card>
  );
}

export function Delta({ value, label, upIsGood = true }: { value: number; label?: string; upIsGood?: boolean }) {
  const rounded = Math.round(value * 10) / 10;
  const flat = rounded === 0;
  const good = flat ? null : rounded > 0 === upIsGood;
  const Icon = flat ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-xs tabular-nums",
        flat ? "text-muted-foreground" : good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>
        {rounded > 0 ? "+" : ""}
        {formatPct(rounded)}
        {label ? ` vs. ${label}` : ""}
      </span>
    </p>
  );
}
