export type LabelFormat = "roll" | "a4";

export interface LabelLayout {
  label: string;
  description: string;
  pageWidthMm: number;
  pageHeightMm: number;
  cols: number;
  rows: number;
  cellWidthMm: number;
  cellHeightMm: number;
}

export const LABEL_FORMATS: Record<LabelFormat, LabelLayout> = {
  roll: {
    label: "Rollo 50 × 25 mm",
    description: "Una etiqueta por página, para impresoras de etiquetas.",
    pageWidthMm: 50,
    pageHeightMm: 25,
    cols: 1,
    rows: 1,
    cellWidthMm: 50,
    cellHeightMm: 25,
  },
  a4: {
    label: "Hoja A4 (40 por hoja)",
    description: "Cuadrícula de 4 columnas × 10 filas, celdas de 52,5 × 29,7 mm.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 4,
    rows: 10,
    cellWidthMm: 52.5,
    cellHeightMm: 29.7,
  },
};

export const MAX_LABELS = 400;

export interface LabelRequestItem {
  productId: string;
  quantity: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse "id:2,id:1" (query string form) into items. Invalid entries are ignored. */
export function parseLabelItems(text: string | null | undefined): LabelRequestItem[] {
  if (!text) return [];
  const out: LabelRequestItem[] = [];
  for (const part of text.split(",")) {
    const [id, qty] = part.split(":");
    if (!id || !UUID.test(id.trim())) continue;
    const quantity = Math.max(1, Math.min(MAX_LABELS, Math.floor(Number(qty ?? "1")) || 1));
    out.push({ productId: id.trim(), quantity });
  }
  return out;
}

export function serializeLabelItems(items: LabelRequestItem[]): string {
  return items.map((i) => `${i.productId}:${Math.max(1, Math.floor(i.quantity))}`).join(",");
}

/** One entry per physical label, capped at MAX_LABELS. */
export function expandLabelItems(items: LabelRequestItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity && out.length < MAX_LABELS; i++) out.push(item.productId);
  }
  return out;
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function truncateLabel(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function isLabelFormat(value: unknown): value is LabelFormat {
  return value === "roll" || value === "a4";
}
