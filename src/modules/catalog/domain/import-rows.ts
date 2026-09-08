import { parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { isValidBarcodeText, normalizeBarcode } from "./barcodes";
import type { ProductInput } from "./product-schema";
import { normalizeSearch } from "./search-text";
import { isValidSku, normalizeSku } from "./sku";

/** Columns of the Excel template, in order. Headers are matched ignoring accents, case and "*". */
export const IMPORT_COLUMNS = [
  { key: "sku", header: "SKU", required: false, width: 14, hint: "Opcional. Se genera LP-000001 si está vacío." },
  { key: "name", header: "Nombre*", required: true, width: 40, hint: "Obligatorio." },
  { key: "partNumber", header: "Número de parte", required: false, width: 18, hint: "Código del fabricante." },
  { key: "category", header: "Categoría", required: false, width: 30, hint: "Ruta 'Refrigeración > Compresores' o nombre de la subcategoría." },
  { key: "brand", header: "Marca", required: false, width: 16, hint: "Se crea si no existe." },
  { key: "unit", header: "Unidad", required: false, width: 10, hint: "Símbolo o nombre: u, m, kg. Vacío = Unidad." },
  { key: "publicPrice", header: "Precio público USD*", required: true, width: 18, hint: "Obligatorio. Con IVA incluido." },
  { key: "techPrice", header: "Precio técnico USD", required: false, width: 18, hint: "Vacío = se calcula con el descuento configurado." },
  { key: "cost", header: "Costo USD", required: false, width: 12, hint: "Costo unitario." },
  { key: "initialStock", header: "Stock inicial", required: false, width: 12, hint: "Genera un movimiento de inventario inicial." },
  { key: "minStock", header: "Mínimo", required: false, width: 10, hint: "Stock mínimo." },
  { key: "maxStock", header: "Máximo", required: false, width: 10, hint: "Stock máximo." },
  { key: "location", header: "Ubicación", required: false, width: 12, hint: "Estante, por ejemplo P2-E3." },
  { key: "barcode", header: "Código de barras", required: false, width: 16, hint: "Código del fabricante. Vacío = se genera uno interno." },
  { key: "equivalences", header: "Equivalencias", required: false, width: 24, hint: "Códigos separados por coma." },
  { key: "compatibilities", header: "Compatibilidades", required: false, width: 34, hint: "'Tipo Marca Modelo' separados por punto y coma: Nevera Mabe RMS400; Nevera LG GT32" },
  { key: "description", header: "Descripción", required: false, width: 30, hint: "" },
  { key: "warrantyDays", header: "Garantía días", required: false, width: 12, hint: "Días de garantía, entero." },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

export interface RawImportRow {
  /** Excel row number (1-based, header is row 1). */
  rowNumber: number;
  values: Partial<Record<ImportColumnKey, string>>;
}

export interface ImportCategoryLookup {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ImportLookups {
  categories: ImportCategoryLookup[];
  units: Array<{ id: string; name: string; symbol: string }>;
  brands: Array<{ id: string; name: string }>;
  /** Upper-cased SKUs already in the database (including deleted products). */
  existingSkus: Set<string>;
  existingBarcodes: Set<string>;
  defaultUnitId: string;
  defaultTaxId: string;
}

export interface ImportRowResult {
  rowNumber: number;
  name: string;
  sku: string | null;
  errors: string[];
  warnings: string[];
  input: ProductInput | null;
}

function headerKey(text: string): string {
  return normalizeSearch(text).replace(/\*/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  codigo: "sku",
  "codigo interno": "sku",
  nombre: "name",
  producto: "name",
  "numero de parte": "partNumber",
  parte: "partNumber",
  categoria: "category",
  marca: "brand",
  unidad: "unit",
  "precio publico": "publicPrice",
  "precio publico usd": "publicPrice",
  precio: "publicPrice",
  "precio tecnico": "techPrice",
  "precio tecnico usd": "techPrice",
  costo: "cost",
  "costo usd": "cost",
  "stock inicial": "initialStock",
  existencia: "initialStock",
  minimo: "minStock",
  maximo: "maxStock",
  ubicacion: "location",
  "codigo de barras": "barcode",
  barcode: "barcode",
  equivalencias: "equivalences",
  compatibilidades: "compatibilities",
  compatible: "compatibilities",
  descripcion: "description",
  garantia: "warrantyDays",
  "garantia dias": "warrantyDays",
};

/** Map a spreadsheet header to a template column; null when unknown. */
export function matchHeader(header: string): ImportColumnKey | null {
  const key = headerKey(header);
  if (!key) return null;
  for (const col of IMPORT_COLUMNS) {
    if (headerKey(col.header) === key) return col.key;
  }
  return HEADER_ALIASES[key] ?? null;
}

/** "FFI12HBX, EMB123" → ["FFI12HBX", "EMB123"] */
export function parseEquivalences(text: string | undefined): string[] {
  if (!text) return [];
  const codes = text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(codes)];
}

export interface ParsedCompatibility {
  applianceType: string | null;
  brand: string | null;
  model: string | null;
}

/**
 * "Nevera Mabe RMS400; Nevera LG GT32" → type / brand / model per entry.
 * Entries may also be written as "Nevera | Mabe | RMS400". Two words are read as brand + model.
 */
export function parseCompatibilities(text: string | undefined): ParsedCompatibility[] {
  if (!text) return [];
  const out: ParsedCompatibility[] = [];
  for (const entry of text.split(/[;\n]/)) {
    const e = entry.trim();
    if (!e) continue;
    if (e.includes("|") || e.includes("/")) {
      const [type, brand, ...rest] = e.split(/[|/]/).map((s) => s.trim());
      out.push({ applianceType: type || null, brand: brand || null, model: rest.join(" ").trim() || null });
      continue;
    }
    const tokens = e.split(/\s+/);
    if (tokens.length === 1) out.push({ applianceType: null, brand: null, model: tokens[0] });
    else if (tokens.length === 2) out.push({ applianceType: null, brand: tokens[0], model: tokens[1] });
    else out.push({ applianceType: tokens[0], brand: tokens[1], model: tokens.slice(2).join(" ") });
  }
  return out;
}

export type CategoryResolution = { id: string } | { error: string } | null;

/** Resolve "Refrigeración > Compresores", "Compresores" or "Refrigeración" to a category. */
export function resolveCategory(text: string | undefined, categories: ImportCategoryLookup[]): CategoryResolution {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const norm = (s: string) => normalizeSearch(s);

  if (raw.includes(">")) {
    const segments = raw.split(">").map((s) => norm(s)).filter(Boolean);
    let parentId: string | null = null;
    let current: ImportCategoryLookup | undefined;
    for (const segment of segments) {
      current = categories.find((c) => c.parentId === parentId && norm(c.name) === segment);
      if (!current) return { error: `La categoría "${raw}" no existe` };
      parentId = current.id;
    }
    return current ? { id: current.id } : { error: `La categoría "${raw}" no existe` };
  }

  const matches = categories.filter((c) => norm(c.name) === norm(raw));
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length === 0) return { error: `La categoría "${raw}" no existe` };
  const paths = matches.map((m) => (m.parentId ? `${byId.get(m.parentId)?.name ?? "?"} > ${m.name}` : m.name));
  return { error: `Categoría ambigua "${raw}": usa la ruta completa (${paths.join(" o ")})` };
}

export function resolveUnit(text: string | undefined, units: ImportLookups["units"]): { id: string } | { error: string } | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const n = normalizeSearch(raw);
  const unit = units.find((u) => normalizeSearch(u.symbol) === n || normalizeSearch(u.name) === n);
  return unit ? { id: unit.id } : { error: `La unidad "${raw}" no existe` };
}

function readNumber(value: string | undefined, label: string, errors: string[], opts: { required?: boolean; integer?: boolean } = {}): string | null {
  const raw = (value ?? "").trim();
  if (!raw) {
    if (opts.required) errors.push(`${label} es obligatorio`);
    return null;
  }
  const parsed = parseLocalizedNumber(raw);
  if (parsed === null) {
    errors.push(`${label}: "${raw}" no es un número`);
    return null;
  }
  const d = D(parsed);
  if (d.lt(0)) {
    errors.push(`${label} no puede ser negativo`);
    return null;
  }
  if (opts.integer && !d.isInteger()) {
    errors.push(`${label} debe ser un entero`);
    return null;
  }
  return parsed;
}

/** Validate every row. Rows with errors get `input: null`; valid rows get a ProductInput. */
export function validateImportRows(rows: RawImportRow[], lookups: ImportLookups): ImportRowResult[] {
  const seenSkus = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const brandByName = new Map(lookups.brands.map((b) => [normalizeSearch(b.name), b]));

  return rows.map((row) => {
    const v = row.values;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = (v.name ?? "").trim();
    if (!name) errors.push("Nombre es obligatorio");
    else if (name.length > 200) errors.push("Nombre: máximo 200 caracteres");

    let sku: string | null = null;
    try {
      sku = normalizeSku(v.sku);
      if (sku && !isValidSku(sku)) {
        errors.push(`SKU "${sku}" inválido: solo letras, números, punto, guion y guion bajo`);
      } else if (sku) {
        if (lookups.existingSkus.has(sku)) errors.push(`El SKU ${sku} ya existe`);
        const prev = seenSkus.get(sku);
        if (prev) errors.push(`El SKU ${sku} está repetido (fila ${prev})`);
        else seenSkus.set(sku, row.rowNumber);
      }
    } catch {
      errors.push("SKU inválido");
    }

    let categoryId: string | null = null;
    const cat = resolveCategory(v.category, lookups.categories);
    if (cat && "error" in cat) errors.push(cat.error);
    else if (cat) categoryId = cat.id;

    let unitId = lookups.defaultUnitId;
    const unit = resolveUnit(v.unit, lookups.units);
    if (unit && "error" in unit) errors.push(unit.error);
    else if (unit) unitId = unit.id;

    let brandId: string | null = null;
    let newBrandName: string | null = null;
    const brandText = (v.brand ?? "").trim();
    if (brandText) {
      const found = brandByName.get(normalizeSearch(brandText));
      if (found) brandId = found.id;
      else {
        newBrandName = brandText;
        warnings.push(`Se creará la marca "${brandText}"`);
      }
    }

    const publicPrice = readNumber(v.publicPrice, "Precio público", errors, { required: true });
    const techPrice = readNumber(v.techPrice, "Precio técnico", errors);
    const cost = readNumber(v.cost, "Costo", errors);
    const initialStock = readNumber(v.initialStock, "Stock inicial", errors);
    const minStock = readNumber(v.minStock, "Mínimo", errors);
    const maxStock = readNumber(v.maxStock, "Máximo", errors);
    if (minStock && maxStock && !D(maxStock).isZero() && D(maxStock).lt(D(minStock))) {
      errors.push("Máximo debe ser mayor o igual al mínimo");
    }
    const warranty = readNumber(v.warrantyDays, "Garantía", errors, { integer: true });
    if (publicPrice && cost && D(publicPrice).lt(D(cost))) warnings.push("El precio público es menor que el costo");

    let barcode: string | null = null;
    const barcodeText = (v.barcode ?? "").trim();
    if (barcodeText) {
      barcode = normalizeBarcode(barcodeText);
      if (!isValidBarcodeText(barcode)) errors.push(`Código de barras "${barcodeText}" inválido`);
      else if (lookups.existingBarcodes.has(barcode)) errors.push(`El código de barras ${barcode} ya está registrado`);
      else {
        const prev = seenBarcodes.get(barcode);
        if (prev) errors.push(`El código de barras ${barcode} está repetido (fila ${prev})`);
        else seenBarcodes.set(barcode, row.rowNumber);
      }
    }

    const input: ProductInput | null =
      errors.length > 0
        ? null
        : {
            name,
            sku,
            partNumber: (v.partNumber ?? "").trim() || null,
            description: (v.description ?? "").trim() || null,
            categoryId,
            brandId,
            newBrandName,
            unitId,
            taxId: lookups.defaultTaxId,
            warrantyDays: warranty ? Number(warranty) : 0,
            locationCode: (v.location ?? "").trim().toUpperCase() || null,
            isActive: true,
            publicPriceUsd: publicPrice ?? "0",
            techPriceUsd: techPrice,
            costUsd: cost,
            initialStock,
            minStock: minStock ?? "0",
            maxStock: maxStock ?? "0",
            barcode,
            generateInternalBarcode: barcode === null,
            equivalences: parseEquivalences(v.equivalences).map((code) => ({ code, brand: null })),
            compatibilities: parseCompatibilities(v.compatibilities),
          };

    return { rowNumber: row.rowNumber, name, sku, errors, warnings, input };
  });
}
