import ExcelJS from "exceljs";
import { D } from "@/lib/money";
import { IMPORT_COLUMNS, matchHeader, type ImportColumnKey, type RawImportRow } from "../domain/import-rows";
import type { ProductExportRow } from "./products-list";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 20;
}

/** Excel template with the product columns, a help sheet and reference lists. */
export async function buildImportTemplate(lists: { categoryPaths: string[]; units: Array<{ name: string; symbol: string }> }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "La Principal 2050";

  const ws = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws.getRow(1));
  IMPORT_COLUMNS.forEach((c, i) => {
    if (c.hint) ws.getRow(1).getCell(i + 1).note = c.hint;
  });
  const numericKeys: ImportColumnKey[] = ["publicPrice", "techPrice", "cost", "initialStock", "minStock", "maxStock", "warrantyDays"];
  for (const key of numericKeys) {
    const col = ws.getColumn(key);
    col.numFmt = key === "warrantyDays" || key === "initialStock" || key === "minStock" || key === "maxStock" ? "0.###" : "0.00";
  }
  // Barcodes and SKUs must stay text so Excel does not turn them into scientific notation.
  ws.getColumn("barcode").numFmt = "@";
  ws.getColumn("sku").numFmt = "@";

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [
    { header: "Columna", key: "col", width: 24 },
    { header: "Obligatoria", key: "req", width: 12 },
    { header: "Cómo llenarla", key: "hint", width: 90 },
  ];
  styleHeader(help.getRow(1));
  for (const c of IMPORT_COLUMNS) help.addRow({ col: c.header.replace("*", ""), req: c.required ? "Sí" : "No", hint: c.hint });
  help.addRow({});
  help.addRow({ col: "Ejemplo", hint: "Compresor Embraco 1/3 HP | EMB-123 | Refrigeración > Compresores | Embraco | u | 120,50 | 108,45 | 80 | 3 | 1 | 10 | P2-E3 | 7591234567890 | FFI12HBX, EMB123 | Nevera Mabe RMS400; Nevera LG GT32 | | 90" });
  help.addRow({ col: "Notas", hint: "Los números aceptan coma o punto decimal. Las filas con errores no se importan; corrígelas y vuelve a subir el archivo. Puedes deshacer una importación desde la misma pantalla." });

  const ref = wb.addWorksheet("Listas");
  ref.columns = [
    { header: "Categorías (copiar tal cual)", key: "cat", width: 48 },
    { header: "Unidades", key: "unit", width: 20 },
  ];
  styleHeader(ref.getRow(1));
  const max = Math.max(lists.categoryPaths.length, lists.units.length);
  for (let i = 0; i < max; i++) {
    const u = lists.units[i];
    ref.addRow({ cat: lists.categoryPaths[i] ?? "", unit: u ? `${u.symbol} (${u.name})` : "" });
  }
  if (lists.categoryPaths.length > 0) {
    // Typed as a per-cell property in exceljs; the range form exists at runtime.
    const validations = (ws as unknown as { dataValidations: { add: (range: string, v: ExcelJS.DataValidation) => void } }).dataValidations;
    validations.add("D2:D2000", {
      type: "list",
      allowBlank: true,
      showErrorMessage: false,
      formulae: [`Listas!$A$2:$A$${lists.categoryPaths.length + 1}`],
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value) {
      const link = value as ExcelJS.CellHyperlinkValue;
      return String(link.text ?? link.hyperlink ?? "").trim();
    }
    if ("text" in value) return String(value.text).trim();
  }
  return String(value).trim();
}

export interface ParsedWorkbook {
  rows: RawImportRow[];
  headers: string[];
  unknownHeaders: string[];
  missingRequired: string[];
}

/** Read the first sheet (or the one named "Productos") into raw rows keyed by template column. */
export async function parseImportWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("Productos") ?? wb.worksheets[0];
  if (!ws) return { rows: [], headers: [], unknownHeaders: [], missingRequired: ["Nombre", "Precio público USD"] };

  const headerRow = ws.getRow(1);
  const columnMap = new Map<number, ImportColumnKey>();
  const headers: string[] = [];
  const unknownHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellToString(cell.value);
    if (!text) return;
    headers.push(text);
    const key = matchHeader(text);
    if (key) columnMap.set(colNumber, key);
    else unknownHeaders.push(text);
  });
  const mapped = new Set(columnMap.values());
  const missingRequired = IMPORT_COLUMNS.filter((c) => c.required && !mapped.has(c.key)).map((c) => c.header.replace("*", ""));

  const rows: RawImportRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Partial<Record<ImportColumnKey, string>> = {};
    let hasData = false;
    for (const [colNumber, key] of columnMap) {
      const text = cellToString(row.getCell(colNumber).value);
      if (text) hasData = true;
      values[key] = text;
    }
    if (hasData) rows.push({ rowNumber, values });
  });

  return { rows, headers, unknownHeaders, missingRequired };
}

const STATUS_LABEL: Record<string, string> = { buy_now: "Comprar ya", soon: "Pronto", ok: "OK", excess: "Exceso", no_data: "Sin datos" };

/** Workbook with the current catalog (same columns as the template plus stock and status). */
export async function buildProductsWorkbook(rows: ProductExportRow[], opts: { includeCosts: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "La Principal 2050";
  const ws = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: "SKU", key: "sku", width: 14 },
    { header: "Nombre", key: "name", width: 40 },
    { header: "Número de parte", key: "partNumber", width: 18 },
    { header: "Categoría", key: "category", width: 30 },
    { header: "Marca", key: "brand", width: 16 },
    { header: "Unidad", key: "unit", width: 10 },
    { header: "Precio público USD", key: "publicPrice", width: 18 },
    { header: "Precio técnico USD", key: "techPrice", width: 18 },
    ...(opts.includeCosts ? [{ header: "Costo USD", key: "cost", width: 12 }] : []),
    { header: "Stock disponible", key: "stock", width: 14 },
    { header: "Mínimo", key: "minStock", width: 10 },
    { header: "Máximo", key: "maxStock", width: 10 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Ubicación", key: "location", width: 12 },
    { header: "Código de barras", key: "barcode", width: 18 },
    { header: "Equivalencias", key: "equivalences", width: 24 },
    { header: "Compatibilidades", key: "compatibilities", width: 34 },
    { header: "Descripción", key: "description", width: 30 },
    { header: "Garantía días", key: "warrantyDays", width: 12 },
    { header: "Activo", key: "active", width: 8 },
  ];
  ws.columns = columns;
  styleHeader(ws.getRow(1));
  ws.getColumn("barcode").numFmt = "@";

  const num = (v: string | null) => (v === null ? null : D(v).toNumber());
  for (const r of rows) {
    ws.addRow({
      sku: r.sku,
      name: r.name,
      partNumber: r.partNumber ?? "",
      category: r.categoryPath ?? "",
      brand: r.brandName ?? "",
      unit: r.unitSymbol,
      publicPrice: num(r.publicPriceUsd),
      techPrice: num(r.techPriceUsd),
      ...(opts.includeCosts ? { cost: num(r.costAvgUsd) } : {}),
      stock: num(r.stockAvailable),
      minStock: num(r.minStock),
      maxStock: num(r.maxStock),
      status: STATUS_LABEL[r.status] ?? r.status,
      location: r.locationCode ?? "",
      barcode: r.barcodes,
      equivalences: r.equivalences,
      compatibilities: r.compatibilities,
      description: r.description ?? "",
      warrantyDays: r.warrantyDays,
      active: r.isActive ? "Sí" : "No",
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
