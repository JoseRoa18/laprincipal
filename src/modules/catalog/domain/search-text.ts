/**
 * products.search_text is a lower-cased, accent-stripped concatenation of every
 * field a user may type to find a spare part. Rebuilt by the application on every save.
 */

/** Normalize text the same way `products.search_text` is built: lower-case, no accents. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Words of a search, normalized, as LIKE patterns that all must match, in any
 * order: "compresor 1/3" finds "Compresor Embraco 1/3 HP". `%` and `_` typed
 * by the user are matched literally.
 */
export function searchPatterns(text: string): string[] {
  return normalizeSearch(text)
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .map((word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

/** Code without separators ("EMB-123 A" → "emb123a") so users can type codes either way. */
export function compactCode(text: string): string {
  return normalizeSearch(text).replace(/[^a-z0-9]+/g, "");
}

export interface SearchTextInput {
  name: string;
  /** Product code: part number or internal LP-000001. */
  sku: string;
  brandName?: string | null;
  categoryName?: string | null;
  equivalenceCodes?: Array<string | null | undefined>;
  compatibilities?: Array<{ applianceType?: string | null; brand?: string | null; model?: string | null }>;
  barcodes?: Array<string | null | undefined>;
}

export const SEARCH_SEPARATOR = " | ";

export function buildSearchText(input: SearchTextInput): string {
  const parts: string[] = [];
  const push = (value: string | null | undefined) => {
    const normalized = normalizeSearch(value ?? "");
    if (normalized) parts.push(normalized);
  };
  const pushCode = (value: string | null | undefined) => {
    push(value);
    const compact = compactCode(value ?? "");
    if (compact && compact !== normalizeSearch(value ?? "")) parts.push(compact);
  };

  push(input.name);
  pushCode(input.sku);
  push(input.brandName);
  push(input.categoryName);
  for (const code of input.equivalenceCodes ?? []) pushCode(code);
  for (const c of input.compatibilities ?? []) {
    push([c.applianceType, c.brand, c.model].filter(Boolean).join(" "));
    if (c.model) pushCode(c.model);
  }
  for (const code of input.barcodes ?? []) push(code);

  return [...new Set(parts)].join(SEARCH_SEPARATOR);
}
