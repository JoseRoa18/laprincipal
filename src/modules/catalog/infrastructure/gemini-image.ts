/**
 * Minimal REST client for the Gemini image model (no SDK): builds the generateContent request,
 * parses the response and turns failures into user-facing Spanish messages.
 * Pure functions are exported separately so they can be unit-tested with fixtures.
 */

export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_TIMEOUT_MS = 90_000;

export const CATALOG_PHOTO_PROMPT =
  "Professional e-commerce catalog photo of this exact spare part. Keep the part's shape, colors, text, labels, connectors and proportions exactly as in the input; do not add, remove or alter any component. Place it centered on a seamless pure white studio background with soft even lighting and a subtle contact shadow, front three-quarter product angle, sharp focus, no props, no text.";

export type GeminiErrorKind = "http" | "blocked" | "no_image" | "network" | "timeout";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: GeminiErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiGenerateRequest {
  contents: Array<{ role: "user"; parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> }>;
  generationConfig: { responseModalities: string[] };
}

export function buildImageRequest(input: { mimeType: string; base64: string; prompt?: string }): GeminiGenerateRequest {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt ?? CATALOG_PHOTO_PROMPT }, { inline_data: { mime_type: input.mimeType, data: input.base64 } }],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
}

export type ParsedImage = { ok: true; mimeType: string; base64: string; finishReason: string | null } | { ok: false; kind: "blocked" | "no_image"; message: string };

const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT", "RECITATION", "IMAGE_RECITATION", "BLOCKLIST", "SPII", "IMAGE_OTHER"]);

export const BLOCKED_MESSAGE = "La IA rechazó esta foto por sus filtros de seguridad. Prueba con otra toma del repuesto.";
export const NO_IMAGE_MESSAGE = "La IA no devolvió una imagen. Intenta de nuevo o usa otra foto.";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

/** Find the first image part in a generateContent response (accepts camelCase and snake_case). */
export function parseImageResponse(body: unknown): ParsedImage {
  if (!isObj(body)) return { ok: false, kind: "no_image", message: NO_IMAGE_MESSAGE };
  const feedback = body.promptFeedback ?? body.prompt_feedback;
  if (isObj(feedback) && (feedback.blockReason ?? feedback.block_reason)) return { ok: false, kind: "blocked", message: BLOCKED_MESSAGE };

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  let finishReason: string | null = null;
  for (const candidate of candidates) {
    if (!isObj(candidate)) continue;
    const reason = candidate.finishReason ?? candidate.finish_reason;
    if (typeof reason === "string") finishReason = reason;
    const content = candidate.content;
    const parts = isObj(content) && Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts) {
      if (!isObj(part)) continue;
      const inline = part.inlineData ?? part.inline_data;
      if (!isObj(inline)) continue;
      const data = inline.data;
      const mimeType = inline.mimeType ?? inline.mime_type;
      if (typeof data === "string" && data.length > 0) {
        return { ok: true, mimeType: typeof mimeType === "string" && mimeType ? mimeType : "image/png", base64: data, finishReason };
      }
    }
  }
  if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) return { ok: false, kind: "blocked", message: BLOCKED_MESSAGE };
  return { ok: false, kind: "no_image", message: NO_IMAGE_MESSAGE };
}

/** Spanish message for a non-2xx response. `body` may be the parsed JSON or raw text. */
export function messageForHttpError(status: number, body: unknown): string {
  let apiMessage = "";
  let apiStatus = "";
  if (isObj(body) && isObj(body.error)) {
    if (typeof body.error.message === "string") apiMessage = body.error.message;
    if (typeof body.error.status === "string") apiStatus = body.error.status;
  } else if (typeof body === "string") {
    apiMessage = body.slice(0, 200);
  }
  const lower = apiMessage.toLowerCase();
  if (status === 400 && (lower.includes("api key") || (apiStatus === "INVALID_ARGUMENT" && lower.includes("key")))) {
    return "La clave de Gemini no es válida. Revisa GEMINI_API_KEY en el servidor.";
  }
  if (status === 401 || status === 403) return "La clave de Gemini no es válida o no tiene permiso para generar imágenes.";
  if (status === 404) return "El modelo de imágenes de Gemini no está disponible para esta clave.";
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return "Se alcanzó el límite de uso de la IA (cuota). Espera un momento o revisa la facturación en Google AI Studio.";
  }
  if (status >= 500) return "El servicio de IA no está disponible en este momento. Intenta más tarde.";
  return `El servicio de IA devolvió un error (HTTP ${status})${apiMessage ? `: ${apiMessage}` : "."}`;
}

export interface GenerateImageOptions {
  apiKey: string;
  prompt?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
  finishReason: string | null;
}

/** Send one image to the Gemini image model and return the generated image bytes. */
export async function generateCatalogImage(input: { data: Buffer | Uint8Array; mimeType: string }, options: GenerateImageOptions): Promise<GeneratedImage> {
  const { apiKey, prompt, model = GEMINI_IMAGE_MODEL, baseUrl = GEMINI_API_BASE, timeoutMs = GEMINI_TIMEOUT_MS, fetchImpl = fetch } = options;
  const url = `${baseUrl}/models/${model}:generateContent`;
  const body = buildImageRequest({ mimeType: input.mimeType, base64: Buffer.from(input.data).toString("base64"), prompt });

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      // The key goes in a header (not the query string) so it never lands in logs or error messages.
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new GeminiError("La IA tardó demasiado en responder. Intenta de nuevo.", "timeout");
    throw new GeminiError("No se pudo conectar con el servicio de IA. Revisa la conexión del servidor.", "network");
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new GeminiError(messageForHttpError(res.status, json ?? text), "http", res.status);

  const parsed = parseImageResponse(json);
  if (!parsed.ok) throw new GeminiError(parsed.message, parsed.kind);
  return { data: Buffer.from(parsed.base64, "base64"), mimeType: parsed.mimeType, finishReason: parsed.finishReason };
}
