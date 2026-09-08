import type { z } from "zod";
import { AppError, toActionError, type ActionResult } from "./errors";

/**
 * Run a server action body and convert any failure into an ActionResult.
 * Never call redirect() inside `fn`; return data and navigate on the client.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

/** Validate input with Zod and throw a user-facing AppError with field details. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] ?? "Datos inválidos.";
  throw new AppError("VALIDATION", first, { fields });
}

/** Read a FormData into a plain object (repeated keys become arrays). */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key in out) {
      const existing = out[key];
      out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
