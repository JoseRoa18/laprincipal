import { TZDate } from "@date-fns/tz";
import { format as formatDateFns } from "date-fns";
import { D, type Num } from "./money";

export const APP_LOCALE = "es-VE";
export const DEFAULT_TZ = "America/Caracas";

const SYMBOLS: Record<string, string> = { USD: "$", VES: "Bs", COP: "COP" };
const DECIMALS: Record<string, number> = { USD: 2, VES: 2, COP: 0 };

/** "$ 12,50", "Bs 1.234,56", "COP 52.000" */
export function formatMoney(
  value: Num,
  currency = "USD",
  opts: { decimals?: number; symbol?: string; signed?: boolean } = {},
): string {
  const decimals = opts.decimals ?? DECIMALS[currency] ?? 2;
  const symbol = opts.symbol ?? SYMBOLS[currency] ?? currency;
  const n = D(value).toDecimalPlaces(decimals).toNumber();
  const formatted = new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n));
  const sign = n < 0 ? "-" : opts.signed && n > 0 ? "+" : "";
  return `${sign}${symbol} ${formatted}`;
}

export function formatQty(value: Num, decimals = 0): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(D(value).toNumber());
}

export function formatPct(value: Num, decimals = 1): string {
  return `${new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(D(value).toNumber())} %`;
}

export function toTz(date: Date | string | number, tz = DEFAULT_TZ): TZDate {
  const d = date instanceof Date ? date : new Date(date);
  return new TZDate(d.getTime(), tz);
}

export function formatDate(date: Date | string | number | null | undefined, pattern = "dd/MM/yyyy"): string {
  if (!date) return "";
  return formatDateFns(toTz(date), pattern);
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  return formatDate(date, "dd/MM/yyyy HH:mm");
}

/** yyyy-MM-dd for the business timezone (used for daily rates and reports). */
export function businessDate(date: Date = new Date(), tz = DEFAULT_TZ): string {
  return formatDateFns(toTz(date, tz), "yyyy-MM-dd");
}

/** Parse user input like "1.234,56" or "1234.56" into a numeric string. */
export function parseLocalizedNumber(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // If both separators exist, the last one is the decimal separator.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Only dots: "52.000" or "1.234.567" are thousands (es-VE), "12.50" or "1.5" are decimals.
    const dots = (s.match(/\./g) ?? []).length;
    const afterLastDot = s.length - lastDot - 1;
    const thousands = dots > 1 || (dots === 1 && afterLastDot === 3);
    normalized = thousands ? s.replace(/\./g, "").replace(/,/g, "") : s.replace(/,/g, "");
  } else {
    normalized = s;
  }
  normalized = normalized.replace(/[^\d.-]/g, "");
  if (!/^-?\d*(\.\d+)?$/.test(normalized) || normalized === "" || normalized === "-") return null;
  return normalized;
}
