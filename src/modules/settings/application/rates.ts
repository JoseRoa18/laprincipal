import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db, type Db } from "@/db/client";
import { exchangeRates } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { businessDate, parseLocalizedNumber } from "@/lib/format";
import { toRateDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { listCurrencies, upsertRate } from "@/modules/currency/infrastructure/rates";
import type { setRatesSchema } from "../domain/forms";

export { setRatesSchema, type SetRatesInput } from "../domain/forms";

/** Save today's (or a given day's) rates for the non-base currencies, with audit. */
export async function setRates(input: z.output<typeof setRatesSchema>, userId: string, dbx: Db = db) {
  if (input.effectiveDate > businessDate()) throw new AppError("VALIDATION", "La fecha no puede ser futura.", { fields: { effectiveDate: "Fecha futura" } });
  const currencies = await listCurrencies(dbx);
  return dbx.transaction(async (tx) => {
    const saved: Array<{ currencyCode: string; rate: string; previous: string | null }> = [];
    for (const [code, raw] of Object.entries(input.rates)) {
      if (raw.trim() === "") continue;
      const currency = currencies.find((c) => c.code === code && !c.isBase);
      if (!currency) throw new AppError("VALIDATION", `La moneda ${code} no existe o es la moneda base.`);
      const rate = toRateDb(parseLocalizedNumber(raw) ?? 0);
      const [previous] = await tx
        .select({ rate: exchangeRates.rate })
        .from(exchangeRates)
        .where(and(eq(exchangeRates.currencyCode, code), eq(exchangeRates.effectiveDate, input.effectiveDate)))
        .limit(1);
      const row = await upsertRate({ currencyCode: code, rate, effectiveDate: input.effectiveDate, source: "manual", userId }, tx);
      await writeAudit(tx, {
        userId,
        action: "rate.set",
        entityType: "exchange_rate",
        entityId: row.id,
        before: previous ? { currencyCode: code, effectiveDate: input.effectiveDate, rate: previous.rate } : null,
        after: { currencyCode: code, effectiveDate: input.effectiveDate, rate: row.rate },
      });
      saved.push({ currencyCode: code, rate: row.rate, previous: previous?.rate ?? null });
    }
    return saved;
  });
}
