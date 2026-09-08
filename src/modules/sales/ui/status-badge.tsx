import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { QUOTE_STATUS_LABEL, SALE_STATUS_LABEL, type QuoteStatus, type SaleStatus } from "../application/labels";

const SALE_STYLES: Record<SaleStatus, string> = {
  held: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  completed: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  voided: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  refunded: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  partially_refunded: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

const QUOTE_STYLES: Record<QuoteStatus, string> = {
  open: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  accepted: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  converted: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  expired: "border-transparent bg-muted text-muted-foreground",
  cancelled: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

/** Sale status with colour and text (never colour alone). */
export function SaleStatusBadge({ status, className }: { status: SaleStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(SALE_STYLES[status], className)}>
      {SALE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(QUOTE_STYLES[status], className)}>
      {QUOTE_STATUS_LABEL[status]}
    </Badge>
  );
}
