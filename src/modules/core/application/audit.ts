import { headers } from "next/headers";
import type { DbOrTx } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface AuditEntry {
  userId?: string | null;
  /** e.g. "product.update", "sale.void", "rate.set" */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Best-effort request metadata; safe to call outside a request (returns nulls). */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function writeAudit(dbx: DbOrTx, entry: AuditEntry): Promise<void> {
  const meta = await requestMeta();
  await dbx.insert(auditLogs).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
