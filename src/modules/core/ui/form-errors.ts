import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/errors";

/**
 * Copy server-side validation messages (`error.details.fields`) onto the
 * matching react-hook-form fields so they show under the inputs.
 * Returns true when at least one field error was applied.
 */
export function applyFieldErrors<T extends FieldValues>(result: ActionResult<unknown>, setError: UseFormSetError<T>): boolean {
  if (result.ok) return false;
  const fields = result.error.details?.fields;
  if (!fields || typeof fields !== "object") return false;
  let applied = false;
  for (const [name, message] of Object.entries(fields as Record<string, string>)) {
    if (name === "_") continue;
    setError(name as Path<T>, { type: "server", message });
    applied = true;
  }
  return applied;
}
