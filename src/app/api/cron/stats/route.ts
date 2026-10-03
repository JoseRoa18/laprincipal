import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
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
 * Daily job (Vercel Cron, 07:00 UTC = 03:00 Caracas): expires overdue quotes,
 * releasing their stock reservations, then recomputes the product statistics.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; without a configured
 * secret the route only answers in development.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const expiredQuotes = await expireOverdueQuotes(db);
    const summary = await recomputeProductStats();
    return NextResponse.json({ ok: true, expiredQuotes, ...summary });
  } catch (err) {
    console.error("[cron/stats]", err);
    return NextResponse.json({ ok: false, error: "No se pudieron calcular las estadísticas" }, { status: 500 });
  }
}
