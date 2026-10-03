/**
 * A blind count hides the expected quantities (and therefore the differences)
 * while it is being counted. Someone ends the counting phase explicitly
 * ("Terminar y ver diferencias"); applied and cancelled counts show everything.
 */
export function hidesExpected(count: { status: string; blind: boolean; revealedAt: Date | null }): boolean {
  return count.status === "open" && count.blind && count.revealedAt === null;
}
