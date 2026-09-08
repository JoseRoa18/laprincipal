import { z } from "zod";
import { parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { isValidBarcodeText, normalizeBarcode } from "./barcodes";
import { isValidSku, normalizeSku } from "./sku";

/** Option value used by the brand select to reveal the "new brand" input. */
export const NEW_BRAND_OPTION = "__new__";

export const APPLIANCE_TYPES = ["Nevera", "Congelador", "Lavadora", "Secadora", "Aire acondicionado", "Cocina", "Horno", "Microondas", "Calentador", "Otro"];

const isNumber = (v: string) => v === "" || parseLocalizedNumber(v) !== null;
const isNonNegative = (v: string) => v === "" || D(parseLocalizedNumber(v) ?? "0").gte(0);

const optionalMoney = z
  .string()
  .trim()
  .refine(isNumber, "Escribe un número, por ejemplo 12,50")
  .refine(isNonNegative, "No puede ser negativo");

const optionalQty = z
  .string()
  .trim()
  .refine(isNumber, "Escribe una cantidad, por ejemplo 10")
  .refine(isNonNegative, "No puede ser negativa");

export const equivalenceSchema = z.object({
  code: z.string().trim().min(1, "Escribe el código equivalente").max(80, "Máximo 80 caracteres"),
  brand: z.string().trim().max(80, "Máximo 80 caracteres"),
});

export const compatibilitySchema = z
  .object({
    applianceType: z.string().trim().max(60, "Máximo 60 caracteres"),
    brand: z.string().trim().max(80, "Máximo 80 caracteres"),
    model: z.string().trim().max(80, "Máximo 80 caracteres"),
  })
  .refine((c) => c.applianceType !== "" || c.brand !== "" || c.model !== "", {
    message: "Completa al menos el tipo, la marca o el modelo",
    path: ["model"],
  });

/**
 * Product form values. Numbers travel as strings (typed by the user, "12,50" or "12.50")
 * so the same schema validates in the browser (react-hook-form) and in the server action.
 */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre del producto").max(200, "Máximo 200 caracteres"),
    sku: z
      .string()
      .trim()
      .max(40, "Máximo 40 caracteres")
      .refine((v) => v === "" || isValidSku(normalizeSku(v) ?? ""), "Solo letras, números, punto, guion y guion bajo"),
    partNumber: z.string().trim().max(80, "Máximo 80 caracteres"),
    description: z.string().trim().max(2000, "Máximo 2000 caracteres"),
    categoryId: z.string(),
    brandId: z.string(),
    newBrandName: z.string().trim().max(80, "Máximo 80 caracteres"),
    unitId: z.string().min(1, "Elige la unidad"),
    taxId: z.string().min(1, "Elige el impuesto"),
    warrantyDays: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,4}$/.test(v), "Días enteros, por ejemplo 30"),
    locationCode: z.string().trim().max(40, "Máximo 40 caracteres"),
    isActive: z.boolean(),
    publicPriceUsd: z
      .string()
      .trim()
      .min(1, "El precio público es obligatorio")
      .refine(isNumber, "Escribe un número, por ejemplo 12,50")
      .refine(isNonNegative, "El precio no puede ser negativo"),
    techPriceUsd: optionalMoney,
    costUsd: optionalMoney,
    initialStock: optionalQty,
    minStock: optionalQty,
    maxStock: optionalQty,
    barcode: z
      .string()
      .trim()
      .max(48, "Máximo 48 caracteres")
      .refine((v) => v === "" || isValidBarcodeText(normalizeBarcode(v)), "Código inválido: usa letras y números sin espacios"),
    generateInternalBarcode: z.boolean(),
    equivalences: z.array(equivalenceSchema),
    compatibilities: z.array(compatibilitySchema),
  })
  .refine((d) => d.brandId !== NEW_BRAND_OPTION || d.newBrandName !== "", {
    message: "Escribe el nombre de la nueva marca",
    path: ["newBrandName"],
  })
  .refine(
    (d) => {
      const min = parseLocalizedNumber(d.minStock);
      const max = parseLocalizedNumber(d.maxStock);
      if (!min || !max || D(max).isZero()) return true;
      return D(max).gte(D(min));
    },
    { message: "El máximo debe ser mayor o igual al mínimo", path: ["maxStock"] },
  );

export type ProductFormValues = z.infer<typeof productFormSchema>;

export function emptyProductForm(defaults: { unitId: string; taxId: string }): ProductFormValues {
  return {
    name: "",
    sku: "",
    partNumber: "",
    description: "",
    categoryId: "",
    brandId: "",
    newBrandName: "",
    unitId: defaults.unitId,
    taxId: defaults.taxId,
    warrantyDays: "",
    locationCode: "",
    isActive: true,
    publicPriceUsd: "",
    techPriceUsd: "",
    costUsd: "",
    initialStock: "",
    minStock: "",
    maxStock: "",
    barcode: "",
    generateInternalBarcode: true,
    equivalences: [],
    compatibilities: [],
  };
}

/** Normalized, typed input consumed by the application layer (create/update/import). */
export interface ProductInput {
  name: string;
  /** Custom SKU or null to auto-generate. */
  sku: string | null;
  partNumber: string | null;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  /** Brand to create when brandId is null. */
  newBrandName: string | null;
  unitId: string;
  taxId: string;
  warrantyDays: number;
  locationCode: string | null;
  isActive: boolean;
  /** Decimal strings ("12.50"). */
  publicPriceUsd: string;
  techPriceUsd: string | null;
  costUsd: string | null;
  initialStock: string | null;
  minStock: string;
  maxStock: string;
  /** Manufacturer barcode to register, already normalized. */
  barcode: string | null;
  generateInternalBarcode: boolean;
  equivalences: Array<{ code: string; brand: string | null }>;
  compatibilities: Array<{ applianceType: string | null; brand: string | null; model: string | null }>;
}

const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());
const num = (v: string): string | null => parseLocalizedNumber(v);

/** Convert validated form values into the normalized application input. */
export function toProductInput(values: ProductFormValues): ProductInput {
  const wantsNewBrand = values.brandId === NEW_BRAND_OPTION;
  return {
    name: values.name.trim(),
    sku: normalizeSku(values.sku),
    partNumber: orNull(values.partNumber),
    description: orNull(values.description),
    categoryId: orNull(values.categoryId),
    brandId: wantsNewBrand ? null : orNull(values.brandId),
    newBrandName: wantsNewBrand ? orNull(values.newBrandName) : null,
    unitId: values.unitId,
    taxId: values.taxId,
    warrantyDays: values.warrantyDays === "" ? 0 : Number(values.warrantyDays),
    locationCode: orNull(values.locationCode)?.toUpperCase() ?? null,
    isActive: values.isActive,
    publicPriceUsd: num(values.publicPriceUsd) ?? "0",
    techPriceUsd: num(values.techPriceUsd),
    costUsd: num(values.costUsd),
    initialStock: num(values.initialStock),
    minStock: num(values.minStock) ?? "0",
    maxStock: num(values.maxStock) ?? "0",
    barcode: values.barcode.trim() === "" ? null : normalizeBarcode(values.barcode),
    generateInternalBarcode: values.generateInternalBarcode,
    equivalences: values.equivalences.map((e) => ({ code: e.code.trim(), brand: orNull(e.brand) })),
    compatibilities: values.compatibilities.map((c) => ({
      applianceType: orNull(c.applianceType),
      brand: orNull(c.brand),
      model: orNull(c.model),
    })),
  };
}
