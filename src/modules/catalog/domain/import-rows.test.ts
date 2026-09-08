import { describe, expect, it } from "vitest";
import { matchHeader, parseCompatibilities, parseEquivalences, resolveCategory, validateImportRows, type ImportLookups } from "./import-rows";

const categories = [
  { id: "ref", name: "Refrigeración", parentId: null },
  { id: "ref-comp", name: "Compresores", parentId: "ref" },
  { id: "aa", name: "Aires acondicionados", parentId: null },
  { id: "aa-comp", name: "Compresores", parentId: "aa" },
  { id: "otros", name: "Otros", parentId: null },
];

const lookups: ImportLookups = {
  categories,
  units: [
    { id: "u", name: "Unidad", symbol: "u" },
    { id: "m", name: "Metro", symbol: "m" },
  ],
  brands: [{ id: "b1", name: "Embraco" }],
  existingSkus: new Set(["LP-000001"]),
  existingBarcodes: new Set(["7591234567890"]),
  defaultUnitId: "u",
  defaultTaxId: "tax",
};

describe("matchHeader", () => {
  it("matches template headers ignoring accents, case and asterisks", () => {
    expect(matchHeader("Nombre*")).toBe("name");
    expect(matchHeader("nombre")).toBe("name");
    expect(matchHeader("NÚMERO DE PARTE")).toBe("partNumber");
    expect(matchHeader("Precio publico USD")).toBe("publicPrice");
    expect(matchHeader("Garantía días")).toBe("warrantyDays");
    expect(matchHeader("Columna rara")).toBeNull();
  });
});

describe("parsers", () => {
  it("splits equivalences by comma or semicolon", () => {
    expect(parseEquivalences("FFI12HBX, EMB123;  FFI12HBX")).toEqual(["FFI12HBX", "EMB123"]);
    expect(parseEquivalences(undefined)).toEqual([]);
  });

  it("parses compatibilities as type brand model", () => {
    expect(parseCompatibilities("Nevera Mabe RMS400; Nevera LG GT32 Plus")).toEqual([
      { applianceType: "Nevera", brand: "Mabe", model: "RMS400" },
      { applianceType: "Nevera", brand: "LG", model: "GT32 Plus" },
    ]);
    expect(parseCompatibilities("Mabe RMS400")).toEqual([{ applianceType: null, brand: "Mabe", model: "RMS400" }]);
    expect(parseCompatibilities("Nevera | Mabe | RMS 400")).toEqual([{ applianceType: "Nevera", brand: "Mabe", model: "RMS 400" }]);
  });
});

describe("resolveCategory", () => {
  it("resolves paths, unique names and reports ambiguity", () => {
    expect(resolveCategory("Refrigeración > Compresores", categories)).toEqual({ id: "ref-comp" });
    expect(resolveCategory("refrigeracion > compresores", categories)).toEqual({ id: "ref-comp" });
    expect(resolveCategory("Otros", categories)).toEqual({ id: "otros" });
    expect(resolveCategory("Compresores", categories)).toMatchObject({ error: expect.stringContaining("ambigua") });
    expect(resolveCategory("Lavadoras > Bombas", categories)).toMatchObject({ error: expect.stringContaining("no existe") });
    expect(resolveCategory("", categories)).toBeNull();
  });
});

describe("validateImportRows", () => {
  it("accepts a complete row and normalizes it", () => {
    const [row] = validateImportRows(
      [
        {
          rowNumber: 2,
          values: {
            name: "Compresor 1/3 HP",
            partNumber: "EMB-123",
            category: "Refrigeración > Compresores",
            brand: "embraco",
            unit: "u",
            publicPrice: "120,50",
            cost: "80",
            initialStock: "3",
            minStock: "1",
            maxStock: "10",
            location: "p2-e3",
            barcode: "4006381333931",
            equivalences: "FFI12HBX, EMB123",
            compatibilities: "Nevera Mabe RMS400",
            warrantyDays: "90",
          },
        },
      ],
      lookups,
    );
    expect(row.errors).toEqual([]);
    expect(row.input).toMatchObject({
      name: "Compresor 1/3 HP",
      sku: null,
      categoryId: "ref-comp",
      brandId: "b1",
      unitId: "u",
      publicPriceUsd: "120.50",
      costUsd: "80",
      initialStock: "3",
      minStock: "1",
      maxStock: "10",
      locationCode: "P2-E3",
      barcode: "4006381333931",
      generateInternalBarcode: false,
      warrantyDays: 90,
    });
    expect(row.input?.equivalences.map((e) => e.code)).toEqual(["FFI12HBX", "EMB123"]);
    expect(row.input?.compatibilities).toEqual([{ applianceType: "Nevera", brand: "Mabe", model: "RMS400" }]);
  });

  it("reports missing required fields, unknown category/unit, duplicates and existing codes", () => {
    const rows = validateImportRows(
      [
        { rowNumber: 2, values: { name: "", publicPrice: "abc", category: "No existe", unit: "caja" } },
        { rowNumber: 3, values: { name: "A", publicPrice: "1", sku: "LP-000001", barcode: "7591234567890", brand: "Danfoss" } },
        { rowNumber: 4, values: { name: "B", publicPrice: "2", sku: "NEW-1", barcode: "4006381333931" } },
        { rowNumber: 5, values: { name: "C", publicPrice: "3", sku: "new 1", barcode: "4006381333931", minStock: "5", maxStock: "2" } },
      ],
      lookups,
    );
    expect(rows[0].errors).toEqual(
      expect.arrayContaining([
        "Nombre es obligatorio",
        expect.stringContaining("no es un número"),
        expect.stringContaining("no existe"),
        expect.stringContaining('unidad "caja"'),
      ]),
    );
    expect(rows[1].errors).toEqual(expect.arrayContaining(["El SKU LP-000001 ya existe", expect.stringContaining("ya está registrado")]));
    expect(rows[1].warnings).toEqual([expect.stringContaining("Se creará la marca")]);
    expect(rows[2].errors).toEqual([]);
    expect(rows[2].input?.sku).toBe("NEW-1");
    expect(rows[3].errors).toEqual(
      expect.arrayContaining([expect.stringContaining("repetido (fila 4)"), expect.stringContaining("repetido (fila 4)"), "Máximo debe ser mayor o igual al mínimo"]),
    );
    expect(rows[3].input).toBeNull();
  });
});
