import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { refreshBcvRateIfDue } from "@/modules/currency/application/bcv-sync";
import { BCV_CURRENCY } from "@/modules/currency/domain/bcv";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";

/**
 * Server component: shows today's rates or a warning when they are missing.
 * When the Bs rate is behind it asks the BCV again after the response.
 */
export async function RateBadge({ canEdit }: { canEdit: boolean }) {
  const href = canEdit ? "/configuracion/tasas" : "#";
  // The badge is in every page's header: a brief database failure here must not take the page down.
  const snap = await getRatesSnapshot().catch((err: unknown) => {
    console.error("[rate-badge]", err);
    return null;
  });
  if (!snap) {
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <TriangleAlert className="size-3" /> Tasa no disponible
      </Badge>
    );
  }
  if (snap.missing.includes(BCV_CURRENCY) || snap.stale.includes(BCV_CURRENCY)) after(() => refreshBcvRateIfDue());

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
