import { and, desc, eq, lte } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { currencies, exchangeRates } from "@/db/schema";
import { businessDate } from "@/lib/format";
import type { CurrencyInfo, RateSet } from "../domain/conversion";

export interface CurrentRate {
  currencyCode: string;
  rate: string;
  effectiveDate: string;
  source: "manual" | "bcv_api";
}

export interface RatesSnapshot {
  /** yyyy-MM-dd in the business timezone. */
  today: string;
  currencies: CurrencyInfo[];
  /** Latest rate per non-base currency (may be from a previous day). */
  rates: CurrentRate[];
  rateSet: RateSet;
  /** Non-base active currencies with no rate at all. */
  missing: string[];
  /** Currencies whose latest rate is older than today. */
  stale: string[];
}

export async function listCurrencies(dbx: DbOrTx = db): Promise<CurrencyInfo[]> {
  const rows = await dbx.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(currencies.sortOrder);
  return rows.map((c) => ({
    code: c.code,
    symbol: c.symbol,
    decimals: c.decimals,
    cashRounding: c.cashRounding,
    isBase: c.isBase,
  }));
}

/** Latest effective rate on or before `date` for every non-base currency. */
export async function getRatesSnapshot(date = businessDate(), dbx: DbOrTx = db): Promise<RatesSnapshot> {
  const list = await listCurrencies(dbx);
  const rates: CurrentRate[] = [];
  const rateSet: RateSet = { USD: "1" };
  const missing: string[] = [];
  const stale: string[] = [];

  for (const c of list) {
    if (c.isBase) continue;
    const [row] = await dbx
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.currencyCode, c.code), lte(exchangeRates.effectiveDate, date)))
      .orderBy(desc(exchangeRates.effectiveDate))
      .limit(1);
    if (!row) {
      missing.push(c.code);
      continue;
    }
    rates.push({ currencyCode: c.code, rate: row.rate, effectiveDate: row.effectiveDate, source: row.source });
    rateSet[c.code] = row.rate;
    if (row.effectiveDate < date) stale.push(c.code);
  }

  return { today: date, currencies: list, rates, rateSet, missing, stale };
}

export async function upsertRate(
  input: { currencyCode: string; rate: string; effectiveDate: string; source?: "manual" | "bcv_api"; userId: string },
  dbx: DbOrTx = db,
) {
  const [row] = await dbx
    .insert(exchangeRates)
    .values({
      currencyCode: input.currencyCode,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
      source: input.source ?? "manual",
      createdBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [exchangeRates.currencyCode, exchangeRates.effectiveDate],
      set: { rate: input.rate, source: input.source ?? "manual", createdBy: input.userId, createdAt: new Date() },
    })
    .returning();
  return row;
}

export async function listRateHistory(currencyCode: string, limit = 60, dbx: DbOrTx = db) {
  return dbx
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.currencyCode, currencyCode))
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(limit);
}
