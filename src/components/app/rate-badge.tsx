import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";

/** Server component: shows today's rates or a warning when they are missing. */
export async function RateBadge({ canEdit }: { canEdit: boolean }) {
  const snap = await getRatesSnapshot();
  const href = canEdit ? "/configuracion/tasas" : "#";

  if (snap.missing.length > 0) {
    return (
      <Link href={href} className="inline-flex h-11 items-center">
        <Badge variant="destructive" className="gap-1">
          <TriangleAlert className="size-3" />
          Sin tasa {snap.missing.join(" y ")}
        </Badge>
      </Link>
    );
  }

  const parts = snap.rates.map((r) => `${r.currencyCode === "VES" ? "Bs" : r.currencyCode} ${formatMoney(r.rate, r.currencyCode, { symbol: "" }).trim()}`);
  const isStale = snap.stale.length > 0;

  return (
    <Link href={href} className="inline-flex h-11 items-center" title={isStale ? "La tasa no es de hoy" : "Tasa del día por 1 USD"}>
      <Badge variant={isStale ? "secondary" : "outline"} className="gap-1 font-normal tabular-nums">
        {isStale ? <TriangleAlert className="text-warning size-3" /> : null}
        <span className="text-muted-foreground">1 $ =</span> {parts.join(" · ")}
      </Badge>
    </Link>
  );
}
