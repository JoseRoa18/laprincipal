import { TZDate } from "@date-fns/tz";
import { DEFAULT_TZ } from "@/lib/format";

/**
 * Business-day helpers. A "day" is always a `yyyy-MM-dd` string in the
 * business time zone (America/Caracas); instants are plain `Date` objects.
 * Pure string/UTC arithmetic so results never depend on the server clock zone.
 */

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(day: string, n: number): string {
  const dt = toUtc(day);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** Every day from `from` to `to`, inclusive. Empty when `to` < `from`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

/** Monday of the week containing `day`. */
export function startOfWeek(day: string): string {
  const weekday = toUtc(day).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** Instant at 00:00 of `day` in the business time zone. */
export function dayStart(day: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, tz).getTime());
}

/** Instant at 00:00 of the day after `day` (exclusive upper bound). */
export function dayEndExclusive(day: string, tz = DEFAULT_TZ): Date {
  return dayStart(addDays(day, 1), tz);
}

/** Business day (`yyyy-MM-dd`) of an instant. */
export function dayOf(date: Date, tz = DEFAULT_TZ): string {
  const t = new TZDate(date.getTime(), tz);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "08/09/2026" */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** "8 sep" (for chart ticks). */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "8 de septiembre de 2026" */
export function formatDayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

export type RangePreset = "today" | "yesterday" | "week" | "month" | "last_month" | "last_30" | "custom";

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  month: "Este mes",
  last_month: "Mes pasado",
  last_30: "Últimos 30 días",
  custom: "Personalizado",
};

export type FixedPreset = Exclude<RangePreset, "custom">;

export const PRESETS: FixedPreset[] = ["today", "yesterday", "week", "month", "last_month", "last_30"];

export interface DateRange {
  /** Inclusive business days. */
  from: string;
  to: string;
  preset: RangePreset;
}

export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "week":
      return { from: startOfWeek(today), to: today };
    case "month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const lastMonthEnd = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastMonthEnd), to: lastMonthEnd };
    }
    case "last_30":
      return { from: addDays(today, -29), to: today };
  }
}

/** The period of the same length immediately before the range. */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const days = diffDays(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export function rangeDays(range: { from: string; to: string }): number {
  return diffDays(range.from, range.to) + 1;
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads `preset`, `from` and `to` from the page searchParams.
 * Falls back to the current month. Invalid or reversed dates are ignored.
 */
export function parseDateRange(params: Params, today: string, defaultPreset: Exclude<RangePreset, "custom"> = "month"): DateRange {
  const preset = first(params.preset);
  const from = first(params.from);
  const to = first(params.to);

  if (preset && PRESETS.includes(preset as FixedPreset)) {
    return { ...presetRange(preset as FixedPreset, today), preset: preset as FixedPreset };
  }
  if (isIsoDay(from) && isIsoDay(to) && from <= to) {
    return { from, to, preset: "custom" };
  }
  if (isIsoDay(from) && !to) return { from, to: from, preset: "custom" };
  return { ...presetRange(defaultPreset, today), preset: defaultPreset };
}

/** "Del 01/09/2026 al 08/09/2026" or "08/09/2026" for a single day. */
export function describeRange(range: { from: string; to: string }): string {
  if (range.from === range.to) return formatDay(range.from);
  return `Del ${formatDay(range.from)} al ${formatDay(range.to)}`;
}

/** Query string for a range (keeps other params). */
export function rangeQuery(range: DateRange, extra: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (range.preset !== "custom") sp.set("preset", range.preset);
  sp.set("from", range.from);
  sp.set("to", range.to);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}
