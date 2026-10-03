import { parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";

/** The official Bs rate always comes from the BCV; the other currencies are entered by hand. */
export const BCV_CURRENCY = "VES";

/**
 * Bs per 1 USD as published by the BCV, with its "Fecha Valor": the business
 * day it applies from. The BCV publishes it the afternoon before (on Friday
 * for Monday), so it is stored with that date and the app keeps using the
 * previous rate until then.
 */
export interface BcvRate {
  rate: string;
  /** yyyy-MM-dd */
  valueDate: string;
}

/** Reads the USD rate and its "Fecha Valor" from the home page of bcv.org.ve. */
export function parseBcvHomePage(html: string): BcvRate | null {
  const start = html.indexOf('id="dolar"');
  if (start < 0) return null;
  const amount = html.slice(start, start + 2000).match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  const date = html.match(/Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})T/);
  if (!amount || !date) return null;
  const rate = parseLocalizedNumber(amount[1]);
  if (!rate || !D(rate).gt(0)) return null;
  return { rate, valueDate: date[1] };
}

/** Reads the fallback source (ve.dolarapi.com/v1/dolares/oficial), which mirrors the rate in force. */
export function parseDolarApiOfficial(body: unknown): BcvRate | null {
  if (!body || typeof body !== "object") return null;
  const { promedio, fechaActualizacion } = body as { promedio?: unknown; fechaActualizacion?: unknown };
  if (typeof promedio !== "number" || !(promedio > 0) || typeof fechaActualizacion !== "string") return null;
  const date = fechaActualizacion.match(/^(\d{4}-\d{2}-\d{2})/);
  return date ? { rate: String(promedio), valueDate: date[1] } : null;
}

/**
 * Guard against a misread page: a new rate between half and double the
 * previous one is accepted; anything else needs a person to confirm it.
 */
export function isPlausibleRateChange(previous: string | null, next: string): boolean {
  if (!previous || !D(previous).gt(0)) return true;
  const ratio = D(next).div(D(previous));
  return ratio.gte(0.5) && ratio.lte(2);
}
