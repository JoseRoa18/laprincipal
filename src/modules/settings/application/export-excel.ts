import { desc, eq, inArray, isNull, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, type Db } from "@/db/client";
import {
  brands,
  categories,
  customers,
  paymentMethods,
  priceListItems,
  priceLists,
  products,
  salePayments,
  sales,
  stockLevels,
  taxes,
  units,
  users,
} from "@/db/schema";
import { businessDate, formatDateTime, formatMoney } from "@/lib/format";
import { CUSTOMER_TYPE_LABEL, formatDoc } from "@/modules/customers/domain/schema";

export const EXPORT_TYPES = ["products", "customers", "sales"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isExportType(value: unknown): value is ExportType {
  return typeof value === "string" && (EXPORT_TYPES as readonly string[]).includes(value);
}

type SaleStatus = (typeof sales.$inferSelect)["status"];

const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  held: "En espera",
  completed: "Completada",
  voided: "Anulada",
  refunded: "Devuelta",
  partially_refunded: "Devolución parcial",
};

interface Column {
  header: string;
  key: string;
  width?: number;
  /** Excel number format for numeric columns. */
  numFmt?: string;
}

const MONEY = "#,##0.00";
const QTY = "#,##0.###";
const RATE = "#,##0.000000";

/** Drizzle numerics are strings; Excel wants numbers. */
function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const yesNo = (value: boolean) => (value ? "Sí" : "No");

async function toBuffer(sheetName: string, columns: Column[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "La Principal 2050";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  ws.getRow(1).font = { bold: true };
  for (const c of columns) {
    if (c.numFmt) ws.getColumn(c.key).numFmt = c.numFmt;
  }
  for (const row of rows) ws.addRow(row);
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function productRows(dbx: Db) {
  const [items, prices, stock] = await Promise.all([
    dbx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        partNumber: products.partNumber,
        category: categories.name,
        brand: brands.name,
        unit: units.name,
        tax: taxes.name,
        costAvgUsd: products.costAvgUsd,
        locationCode: products.locationCode,
        isActive: products.isActive,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .leftJoin(taxes, eq(products.taxId, taxes.id))
      .where(isNull(products.deletedAt))
      .orderBy(products.name),
    dbx
      .select({ productId: priceListItems.productId, code: priceLists.code, priceUsd: priceListItems.priceUsd })
      .from(priceListItems)
      .innerJoin(priceLists, eq(priceListItems.priceListId, priceLists.id))
      .where(inArray(priceLists.code, ["PUBLIC", "TECH"])),
    dbx
      .select({ productId: stockLevels.productId, quantity: sql<string>`sum(${stockLevels.quantity})` })
      .from(stockLevels)
      .groupBy(stockLevels.productId),
  ]);

  const priceBy = new Map<string, string>();
  for (const p of prices) priceBy.set(`${p.code}:${p.productId}`, p.priceUsd);
  const stockBy = new Map(stock.map((s) => [s.productId, s.quantity]));

  return items.map((p) => ({
    sku: p.sku,
    name: p.name,
    partNumber: p.partNumber,
    category: p.category,
    brand: p.brand,
    unit: p.unit,
    tax: p.tax,
    costAvgUsd: num(p.costAvgUsd),
    publicPriceUsd: num(priceBy.get(`PUBLIC:${p.id}`)),
    techPriceUsd: num(priceBy.get(`TECH:${p.id}`)),
    stock: num(stockBy.get(p.id)) ?? 0,
    locationCode: p.locationCode,
    isActive: yesNo(p.isActive),
  }));
}

const PRODUCT_COLUMNS: Column[] = [
  { header: "SKU", key: "sku", width: 14 },
  { header: "Nombre", key: "name", width: 40 },
  { header: "Número de parte", key: "partNumber", width: 20 },
  { header: "Categoría", key: "category", width: 22 },
  { header: "Marca", key: "brand", width: 16 },
  { header: "Unidad", key: "unit", width: 12 },
  { header: "Impuesto", key: "tax", width: 14 },
  { header: "Costo promedio USD", key: "costAvgUsd", width: 18, numFmt: MONEY },
  { header: "Precio Público USD", key: "publicPriceUsd", width: 18, numFmt: MONEY },
  { header: "Precio Técnico USD", key: "techPriceUsd", width: 18, numFmt: MONEY },
  { header: "Stock", key: "stock", width: 10, numFmt: QTY },
  { header: "Ubicación", key: "locationCode", width: 14 },
  { header: "Activo", key: "isActive", width: 8 },
];

async function customerRows(dbx: Db) {
  const rows = await dbx
    .select({
      name: customers.name,
      customerType: customers.customerType,
      docType: customers.docType,
      docNumber: customers.docNumber,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      priceList: priceLists.name,
      isActive: customers.isActive,
      notes: customers.notes,
    })
    .from(customers)
    .leftJoin(priceLists, eq(customers.priceListId, priceLists.id))
    .where(isNull(customers.deletedAt))
    .orderBy(customers.name);

  return rows.map((c) => ({
    name: c.name,
    customerType: CUSTOMER_TYPE_LABEL[c.customerType],
    document: formatDoc(c.docType, c.docNumber) || null,
    phone: c.phone,
    email: c.email,
    address: c.address,
    priceList: c.priceList,
    isActive: yesNo(c.isActive),
    notes: c.notes,
  }));
}

const CUSTOMER_COLUMNS: Column[] = [
  { header: "Nombre", key: "name", width: 34 },
  { header: "Tipo", key: "customerType", width: 12 },
  { header: "Documento", key: "document", width: 16 },
  { header: "Teléfono", key: "phone", width: 16 },
  { header: "Correo", key: "email", width: 28 },
  { header: "Dirección", key: "address", width: 40 },
  { header: "Lista de precios", key: "priceList", width: 16 },
  { header: "Activo", key: "isActive", width: 8 },
  { header: "Notas", key: "notes", width: 40 },
];

async function saleRows(dbx: Db) {
  const [rows, payments] = await Promise.all([
    dbx
      .select({
        id: sales.id,
        number: sales.number,
        saleDate: sales.saleDate,
        status: sales.status,
        customer: customers.name,
        seller: users.name,
        subtotalUsd: sales.subtotalUsd,
        discountUsd: sales.discountUsd,
        taxUsd: sales.taxUsd,
        totalUsd: sales.totalUsd,
        rateVes: sales.rateVes,
        rateCop: sales.rateCop,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .innerJoin(users, eq(sales.sellerId, users.id))
      .orderBy(desc(sales.saleDate)),
    dbx
      .select({
        saleId: salePayments.saleId,
        method: paymentMethods.name,
        currencyCode: salePayments.currencyCode,
        amount: salePayments.amount,
      })
      .from(salePayments)
      .innerJoin(paymentMethods, eq(salePayments.paymentMethodId, paymentMethods.id))
      .orderBy(salePayments.createdAt),
  ]);

  const paymentsBy = new Map<string, string[]>();
  for (const p of payments) {
    const list = paymentsBy.get(p.saleId) ?? [];
    list.push(`${p.method} ${formatMoney(p.amount, p.currencyCode, { symbol: p.currencyCode })}`);
    paymentsBy.set(p.saleId, list);
  }

  return rows.map((s) => ({
    number: s.number,
    saleDate: formatDateTime(s.saleDate),
    status: SALE_STATUS_LABEL[s.status],
    customer: s.customer,
    seller: s.seller,
    subtotalUsd: num(s.subtotalUsd),
    discountUsd: num(s.discountUsd),
    taxUsd: num(s.taxUsd),
    totalUsd: num(s.totalUsd),
    rateVes: num(s.rateVes),
    rateCop: num(s.rateCop),
    payments: paymentsBy.get(s.id)?.join(", ") ?? null,
  }));
}

const SALE_COLUMNS: Column[] = [
  { header: "Número", key: "number", width: 14 },
  { header: "Fecha", key: "saleDate", width: 18 },
  { header: "Estado", key: "status", width: 16 },
  { header: "Cliente", key: "customer", width: 30 },
  { header: "Vendedor", key: "seller", width: 22 },
  { header: "Subtotal USD", key: "subtotalUsd", width: 14, numFmt: MONEY },
  { header: "Descuento USD", key: "discountUsd", width: 14, numFmt: MONEY },
  { header: "IVA USD", key: "taxUsd", width: 12, numFmt: MONEY },
  { header: "Total USD", key: "totalUsd", width: 14, numFmt: MONEY },
  { header: "Tasa Bs", key: "rateVes", width: 14, numFmt: RATE },
  { header: "Tasa COP", key: "rateCop", width: 14, numFmt: RATE },
  { header: "Métodos de pago", key: "payments", width: 48 },
];

const SHEETS: Record<ExportType, { sheet: string; file: string; columns: Column[]; rows: (dbx: Db) => Promise<Record<string, unknown>[]> }> = {
  products: { sheet: "Productos", file: "productos", columns: PRODUCT_COLUMNS, rows: productRows },
  customers: { sheet: "Clientes", file: "clientes", columns: CUSTOMER_COLUMNS, rows: customerRows },
  sales: { sheet: "Ventas", file: "ventas", columns: SALE_COLUMNS, rows: saleRows },
};

/** Full export of products, customers or sales as an .xlsx file. */
export async function buildExcel(type: ExportType, dbx: Db = db): Promise<{ buffer: Buffer; filename: string }> {
  const spec = SHEETS[type];
  const rows = await spec.rows(dbx);
  const buffer = await toBuffer(spec.sheet, spec.columns, rows);
  return { buffer, filename: `${spec.file}-${businessDate()}.xlsx` };
}
