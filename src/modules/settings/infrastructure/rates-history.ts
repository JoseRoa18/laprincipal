import { desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { exchangeRates, users } from "@/db/schema";

export interface RateHistoryRow {
  id: string;
  currencyCode: string;
  rate: string;
  effectiveDate: string;
  source: "manual" | "bcv_api";
  createdAt: Date;
  createdByName: string | null;
}

/** Rate history of one currency with the name of who loaded it. */
export async function listRateHistoryWithUsers(currencyCode: string, limit = 60, dbx: DbOrTx = db): Promise<RateHistoryRow[]> {
  return dbx
    .select({
      id: exchangeRates.id,
      currencyCode: exchangeRates.currencyCode,
      rate: exchangeRates.rate,
      effectiveDate: exchangeRates.effectiveDate,
      source: exchangeRates.source,
      createdAt: exchangeRates.createdAt,
      createdByName: users.name,
    })
    .from(exchangeRates)
    .leftJoin(users, eq(users.id, exchangeRates.createdBy))
    .where(eq(exchangeRates.currencyCode, currencyCode))
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(limit);
}
