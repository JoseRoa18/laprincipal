export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "CASH_SESSION_REQUIRED"
  | "RATES_REQUIRED"
  | "INVALID_STATE"
  | "INTERNAL";

/**
 * Error with a stable code and a user-facing message in Spanish.
 * Server actions catch it and return { ok: false, error } to the UI.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "El registro") => new AppError("NOT_FOUND", `${what} no existe.`);
export const forbidden = () => new AppError("FORBIDDEN", "No tienes permiso para esta acción.");
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: Record<string, unknown> } };

export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof AppError) {
    return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
  }
  console.error(err);
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Ocurrió un error inesperado. Intenta de nuevo." },
  };
}
