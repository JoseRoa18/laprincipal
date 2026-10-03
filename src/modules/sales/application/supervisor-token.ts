import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const TTL_MS = 5 * 60_000;

function secret(): string {
  return env.PIN_COOKIE_SECRET ?? env.AUTH_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface SupervisorApproval {
  adminId: string;
  /** Signed-in user who asked for it; nobody else can use it. */
  requesterId: string;
  /** Highest discount % approved; a bigger discount needs a new PIN. */
  maxPct: string;
}

/**
 * Short-lived proof that an administrator approved, with a PIN, a discount of
 * up to `maxPct` for `requesterId`. Format: `<adminId>:<requesterId>:<maxPct>:<expMs>:<hmac>`.
 * Verified again when the sale completes.
 */
export function issueSupervisorToken(approval: SupervisorApproval, ttlMs = TTL_MS): { token: string; expiresAt: number } {
  const exp = Date.now() + ttlMs;
  const payload = `${approval.adminId}:${approval.requesterId}:${approval.maxPct}:${exp}`;
  return { token: `${payload}:${sign(payload)}`, expiresAt: exp };
}

/** The approval when the token is valid and not expired, else null. */
export function verifySupervisorToken(token: string | null | undefined): SupervisorApproval | null {
  if (!token) return null;
  const parts = token.split(":");
  if (parts.length !== 5) return null;
  const [adminId, requesterId, maxPct, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!adminId || !requesterId || !/^\d+(\.\d+)?$/.test(maxPct) || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = Buffer.from(sign(`${adminId}:${requesterId}:${maxPct}:${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { adminId, requesterId, maxPct };
}
