export type ReceiptStatus = "draft" | "applied" | "voided";

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  draft: "Borrador",
  applied: "Aplicada",
  voided: "Anulada",
};

export const CURRENCY_LABEL: Record<string, string> = {
  USD: "Dólares (USD)",
  VES: "Bolívares (Bs)",
  COP: "Pesos (COP)",
};

export function currencyLabel(code: string): string {
  return CURRENCY_LABEL[code] ?? code;
}
