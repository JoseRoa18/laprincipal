import "./load-env";
import { eq } from "drizzle-orm";
import { createSession } from "./lib/session";

/**
 * Smoke test for the sales package against the running dev server: logs in
 * as the seeded admin, makes sure today's rates and an open cash session
 * exist, creates a product with stock, completes a sale through the
 * application layer and opens every sales screen plus the ticket and PDF.
 *
 *   pnpm exec tsx scripts/smoke-sales.ts [baseUrl]
 */
async function main() {
  const session = await createSession({ base: process.argv[2] });
  const { db } = await import("@/db/client");
  const s = await import("@/db/schema");
  const { businessDate } = await import("@/lib/format");
  const { getRatesSnapshot, upsertRate } = await import("@/modules/currency/infrastructure/rates");
  const { applyMovement } = await import("@/modules/inventory/application/stock");
  const { getDefaultLocation } = await import("@/modules/core/application/context");
  const { getOpenCashSession } = await import("@/modules/cash/application/session");
  const { openCashSession } = await import("@/modules/cash/application/open-close");
  const { completeSale } = await import("@/modules/sales/application/complete-sale");
  const { completeSaleSchema } = await import("@/modules/sales/application/schemas");

  const email = (process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com").toLowerCase();
  const [admin] = await db.select({ id: s.users.id, role: s.users.role }).from(s.users).where(eq(s.users.email, email));
  if (!admin) throw new Error(`Admin user ${email} not found`);

  // Rates for today (the POS refuses to sell without them).
  const today = businessDate();
  const snapshot = await getRatesSnapshot(today);
  const defaults: Record<string, string> = { VES: "36.500000", COP: "4100.000000" };
  for (const code of snapshot.missing) {
    await upsertRate({ currencyCode: code, rate: defaults[code] ?? "1.000000", effectiveDate: today, userId: admin.id });
    console.log(`INFO  rate ${code} set to ${defaults[code]} for ${today}`);
  }

  // Open cash session (policy requireOpenCashSession).
  if (!(await getOpenCashSession())) {
    await openCashSession({ userId: admin.id, openings: [{ currencyCode: "USD", amount: "0" }, { currencyCode: "COP", amount: "0" }], notes: "Abierta por scripts/smoke-sales.ts" });
    console.log("INFO  cash session opened (close it from /caja when done)");
  }

  // Product with price and stock.
  const location = await getDefaultLocation();
  const [unit] = await db.select({ id: s.units.id }).from(s.units).where(eq(s.units.name, "Unidad"));
  const [tax] = await db.select({ id: s.taxes.id }).from(s.taxes).where(eq(s.taxes.isDefault, true));
  const [list] = await db.select({ id: s.priceLists.id }).from(s.priceLists).where(eq(s.priceLists.code, "PUBLIC"));
  if (!unit || !tax || !list) throw new Error("Seed data missing (units, taxes or price lists)");
  const stamp = Date.now().toString(36).toUpperCase();
  const sku = `SMK-${stamp}`;
  const [product] = await db
    .insert(s.products)
    .values({ sku, name: `Repuesto de humo ${stamp}`, partNumber: `SMOKE-${stamp}`, unitId: unit.id, taxId: tax.id, costAvgUsd: "7.0000", searchText: `repuesto de humo ${stamp.toLowerCase()} smoke-${stamp.toLowerCase()} ${sku.toLowerCase()}` })
    .returning();
  await db.insert(s.priceListItems).values({ priceListId: list.id, productId: product.id, priceUsd: "11.6000" });
  await db.transaction((tx) => applyMovement(tx, { productId: product.id, warehouseId: location.warehouseId, type: "initial", quantity: "10", unitCostUsd: "7", userId: admin.id, notes: "smoke-sales" }));

  const methods = await db.select().from(s.paymentMethods);
  const cashUsd = methods.find((m) => m.code === "CASH_USD");
  const pagoMovil = methods.find((m) => m.code === "PAGO_MOVIL");
  if (!cashUsd || !pagoMovil) throw new Error("Payment methods CASH_USD / PAGO_MOVIL missing");
  const rates = await getRatesSnapshot(today);
  const vesForTenUsd = (10 * Number(rates.rateSet.VES)).toFixed(2);

  const sale = await completeSale(
    db,
    completeSaleSchema.parse({
      lines: [{ productId: product.id, quantity: "2" }],
      payments: [
        { paymentMethodId: cashUsd.id, amount: "13.20" },
        { paymentMethodId: pagoMovil.id, amount: vesForTenUsd, reference: "SMOKE1234" },
      ],
      notes: "Venta creada por scripts/smoke-sales.ts",
    }),
    { userId: admin.id, sellerId: admin.id, role: admin.role },
  );
  console.log(`INFO  sale ${sale.number} created (${sale.saleId})`);

  await session.expectOk("/vender", "Vende");
  await session.expectOk("/ventas", sale.number);
  await session.expectOk(`/ventas/${sale.saleId}`, sale.number);
  await session.expectOk(`/ventas/${sale.saleId}?nueva=1&imprimir=0`, "registrada");
  await session.expectOk(`/ventas/${sale.saleId}/devolver`, "Devolver");
  await session.expectOk("/cotizaciones", "Cotizaciones");
  await session.expectOk("/cotizaciones/nueva", "Nueva cotización");
  await session.expectOk(`/imprimir/ticket/${sale.saleId}`, "NOTA DE ENTREGA");

  const pdf = await session.get(`/api/sales/${sale.saleId}/pdf`);
  const pdfOk = pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("application/pdf");
  if (!pdfOk) session.failures++;
  console.log(`${pdfOk ? "PASS" : "FAIL"}  ${String(pdf.status).padEnd(4)} /api/sales/${sale.saleId}/pdf (${pdf.headers.get("content-type")})`);

  const search = await session.get(`/api/sales/products?q=${encodeURIComponent(sku)}`);
  const body = search.status === 200 ? await search.text() : "";
  const searchOk = search.status === 200 && body.includes(sku);
  if (!searchOk) session.failures++;
  console.log(`${searchOk ? "PASS" : "FAIL"}  ${String(search.status).padEnd(4)} /api/sales/products?q=${sku}`);

  // Quote: detail page, PDF, hand-off to the POS, then cancel (releases the reservation).
  const { createQuote, cancelQuote } = await import("@/modules/sales/application/quotes");
  const { createQuoteSchema, createReturnSchema } = await import("@/modules/sales/application/schemas");
  const quote = await createQuote(
    db,
    createQuoteSchema.parse({ lines: [{ productId: product.id, quantity: "1" }], reserveStock: true, notes: "Cotización creada por scripts/smoke-sales.ts" }),
    { userId: admin.id, sellerId: admin.id, role: admin.role },
  );
  console.log(`INFO  quote ${quote.number} created (${quote.quoteId})`);
  await session.expectOk(`/cotizaciones/${quote.quoteId}`, quote.number);
  await session.expectOk(`/vender?cotizacion=${quote.quoteId}`, "Vende");
  const quotePdf = await session.get(`/api/sales/quotes/${quote.quoteId}/pdf`);
  const quotePdfOk = quotePdf.status === 200 && (quotePdf.headers.get("content-type") ?? "").includes("application/pdf");
  if (!quotePdfOk) session.failures++;
  console.log(`${quotePdfOk ? "PASS" : "FAIL"}  ${String(quotePdf.status).padEnd(4)} /api/sales/quotes/${quote.quoteId}/pdf`);
  await cancelQuote(db, quote.quoteId, { userId: admin.id });

  // Partial return of the sale: the detail page lists it.
  const { createReturn } = await import("@/modules/sales/application/return-sale");
  const [item] = await db.select({ id: s.saleItems.id }).from(s.saleItems).where(eq(s.saleItems.saleId, sale.saleId));
  const ret = await createReturn(
    db,
    createReturnSchema.parse({ saleId: sale.saleId, items: [{ saleItemId: item.id, quantity: "1" }], restock: true, refundMethodId: cashUsd.id, reasonText: "Prueba de humo" }),
    { userId: admin.id, role: admin.role },
  );
  console.log(`INFO  return ${ret.number} created (refund ${ret.refundAmount} ${ret.refundCurrencyCode})`);
  await session.expectOk(`/ventas/${sale.saleId}`, ret.number);
  await session.expectOk("/api/sales/held", "sales");
  await session.expectOk("/api/sales/customers?q=", "customers");

  console.log(session.failures === 0 ? "\nSales smoke test passed" : `\n${session.failures} check(s) failed`);
  process.exit(session.failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
