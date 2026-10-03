import { and, desc, eq, lt } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { currencies, exchangeRates } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { businessDate } from "@/lib/format";
import { D, toRateDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getSetting, saveSetting } from "@/modules/settings/infrastructure/settings";
import { BCV_CURRENCY, isPlausibleRateChange } from "../domain/bcv";
import { fetchBcvRates, type FetchedBcvRate } from "../infrastructure/bcv-client";
import { upsertRate } from "../infrastructure/rates";

export interface SavedBcvRate {
  rate: string;
  /** yyyy-MM-dd: the day it applies from. */
  valueDate: string;
  source: FetchedBcvRate["source"];
  /** false when that rate was already saved. */
  changed: boolean;
}

export interface BcvSyncResult {
  /** Oldest value date first. */
  rates: SavedBcvRate[];
  changed: boolean;
}

/** Background refreshes wait this long after any attempt, successful or not. */
const RETRY_AFTER_MS = 30 * 60_000;

async function saveOne(tx: Tx, fetched: FetchedBcvRate, userId: string | null): Promise<SavedBcvRate> {
  const rate = toRateDb(fetched.rate);
  const [existing] = await tx
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currencyCode, BCV_CURRENCY), eq(exchangeRates.effectiveDate, fetched.valueDate)))
    .limit(1);
  if (existing && existing.source === "bcv_api" && D(existing.rate).eq(rate)) {
    return { rate: existing.rate, valueDate: fetched.valueDate, source: fetched.source, changed: false };
  }

  const [previous] = await tx
    .select({ rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currencyCode, BCV_CURRENCY), lt(exchangeRates.effectiveDate, fetched.valueDate)))
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(1);
  if (!isPlausibleRateChange(previous?.rate ?? null, rate)) {
    throw new AppError(
      "VALIDATION",
      `La tasa leída del BCV (${rate}) es muy distinta de la anterior (${previous!.rate}). No se guardó; revisa bcv.org.ve y cárgala a mano si es correcta.`,
    );
  }

  const row = await upsertRate({ currencyCode: BCV_CURRENCY, rate, effectiveDate: fetched.valueDate, source: "bcv_api", userId }, tx);
  await writeAudit(tx, {
    userId,
    action: "rate.bcv",
    entityType: "exchange_rate",
    entityId: row.id,
    before: existing ? { currencyCode: BCV_CURRENCY, effectiveDate: fetched.valueDate, rate: existing.rate, source: existing.source } : null,
    after: { currencyCode: BCV_CURRENCY, effectiveDate: fetched.valueDate, rate: row.rate, source: fetched.source },
  });
  return { rate: row.rate, valueDate: fetched.valueDate, source: fetched.source, changed: true };
}

/**
 * Query the BCV and save the Bs rate under its "Fecha Valor" (plus the rate in
 * force today when the published one starts on a later day). A rate typed by
 * hand for the same day is replaced: the BCV is the source for Bs. Every
 * attempt is recorded in the `bcvSync` setting; changes go to the audit log.
 */
export async function syncBcvRate(
  opts: { userId?: string | null; fetcher?: (today: string) => Promise<FetchedBcvRate[]>; dbx?: Db; today?: string } = {},
): Promise<BcvSyncResult> {
  const dbx = opts.dbx ?? db;
  const userId = opts.userId ?? null;
  const today = opts.today ?? businessDate();
  const status = await getSetting("bcvSync", dbx);
  const attemptAt = new Date().toISOString();

  let fetched: FetchedBcvRate[];
  try {
    fetched = await (opts.fetcher ?? fetchBcvRates)(today);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSetting("bcvSync", { ...status, lastAttemptAt: attemptAt, lastError: message }, userId, dbx);
    throw new AppError("INTERNAL", `No se pudo consultar la tasa del BCV (${message}). Se sigue usando la última tasa guardada.`);
  }

  try {
    const rates = await dbx.transaction(async (tx) => {
      const [currency] = await tx.select().from(currencies).where(eq(currencies.code, BCV_CURRENCY)).limit(1);
      if (!currency || !currency.isActive) throw new AppError("VALIDATION", "La moneda Bs no está activa.");
      const saved: SavedBcvRate[] = [];
      for (const rate of [...fetched].sort((a, b) => a.valueDate.localeCompare(b.valueDate))) saved.push(await saveOne(tx, rate, userId));
      return saved;
    });
    const lastSource = fetched.find((r) => r.source === "bcv")?.source ?? fetched[0].source;
    await saveSetting("bcvSync", { lastAttemptAt: attemptAt, lastSuccessAt: attemptAt, lastError: null, lastSource }, userId, dbx);
    return { rates, changed: rates.some((r) => r.changed) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSetting("bcvSync", { ...status, lastAttemptAt: attemptAt, lastError: message }, userId, dbx);
    throw err;
  }
}

/**
 * Refresh run in the background when a page notices the Bs rate is behind
 * (the 3:00 a. m. job failed or has not run). At most one attempt every 30
 * minutes; never throws.
 */
export async function refreshBcvRateIfDue(dbx: Db = db): Promise<void> {
  try {
    const status = await getSetting("bcvSync", dbx);
    if (status.lastAttemptAt && Date.now() - Date.parse(status.lastAttemptAt) < RETRY_AFTER_MS) return;
    // Claim the slot first so concurrent page loads do not all query the BCV.
    await saveSetting("bcvSync", { ...status, lastAttemptAt: new Date().toISOString() }, null, dbx);
    await syncBcvRate({ dbx });
  } catch (err) {
    console.warn("[bcv] background refresh failed:", err instanceof Error ? err.message : err);
  }
}
