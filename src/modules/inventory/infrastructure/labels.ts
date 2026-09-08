import type { MovementType } from "@/db/schema/enums";

/** Spanish labels for kardex movement types. Shared by every module that lists movements. */
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  initial: "Inventario inicial",
  purchase_in: "Entrada por compra",
  purchase_void_out: "Anulación de compra",
  manual_in: "Entrada manual",
  manual_out: "Salida manual",
  sale_out: "Venta",
  sale_void_in: "Anulación de venta",
  return_in: "Devolución",
  adjust_in: "Ajuste (+)",
  adjust_out: "Ajuste (−)",
  count_adjust: "Ajuste por conteo",
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABEL) as MovementType[];

export function movementLabel(type: string): string {
  return MOVEMENT_TYPE_LABEL[type as MovementType] ?? type;
}

/** Labels for `inventory_movements.reference_type`. */
export const REFERENCE_TYPE_LABEL: Record<string, string> = {
  sale: "Venta",
  sale_return: "Devolución",
  return: "Devolución",
  quote: "Cotización",
  purchase_receipt: "Entrada",
  adjustment: "Ajuste",
  count: "Conteo",
  product: "Producto",
  import: "Importación",
};

export function referenceLabel(referenceType: string | null): string {
  if (!referenceType) return "";
  return REFERENCE_TYPE_LABEL[referenceType] ?? referenceType;
}

/** Link to the document that originated a movement, when the app has a screen for it. */
export function referenceHref(referenceType: string | null, referenceId: string | null): string | null {
  if (!referenceType || !referenceId) return null;
  switch (referenceType) {
    case "sale":
      return `/ventas/${referenceId}`;
    case "sale_return":
    case "return":
      return `/ventas/${referenceId}`;
    case "purchase_receipt":
      return `/compras/entradas/${referenceId}`;
    case "adjustment":
      return `/inventario/ajustes/${referenceId}`;
    case "count":
      return `/inventario/conteos/${referenceId}`;
    case "product":
      return `/productos/${referenceId}`;
    default:
      return null;
  }
}

export const ADJUSTMENT_STATUS_LABEL: Record<"draft" | "applied" | "cancelled", string> = {
  draft: "Borrador",
  applied: "Aplicado",
  cancelled: "Cancelado",
};

export const COUNT_STATUS_LABEL: Record<"open" | "applied" | "cancelled", string> = {
  open: "En curso",
  applied: "Aplicado",
  cancelled: "Cancelado",
};

export const REASON_KIND_LABEL: Record<"increase" | "decrease" | "both", string> = {
  increase: "Entrada",
  decrease: "Salida",
  both: "Entrada o salida",
};

export const STOCK_MODE_LABEL: Record<"manual" | "auto", string> = {
  manual: "Manual",
  auto: "Automático",
};
