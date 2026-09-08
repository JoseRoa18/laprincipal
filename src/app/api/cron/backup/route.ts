import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createBackup } from "@/modules/settings/application/backups";

/** Dumping every table can take a while on a cold function. */
export const maxDuration = 60;

function bearerMatches(header: string | null, secret: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Weekly backup, called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>`.
 * Saves a JSON dump in the private `documents` bucket (see createBackup).
 */
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET no está configurado en el servidor." }, { status: 500 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false, message: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await createBackup({ kind: "scheduled", userId: null });
    return NextResponse.json({ ok: true, filePath: result.filePath, sizeBytes: result.sizeBytes });
  } catch (err) {
    console.error("[cron/backup]", err);
    return NextResponse.json({ ok: false, message: "No se pudo crear el respaldo." }, { status: 500 });
  }
}
