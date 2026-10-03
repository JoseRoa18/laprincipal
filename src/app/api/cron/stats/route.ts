import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { syncBcvRate } from "@/modules/currency/application/bcv-sync";
import { recomputeProductStats } from "@/modules/reporting/application/product-stats";
import { expireOverdueQuotes } from "@/modules/sales/application/quotes";

/** Vercel functions default to 10 s; the recompute may take longer with a big catalog. */
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return env.NODE_ENV === "development";
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Daily job (Vercel Cron, 07:00 UTC = 03:00 Caracas): saves the BCV rate for
 * Bs, expires overdue quotes (releasing their stock reservations) and
 * recomputes the product statistics. A BCV failure does not stop the rest;
 * the pages retry it in the background during the day.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; without a configured
 * secret the route only answers in development.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const bcv = await syncBcvRate().then(
    (r) => ({ ok: true as const, ...r }),
    (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }),
  );
  if (!bcv.ok) console.error("[cron/stats] BCV:", bcv.error);
  try {
    const expiredQuotes = await expireOverdueQuotes(db);
    const summary = await recomputeProductStats();
    return NextResponse.json({ ok: true, bcv, expiredQuotes, ...summary });
  } catch (err) {
    console.error("[cron/stats]", err);
    return NextResponse.json({ ok: false, error: "No se pudieron calcular las estadísticas" }, { status: 500 });
  }
}
