import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/format";
import { STOCK_STATUS_LABEL } from "@/components/app/stock-status-badge";
import type { RateSet } from "@/modules/currency/domain/conversion";
import { fromUsd } from "@/modules/currency/domain/conversion";
import { describeRange, formatDay } from "../domain/date-range";
import type { InventoryValuation } from "./inventory-report";
import type { MarginReport } from "./margin-report";
import type { NoMovementReport } from "./no-movement-report";
import type { SalesReport } from "./sales-report";
import type { VelocityRow } from "./velocity-report";

export type CellKind = "text" | "money" | "qty" | "int" | "pct";

export interface SheetColumn {
  header: string;
  key: string;
  kind?: CellKind;
  width?: number;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  /** Any plain objects; cells are read by `column.key`. */
  rows: ReadonlyArray<object>;
  /** Free text lines above the table (title, period). */
  notes?: string[];
}

const NUM_FMT: Record<CellKind, string | undefined> = {
  text: undefined,
  money: "#,##0.00",
  qty: "#,##0.###",
  int: "0",
  pct: '0.0" %"',
};

function cellValue(value: unknown, kind: CellKind): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (kind === "text") return String(value);
  if (value instanceof Date) return formatDateTime(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : String(value);
}

/** Excel sheet names: max 31 chars, none of []:*?/\ */
function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

export async function buildWorkbook(sheets: Sheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "La Principal 2050";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.name));
    let rowIndex = 1;
    for (const note of sheet.notes ?? []) {
      const cell = ws.getCell(rowIndex, 1);
      cell.value = note;
      cell.font = { bold: rowIndex === 1, size: rowIndex === 1 ? 13 : 11 };
      rowIndex++;
    }
    if (sheet.notes?.length) rowIndex++;

    const headerRow = ws.getRow(rowIndex);
    sheet.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
      cell.border = { bottom: { style: "thin" } };
      ws.getColumn(i + 1).width = col.width ?? Math.max(12, Math.min(col.header.length + 4, 40));
    });
    headerRow.commit();
    rowIndex++;

    for (const row of sheet.rows) {
      const r = ws.getRow(rowIndex);
      const record = row as Record<string, unknown>;
      sheet.columns.forEach((col, i) => {
        const kind = col.kind ?? "text";
        const cell = r.getCell(i + 1);
        cell.value = cellValue(record[col.key], kind);
        const fmt = NUM_FMT[kind];
        if (fmt && typeof cell.value === "number") cell.numFmt = fmt;
      });
      r.commit();
      rowIndex++;
    }
    ws.views = [{ state: "frozen", ySplit: rowIndex - sheet.rows.length - 1 }];
  }

  // exceljs returns a Node Buffer; copy it into a standalone ArrayBuffer for the Response body.
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return bytes.buffer as ArrayBuffer;
}

// --- Sheet builders per report --------------------------------------------

const money = (header: string, key: string): SheetColumn => ({ header, key, kind: "money", width: 14 });
const qty = (header: string, key: string): SheetColumn => ({ header, key, kind: "qty", width: 12 });
const int = (header: string, key: string): SheetColumn => ({ header, key, kind: "int", width: 10 });
const pct = (header: string, key: string): SheetColumn => ({ header, key, kind: "pct", width: 10 });
const text = (header: string, key: string, width = 28): SheetColumn => ({ header, key, kind: "text", width });

export function salesSheets(report: SalesReport): Sheet[] {
  const notes = ["Reporte de ventas", describeRange(report.range)];
  const t = report.totals;
  return [
    {
      name: "Resumen",
      notes,
      columns: [text("Indicador", "label", 32), { header: "Valor", key: "value", width: 16 }],
      rows: [
        { label: "Total vendido (USD)", value: Number(t.total) },
        { label: "Cantidad de ventas", value: t.count },
        { label: "Ticket promedio (USD)", value: Number(t.avgTicket) },
        { label: "Unidades vendidas", value: Number(t.units) },
        { label: "IVA (USD)", value: Number(t.tax) },
        { label: "Descuentos (USD)", value: Number(t.discount) },
        { label: "Ventas anuladas", value: report.voided.count },
        { label: "Monto anulado (USD)", value: Number(report.voided.total) },
        { label: "Devoluciones", value: report.returned.count },
        { label: "Monto devuelto (USD)", value: Number(report.returned.total) },
      ],
    },
    {
      name: "Por día",
      notes,
      columns: [text("Día", "day", 14), int("Ventas", "count"), money("Total USD", "total")],
      rows: report.byDay.map((r) => ({ day: formatDay(r.day), count: r.count, total: r.total })),
    },
    {
      name: "Por producto",
      notes,
      columns: [text("SKU", "sku", 14), text("Producto", "name", 40), text("N.º de parte", "partNumber", 18), qty("Unidades", "units"), money("Ingresos USD", "revenue"), pct("% del total", "share")],
      rows: report.byProduct,
    },
    {
      name: "Por categoría",
      notes,
      columns: [text("Categoría", "name", 32), qty("Unidades", "units"), money("Ingresos USD", "revenue"), pct("% del total", "share")],
      rows: report.byCategory,
    },
    {
      name: "Por vendedor",
      notes,
      columns: [text("Vendedor", "name", 32), int("Ventas", "count"), money("Total USD", "total"), pct("% del total", "share")],
      rows: report.bySeller,
    },
    {
      name: "Por método de pago",
      notes,
      columns: [text("Método", "name", 28), text("Moneda", "currencyCode", 10), money("Monto en moneda", "amount"), money("Equivalente USD", "amountUsd"), int("Ventas", "count"), pct("% de pagos", "share")],
      rows: report.byMethod,
    },
    {
      name: "Por hora",
      notes,
      columns: [text("Hora", "hour", 10), int("Ventas", "count"), money("Total USD", "total")],
      rows: report.byHour.map((r) => ({ hour: `${String(r.hour).padStart(2, "0")}:00`, count: r.count, total: r.total })),
    },
  ];
}

export function inventorySheets(v: InventoryValuation, rates: RateSet): Sheet[] {
  const notes = ["Inventario valorizado a costo promedio", `Generado el ${formatDateTime(new Date())}`];
  const bs = (usd: string) => (rates.VES ? fromUsd(usd, "VES", rates).toNumber() : null);
  const cop = (usd: string) => (rates.COP ? fromUsd(usd, "COP", rates, 0).toNumber() : null);
  return [
    {
      name: "Resumen",
      notes,
      columns: [text("Indicador", "label", 32), { header: "Valor", key: "value", width: 18 }],
      rows: [
        { label: "Valor total a costo (USD)", value: Number(v.totalValue) },
        { label: "Valor total a costo (Bs)", value: bs(v.totalValue) },
        { label: "Valor total a costo (COP)", value: cop(v.totalValue) },
        { label: "Unidades en existencia", value: Number(v.totalQty) },
        { label: "Productos con existencia", value: v.withStock },
        { label: "Productos sin existencia", value: v.withoutStock },
      ],
    },
    {
      name: "Por categoría",
      notes,
      columns: [text("Categoría", "name", 32), int("Productos", "products"), qty("Unidades", "quantity"), money("Valor USD", "value"), pct("% del total", "share")],
      rows: v.byCategory,
    },
    {
      name: "Por producto",
      notes,
      columns: [
        text("SKU", "sku", 14),
        text("Producto", "name", 40),
        text("N.º de parte", "partNumber", 18),
        text("Categoría", "category", 24),
        qty("Existencia", "quantity"),
        money("Costo prom. USD", "costAvg"),
        money("Valor USD", "value"),
      ],
      rows: v.rows,
    },
  ];
}

export function velocitySheets(rows: VelocityRow[], computedAt: Date | null): Sheet[] {
  return [
    {
      name: "Velocidad y reposición",
      notes: ["Velocidad de venta, cobertura y sugerencia de compra", computedAt ? `Calculado el ${formatDateTime(computedAt)}` : "Sin cálculo todavía"],
      columns: [
        text("SKU", "sku", 14),
        text("Producto", "name", 40),
        text("N.º de parte", "partNumber", 18),
        text("Categoría", "category", 24),
        qty("Disponible", "available"),
        { header: "Velocidad/día", key: "velocity", kind: "qty", width: 14 },
        { header: "Velocidad 30 d", key: "velocity30", kind: "qty", width: 14 },
        { header: "Cobertura (días)", key: "daysOfCover", kind: "qty", width: 16 },
        text("ABC", "abcClass", 6),
        text("Estado", "statusLabel", 14),
        text("Modo", "modeLabel", 10),
        qty("Punto de reorden sugerido", "suggestedReorderPoint"),
        qty("Cantidad sugerida", "suggestedQty"),
        qty("Unidades 90 d", "units90"),
        text("Última venta", "lastSale", 18),
      ],
      rows: rows.map((r) => ({
        ...r,
        statusLabel: STOCK_STATUS_LABEL[r.status],
        modeLabel: r.mode === "auto" ? "Automático" : "Manual",
        lastSale: r.lastSaleAt ? formatDateTime(r.lastSaleAt) : "Nunca",
      })),
    },
  ];
}

export function marginSheets(report: MarginReport): Sheet[] {
  const notes = ["Margen bruto (ingresos sin IVA menos costo promedio al momento de la venta)", describeRange(report.range)];
  const cols = [qty("Unidades", "units"), money("Ingresos sin IVA", "revenue"), money("Costo USD", "cost"), money("Margen USD", "margin"), pct("Margen %", "marginPct")];
  return [
    {
      name: "Por producto",
      notes,
      columns: [text("Producto", "name", 40), text("N.º de parte", "detail", 18), ...cols],
      rows: [...report.byProduct, { ...report.totals, detail: "" }],
    },
    {
      name: "Por categoría",
      notes,
      columns: [text("Categoría", "name", 32), ...cols],
      rows: [...report.byCategory, report.totals],
    },
  ];
}

export function noMovementSheets(report: NoMovementReport): Sheet[] {
  return [
    {
      name: "Sin movimiento",
      notes: [`Productos con existencia y sin ventas en ${report.days} días`, `Generado el ${formatDateTime(new Date())}`],
      columns: [
        text("SKU", "sku", 14),
        text("Producto", "name", 40),
        text("N.º de parte", "partNumber", 18),
        text("Categoría", "category", 24),
        qty("Existencia", "quantity"),
        money("Costo prom. USD", "costAvg"),
        money("Valor inmovilizado USD", "value"),
        text("Última venta", "lastSale", 18),
        text("Última entrada", "lastInbound", 18),
        int("Días sin vender", "idleDays"),
      ],
      rows: report.rows.map((r) => ({
        ...r,
        lastSale: r.lastSaleAt ? formatDateTime(r.lastSaleAt) : "Nunca",
        lastInbound: r.lastInboundAt ? formatDateTime(r.lastInboundAt) : "",
      })),
    },
  ];
}
