import { unstable_isUnrecognizedActionError } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "./errors";

export const NETWORK_MESSAGE = "No hay conexión con el servidor. Revisa el internet y vuelve a intentar.";
export const OUTDATED_MESSAGE = "La app se actualizó mientras tenías esta página abierta. Recarga la página para seguir.";

/** The request never got an answer: no connection, or it dropped halfway. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch|network|Failed to fetch|Load failed/i.test(err.message));
}

/**
 * Calls a server action and turns what makes it throw on the client (no
 * connection, a new deployment that no longer knows the action, an error page
 * from the host) into a failed ActionResult, so the screen can always say what
 * happened instead of staying as if nothing was pressed.
 */
export async function callAction<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (err) {
    if (unstable_isUnrecognizedActionError(err)) return { ok: false, error: { code: "OUTDATED", message: OUTDATED_MESSAGE } };
    if (isNetworkError(err)) return { ok: false, error: { code: "NETWORK", message: NETWORK_MESSAGE } };
    console.error(err);
    return { ok: false, error: { code: "INTERNAL", message: "El servidor no respondió. Intenta de nuevo en un momento." } };
  }
}

/** Same as callAction, retrying while the connection fails (only for idempotent actions). */
export async function callActionWithRetry<T>(run: () => Promise<ActionResult<T>>, retries = 2): Promise<ActionResult<T>> {
  for (let attempt = 0; ; attempt++) {
    const res = await callAction(run);
    if (res.ok || res.error.code !== "NETWORK" || attempt >= retries) return res;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
}

/** Error toast for a failed action; when the app was updated it offers to reload. */
export function toastActionError(error: { code: string; message: string }, prefix?: string) {
  const text = prefix ? `${prefix}: ${error.message}` : error.message;
  if (error.code === "OUTDATED") {
    toast.error(text, { duration: Infinity, action: { label: "Recargar", onClick: () => window.location.reload() } });
  } else {
    toast.error(text);
  }
}
