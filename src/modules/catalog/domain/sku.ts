/**
 * The product code ("sku" in the data): the manufacturer part number typed by
 * the user, or an internal LP-000001 assigned when the part has none.
 */
export const SKU_PREFIX = "LP-";
export const SKU_PADDING = 6;
/** Letters, digits, dot, dash, slash and underscore; 1 to 40 characters. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

export function formatSku(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("La secuencia del código interno debe ser un entero positivo");
  }
  return `${SKU_PREFIX}${String(sequence).padStart(SKU_PADDING, "0")}`;
}

/** Sequence of an internal code (LP-000123 → 123); null for part numbers. */
export function parseSkuSequence(sku: string): number | null {
  const match = new RegExp(`^${SKU_PREFIX}(\\d+)$`).exec(sku.trim());
  return match ? Number(match[1]) : null;
}

/** Upper-cased, trimmed part number with spaces turned into dashes; null when empty. */
export function normalizeSku(input: string | null | undefined): string | null {
  const value = (input ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  return value === "" ? null : value;
}

export function isValidSku(sku: string): boolean {
  return SKU_PATTERN.test(sku);
}

/** Code assigned by the system (LP-000001) because the product has no part number. */
export function isInternalCode(sku: string): boolean {
  return parseSkuSequence(sku) !== null;
}

/** How to call a product code on screen and on paper. */
export function codeLabel(sku: string): "Código interno" | "N.º de parte" {
  return isInternalCode(sku) ? "Código interno" : "N.º de parte";
}

export const INVALID_CODE_MESSAGE = "Solo letras, números, punto, guion, barra (/) y guion bajo";
