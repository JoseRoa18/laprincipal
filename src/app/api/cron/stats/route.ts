import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { recomputeProductStats } from "@/modules/reporting/application/product-stats";

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
 * Daily statistics job (Vercel Cron, 07:00 UTC = 03:00 Caracas).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; without a configured
 * secret the route only answers in development.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const summary = await recomputeProductStats();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/stats]", err);
    return NextResponse.json({ ok: false, error: "No se pudieron calcular las estadísticas" }, { status: 500 });
  }
}
