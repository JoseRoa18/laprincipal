import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { StockStatus } from "@/modules/inventory/domain/velocity";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  buy_now: "Comprar ya",
  soon: "Pronto",
  ok: "OK",
  excess: "Exceso",
  no_data: "Sin datos",
};

const STYLES: Record<StockStatus, string> = {
  buy_now: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  soon: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  ok: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  excess: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  no_data: "border-transparent bg-muted text-muted-foreground",
};

/** Traffic-light badge for stock status. Color plus text, never color alone. */
export function StockStatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STYLES[status], className)}>
      {STOCK_STATUS_LABEL[status]}
    </Badge>
  );
}
