import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const TTL_MS = 10 * 60_000;

function secret(): string {
  return env.PIN_COOKIE_SECRET ?? env.AUTH_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/**
 * Short-lived proof that an administrator authorized a discount with a PIN.
 * Format: `<adminId>:<expMs>:<hmac>`. Verified again when the sale completes.
 */
export function issueSupervisorToken(adminId: string, ttlMs = TTL_MS): { token: string; expiresAt: number } {
  const exp = Date.now() + ttlMs;
  const payload = `${adminId}:${exp}`;
  return { token: `${payload}:${sign(payload)}`, expiresAt: exp };
}

/** Returns the admin id when the token is valid and not expired, else null. */
export function verifySupervisorToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(":");
  if (parts.length !== 3) return null;
  const [adminId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!adminId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = Buffer.from(sign(`${adminId}:${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return adminId;
}
