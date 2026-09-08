/** Client-safe labels and small formatters shared by pages, dialogs and documents. */

export type SaleStatus = "held" | "completed" | "voided" | "refunded" | "partially_refunded";
export type QuoteStatus = "open" | "accepted" | "converted" | "expired" | "cancelled";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  held: "En espera",
  completed: "Completada",
  voided: "Anulada",
  refunded: "Devuelta",
  partially_refunded: "Devolución parcial",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  open: "Abierta",
  accepted: "Aceptada",
  converted: "Convertida en venta",
  expired: "Vencida",
  cancelled: "Cancelada",
};

/** Hours elapsed since a sale (void window check). */
export function hoursSince(date: Date, now = Date.now()): number {
  return (now - date.getTime()) / 3_600_000;
}

/** "2026-09-15" → "15/09/2026" without timezone shifts (date-only columns). */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/** Digits for a wa.me link: Venezuelan numbers starting with 0 get the 58 prefix. */
export function whatsappPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}
