import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/gemini-image-response.json";
import {
  BLOCKED_MESSAGE,
  buildImageRequest,
  CATALOG_PHOTO_PROMPT,
  GEMINI_IMAGE_MODEL,
  GeminiError,
  generateCatalogImage,
  messageForHttpError,
  NO_IMAGE_MESSAGE,
  parseImageResponse,
} from "./gemini-image";

describe("buildImageRequest", () => {
  it("sends the prompt, the inline image and asks for an image back", () => {
    const req = buildImageRequest({ mimeType: "image/jpeg", base64: "AAAA" });
    expect(req.generationConfig).toEqual({ responseModalities: ["IMAGE"] });
    expect(req.contents).toHaveLength(1);
    expect(req.contents[0].role).toBe("user");
    expect(req.contents[0].parts[0]).toEqual({ text: CATALOG_PHOTO_PROMPT });
    expect(req.contents[0].parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "AAAA" } });
    expect(CATALOG_PHOTO_PROMPT).toContain("pure white");
  });
});

describe("parseImageResponse", () => {
  it("extracts the first inline image from the fixture", () => {
    const parsed = parseImageResponse(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.base64.startsWith("iVBORw0KGgo")).toBe(true);
    expect(parsed.finishReason).toBe("STOP");
    expect(Buffer.from(parsed.base64, "base64").subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("accepts snake_case keys", () => {
    const parsed = parseImageResponse({ candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/webp", data: "QUJD" } }] } }] });
    expect(parsed).toMatchObject({ ok: true, mimeType: "image/webp", base64: "QUJD" });
  });

  it("reports safety blocks from promptFeedback or finishReason", () => {
    expect(parseImageResponse({ promptFeedback: { blockReason: "SAFETY" } })).toEqual({ ok: false, kind: "blocked", message: BLOCKED_MESSAGE });
    expect(parseImageResponse({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [{ text: "no" }] } }] })).toEqual({ ok: false, kind: "blocked", message: BLOCKED_MESSAGE });
  });

  it("reports a text-only or empty response as no image", () => {
    expect(parseImageResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Sorry" }] } }] })).toEqual({ ok: false, kind: "no_image", message: NO_IMAGE_MESSAGE });
    expect(parseImageResponse(null)).toEqual({ ok: false, kind: "no_image", message: NO_IMAGE_MESSAGE });
    expect(parseImageResponse({ candidates: [] })).toEqual({ ok: false, kind: "no_image", message: NO_IMAGE_MESSAGE });
  });
});

describe("messageForHttpError", () => {
  it("maps the common failures to Spanish messages", () => {
    expect(messageForHttpError(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } })).toContain("clave de Gemini no es válida");
    expect(messageForHttpError(403, { error: { message: "PERMISSION_DENIED" } })).toContain("no tiene permiso");
    expect(messageForHttpError(404, {})).toContain("modelo");
    expect(messageForHttpError(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })).toContain("cuota");
    expect(messageForHttpError(503, "Service Unavailable")).toContain("no está disponible");
    expect(messageForHttpError(418, { error: { message: "teapot" } })).toBe("El servicio de IA devolvió un error (HTTP 418): teapot");
  });
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(url), init ?? {}))) as typeof fetch;
}

describe("generateCatalogImage", () => {
  const image = { data: Buffer.from([1, 2, 3]), mimeType: "image/jpeg" };

  it("posts the request with the key in a header and returns the decoded image", async () => {
    let seenUrl = "";
    let seenInit: RequestInit = {};
    const fetchImpl = fakeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
    });
    const out = await generateCatalogImage(image, { apiKey: "secret-key", fetchImpl });
    expect(seenUrl).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`);
    expect(seenUrl).not.toContain("secret-key");
    expect((seenInit.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(String(seenInit.body)) as ReturnType<typeof buildImageRequest>;
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from([1, 2, 3]).toString("base64") } });
    expect(out.mimeType).toBe("image/png");
    expect(out.data.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(out.finishReason).toBe("STOP");
  });

  it("turns HTTP errors into GeminiError with a Spanish message", async () => {
    const fetchImpl = fakeFetch(() => new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota" } }), { status: 429 }));
    const err = await generateCatalogImage(image, { apiKey: "k", fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).kind).toBe("http");
    expect((err as GeminiError).status).toBe(429);
    expect((err as GeminiError).message).toContain("cuota");
  });

  it("turns a blocked response into a GeminiError of kind blocked", async () => {
    const fetchImpl = fakeFetch(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }));
    const err = await generateCatalogImage(image, { apiKey: "k", fetchImpl }).catch((e: unknown) => e);
    expect((err as GeminiError).kind).toBe("blocked");
    expect((err as GeminiError).message).toBe(BLOCKED_MESSAGE);
  });

  it("reports network failures and timeouts", async () => {
    const failing = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await generateCatalogImage(image, { apiKey: "k", fetchImpl: failing }).catch((e: unknown) => e);
    expect((err as GeminiError).kind).toBe("network");

    const timingOut = fakeFetch(() => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const err2 = await generateCatalogImage(image, { apiKey: "k", fetchImpl: timingOut }).catch((e: unknown) => e);
    expect((err2 as GeminiError).kind).toBe("timeout");
  });
});
