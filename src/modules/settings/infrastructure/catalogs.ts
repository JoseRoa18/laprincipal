import { asc, count, desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { adjustmentReasons, currencies, documentSeries, paymentMethods, products, taxes, units } from "@/db/schema";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  formatDocumentNumber,
  fractionToPercent,
  type AdjustmentReasonListRow,
  type DocumentSeriesListRow,
  type PaymentMethodListRow,
  type TaxListRow,
  type UnitListRow,
} from "../domain/catalog-forms";

/** Read queries for the configuration screens (taxes, units, reasons, series, payment methods). */

export type { AdjustmentReasonListRow, DocumentSeriesListRow, PaymentMethodListRow, TaxListRow, UnitListRow };

export async function listTaxes(dbx: DbOrTx = db): Promise<TaxListRow[]> {
  const rows = await dbx.select().from(taxes).orderBy(desc(taxes.isDefault), asc(taxes.name));
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    rate: t.rate,
    ratePct: fractionToPercent(t.rate),
    isDefault: t.isDefault,
    isActive: t.isActive,
  }));
}

export async function listUnits(dbx: DbOrTx = db): Promise<UnitListRow[]> {
  return dbx
    .select({
      id: units.id,
      name: units.name,
      symbol: units.symbol,
      decimals: units.decimals,
      productCount: count(products.id),
    })
    .from(units)
    .leftJoin(products, eq(products.unitId, units.id))
    .groupBy(units.id)
    .orderBy(asc(units.name));
}

export async function listAdjustmentReasons(dbx: DbOrTx = db): Promise<AdjustmentReasonListRow[]> {
  return dbx
    .select({
      id: adjustmentReasons.id,
      name: adjustmentReasons.name,
      kind: adjustmentReasons.kind,
      isActive: adjustmentReasons.isActive,
      sortOrder: adjustmentReasons.sortOrder,
    })
    .from(adjustmentReasons)
    .orderBy(asc(adjustmentReasons.sortOrder), asc(adjustmentReasons.name));
}

export async function listDocumentSeries(dbx: DbOrTx = db): Promise<DocumentSeriesListRow[]> {
  const rows = await dbx.select().from(documentSeries);
  const order = new Map(DOCUMENT_TYPES.map((t, i) => [t, i]));
  return rows
    .map((s) => ({
      id: s.id,
      documentType: s.documentType,
      label: DOCUMENT_TYPE_LABEL[s.documentType],
      prefix: s.prefix,
      nextNumber: s.nextNumber,
      padding: s.padding,
      example: formatDocumentNumber(s.prefix, s.padding, s.nextNumber),
    }))
    .sort((a, b) => (order.get(a.documentType) ?? 99) - (order.get(b.documentType) ?? 99));
}

/** Payment methods joined with their currency (symbol and name) for the settings screen. */
export async function listPaymentMethodsForSettings(dbx: DbOrTx = db): Promise<PaymentMethodListRow[]> {
  const rows = await dbx
    .select({
      id: paymentMethods.id,
      code: paymentMethods.code,
      name: paymentMethods.name,
      kind: paymentMethods.kind,
      currencyCode: paymentMethods.currencyCode,
      currencyName: currencies.name,
      currencySymbol: currencies.symbol,
      requiresReference: paymentMethods.requiresReference,
      countsInDrawer: paymentMethods.countsInDrawer,
      allowsChange: paymentMethods.allowsChange,
      surchargePct: paymentMethods.surchargePct,
      isActive: paymentMethods.isActive,
      sortOrder: paymentMethods.sortOrder,
    })
    .from(paymentMethods)
    .innerJoin(currencies, eq(currencies.code, paymentMethods.currencyCode))
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
  return rows.map((m) => ({ ...m, surchargePctDisplay: fractionToPercent(m.surchargePct) }));
}
