/** Auto-generated SKUs look like LP-000001. Users may override with a custom code. */
export const SKU_PREFIX = "LP-";
export const SKU_PADDING = 6;
/** Letters, digits, dot, dash and underscore; 1 to 40 characters. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;

export function formatSku(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("La secuencia del SKU debe ser un entero positivo");
  }
  return `${SKU_PREFIX}${String(sequence).padStart(SKU_PADDING, "0")}`;
}

/** Sequence of an auto-generated SKU (LP-000123 → 123); null for custom SKUs. */
export function parseSkuSequence(sku: string): number | null {
  const match = new RegExp(`^${SKU_PREFIX}(\\d+)$`).exec(sku.trim());
  return match ? Number(match[1]) : null;
}

/** Upper-cased, trimmed custom SKU with spaces turned into dashes; null when empty. */
export function normalizeSku(input: string | null | undefined): string | null {
  const value = (input ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  return value === "" ? null : value;
}

export function isValidSku(sku: string): boolean {
  return SKU_PATTERN.test(sku);
}
