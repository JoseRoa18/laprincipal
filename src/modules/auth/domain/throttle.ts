/**
 * Failed-attempt policy: after `maxFailures` failures the key is locked, and
 * each consecutive lock lasts four times longer (15 min, 1 h, 4 h, 16 h)
 * up to `maxLockMinutes`. A success clears the counter.
 */
export interface ThrottlePolicy {
  maxFailures: number;
  baseLockMinutes: number;
  maxLockMinutes: number;
}

const DAY = 24 * 60;

/** Per e-mail: the person typing a wrong password. */
export const LOGIN_EMAIL_POLICY: ThrottlePolicy = { maxFailures: 5, baseLockMinutes: 15, maxLockMinutes: DAY };
/** Per IP: someone trying many e-mails from one place. */
export const LOGIN_IP_POLICY: ThrottlePolicy = { maxFailures: 30, baseLockMinutes: 15, maxLockMinutes: DAY };
/** Per signed-in user typing PINs (discount authorization, seller switch). */
export const PIN_REQUESTER_POLICY: ThrottlePolicy = { maxFailures: 5, baseLockMinutes: 15, maxLockMinutes: DAY };
/** Per PIN owner, so several accounts cannot share the guessing. */
export const PIN_TARGET_POLICY: ThrottlePolicy = { maxFailures: 10, baseLockMinutes: 15, maxLockMinutes: DAY };

export function lockMinutes(policy: ThrottlePolicy, previousLocks: number): number {
  return Math.min(policy.baseLockMinutes * 4 ** Math.max(0, previousLocks), policy.maxLockMinutes);
}

/** "Demasiados intentos. Intenta de nuevo en 15 min." */
export function lockMessage(until: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  const wait = minutes > 90 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`;
  return `Demasiados intentos fallidos. Intenta de nuevo en ${wait}.`;
}

/** PINs anyone would try first: one repeated digit or a straight run (1234, 4321, 123456). */
export function isTrivialPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}
