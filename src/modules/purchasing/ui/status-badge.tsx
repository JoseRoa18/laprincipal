import { Badge } from "@/components/ui/badge";
import { RECEIPT_STATUS_LABEL, type ReceiptStatus } from "@/modules/purchasing/infrastructure/labels";

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const variant = status === "applied" ? "default" : status === "draft" ? "secondary" : "destructive";
  return <Badge variant={variant}>{RECEIPT_STATUS_LABEL[status]}</Badge>;
}
