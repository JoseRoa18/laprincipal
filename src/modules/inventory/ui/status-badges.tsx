import { Badge } from "@/components/ui/badge";
import type { AdjustmentStatus } from "@/modules/inventory/infrastructure/adjustments";
import type { CountStatus } from "@/modules/inventory/infrastructure/counts";
import { ADJUSTMENT_STATUS_LABEL, COUNT_STATUS_LABEL } from "@/modules/inventory/infrastructure/labels";

export function AdjustmentStatusBadge({ status }: { status: AdjustmentStatus }) {
  const variant = status === "applied" ? "default" : status === "draft" ? "secondary" : "outline";
  return <Badge variant={variant}>{ADJUSTMENT_STATUS_LABEL[status]}</Badge>;
}

export function CountStatusBadge({ status }: { status: CountStatus }) {
  const variant = status === "applied" ? "default" : status === "open" ? "secondary" : "outline";
  return <Badge variant={variant}>{COUNT_STATUS_LABEL[status]}</Badge>;
}

export function countFilterLabel(filter: { categoryId?: string | null; locationPrefix?: string | null }, categoryName: string | null): string {
  const parts: string[] = [];
  if (filter.categoryId) parts.push(categoryName ?? "Categoría");
  if (filter.locationPrefix) parts.push(`Ubicación ${filter.locationPrefix}*`);
  return parts.length ? parts.join(" · ") : "Todo el inventario";
}
