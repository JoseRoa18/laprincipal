import ExcelJS from "exceljs";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { productSuppliers, products, stockLevels, suppliers, units } from "@/db/schema";
import { can, getSessionUser } from "@/lib/auth-guards";
import { businessDate } from "@/lib/format";
import { D } from "@/lib/money";
import { getDefaultLocation } from "@/modules/core/application/context";
import { NO_SUPPLIER_LABEL, getPurchaseSuggestions } from "@/modules/purchasing/infrastructure/suggestions";

const bodySchema = z.object({
  supplierId: z.uuid().nullable(),
  items: z.array(z.object({ productId: z.uuid(), quantity: z.number().positive() })).min(1).max(500),
});

interface OrderLine {
  sku: string;
  partNumber: string | null;
  name: string;
  supplierCode: string | null;
  unit: string;
  stock: string;
  quantity: string;
  unitCostUsd: string;
}

async function buildWorkbook(supplierName: string, currency: string | null, lines: OrderLine[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "La Principal 2050";
  const ws = wb.addWorksheet("Pedido");
  ws.addRow([`Pedido a ${supplierName}`]).font = { bold: true, size: 14 };
  ws.addRow([`Fecha: ${businessDate()}${currency ? ` · Moneda del proveedor: ${currency}` : ""}`]);
  ws.addRow([]);
  const header = ws.addRow(["SKU", "Número de parte", "Producto", "Código proveedor", "Unidad", "Existencia", "Cantidad a pedir", "Costo est. USD", "Total est. USD"]);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  let total = D(0);
  for (const l of lines) {
    const lineTotal = D(l.quantity).mul(D(l.unitCostUsd));
    total = total.plus(lineTotal);
    ws.addRow([l.sku, l.partNumber ?? "", l.name, l.supplierCode ?? "", l.unit, Number(l.stock), Number(l.quantity), Number(l.unitCostUsd), lineTotal.toNumber()]);
  }
  const totalRow = ws.addRow(["", "", "", "", "", "", "", "Total", total.toNumber()]);
  totalRow.font = { bold: true };
  ws.columns = [{ width: 14 }, { width: 18 }, { width: 44 }, { width: 16 }, { width: 8 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 }];
  ws.getColumn(8).numFmt = "#,##0.00";
  ws.getColumn(9).numFmt = "#,##0.00";
  return toBytes(await wb.xlsx.writeBuffer());
}

/** Copy into a plain ArrayBuffer-backed Uint8Array (what `Response` accepts). */
function toBytes(buffer: ExcelJS.Buffer): Uint8Array<ArrayBuffer> {
  const src = new Uint8Array(buffer as ArrayBuffer);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function xlsxResponse(bytes: Uint8Array<ArrayBuffer>, filename: string) {
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}

/** POST { supplierId, items: [{ productId, quantity }] } → Excel order for one supplier (edited quantities). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "purchases")) return new NextResponse("No autorizado", { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse("Datos inválidos", { status: 400 });
  const { supplierId, items } = parsed.data;

  const { warehouseId } = await getDefaultLocation();
  const ids = items.map((i) => i.productId);
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      partNumber: products.partNumber,
      name: products.name,
      unit: units.symbol,
      stock: stockLevels.quantity,
      costAvgUsd: products.costAvgUsd,
    })
    .from(products)
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .where(inArray(products.id, ids));

  let supplierName = NO_SUPPLIER_LABEL;
  let currency: string | null = null;
  const links = new Map<string, { supplierCode: string | null; lastCostUsd: string | null }>();
  if (supplierId) {
    const [s] = await db.select({ name: suppliers.name, currencyCode: suppliers.currencyCode }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
    if (!s) return new NextResponse("Proveedor no encontrado", { status: 404 });
    supplierName = s.name;
    currency = s.currencyCode;
    const ps = await db
      .select({ productId: productSuppliers.productId, supplierCode: productSuppliers.supplierCode, lastCostUsd: productSuppliers.lastCostUsd })
      .from(productSuppliers)
      .where(and(eq(productSuppliers.supplierId, supplierId), inArray(productSuppliers.productId, ids)));
    for (const l of ps) links.set(l.productId, l);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: OrderLine[] = items
    .map((i) => {
      const p = byId.get(i.productId);
      if (!p) return null;
      const link = links.get(i.productId);
      const cost = link?.lastCostUsd && D(link.lastCostUsd).gt(0) ? link.lastCostUsd : p.costAvgUsd;
      return {
        sku: p.sku,
        partNumber: p.partNumber,
        name: p.name,
        supplierCode: link?.supplierCode ?? null,
        unit: p.unit,
        stock: D(p.stock ?? 0).toFixed(3),
        quantity: D(i.quantity).toFixed(3),
        unitCostUsd: D(cost).toFixed(4),
      };
    })
    .filter((l): l is OrderLine => l !== null);

  const bytes = await buildWorkbook(supplierName, currency, lines);
  return xlsxResponse(bytes, `pedido-${slug(supplierName) || "proveedor"}-${businessDate()}.xlsx`);
}

/** GET ?supplier=<id|none> → Excel with the suggested quantities (no edits). Without `supplier`, all groups in one file. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "purchases")) return new NextResponse("No autorizado", { status: 401 });
  const wanted = req.nextUrl.searchParams.get("supplier");
  const groups = await getPurchaseSuggestions();
  const selected = wanted ? groups.filter((g) => (wanted === "none" ? g.supplierId === null : g.supplierId === wanted)) : groups;
  if (selected.length === 0) return new NextResponse("No hay sugerencias", { status: 404 });

  if (selected.length === 1) {
    const g = selected[0];
    const bytes = await buildWorkbook(
      g.supplierName,
      g.currencyCode,
      g.items.map((i) => ({ sku: i.sku, partNumber: i.partNumber, name: i.name, supplierCode: i.supplierCode, unit: i.unitSymbol, stock: i.stock, quantity: i.suggestedQty, unitCostUsd: i.unitCostUsd })),
    );
    return xlsxResponse(bytes, `pedido-${slug(g.supplierName) || "proveedor"}-${businessDate()}.xlsx`);
  }

  const wb = new ExcelJS.Workbook();
  for (const g of selected) {
    const ws = wb.addWorksheet(g.supplierName.slice(0, 28) || "Proveedor");
    const header = ws.addRow(["SKU", "Número de parte", "Producto", "Código proveedor", "Unidad", "Existencia", "Cantidad sugerida", "Costo est. USD", "Total est. USD"]);
    header.font = { bold: true };
    for (const i of g.items) {
      ws.addRow([i.sku, i.partNumber ?? "", i.name, i.supplierCode ?? "", i.unitSymbol, Number(i.stock), Number(i.suggestedQty), Number(i.unitCostUsd), D(i.suggestedQty).mul(D(i.unitCostUsd)).toNumber()]);
    }
    ws.columns = [{ width: 14 }, { width: 18 }, { width: 44 }, { width: 16 }, { width: 8 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 }];
  }
  return xlsxResponse(toBytes(await wb.xlsx.writeBuffer()), `que-comprar-${businessDate()}.xlsx`);
}
