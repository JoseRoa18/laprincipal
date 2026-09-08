import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db/client";
import { settings } from "@/db/schema";

export const companySchema = z.object({
  name: z.string().min(1).default("La Principal 2050"),
  taxId: z.string().default(""),
  address: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  logoPath: z.string().nullable().default(null),
});
export type CompanySettings = z.infer<typeof companySchema>;

export const policiesSchema = z.object({
  allowNegativeStock: z.boolean().default(false),
  maxDiscountPctByRole: z
    .object({ admin: z.number().default(100), seller: z.number().default(10), warehouse: z.number().default(0) })
    .default({ admin: 100, seller: 10, warehouse: 0 }),
  voidWindowHours: z.number().default(24),
  quoteValidityDays: z.number().default(7),
  techPriceMarkdownPct: z.number().default(10),
  defaultMarginPct: z.number().default(35),
  requireRatesToSell: z.boolean().default(true),
  requireOpenCashSession: z.boolean().default(true),
});
export type Policies = z.infer<typeof policiesSchema>;

export const printingSchema = z.object({
  ticketWidthMm: z.union([z.literal(58), z.literal(80)]).default(80),
  footer: z.string().default("¡Gracias por su compra!"),
  showBsOnTicket: z.boolean().default(true),
  showCopOnTicket: z.boolean().default(false),
});
export type PrintingSettings = z.infer<typeof printingSchema>;

export const statsSchema = z.object({
  windows: z.array(z.number()).default([30, 60, 90]),
  weights: z.array(z.number()).default([0.5, 0.3, 0.2]),
  serviceLevels: z.object({ A: z.number(), B: z.number(), C: z.number() }).default({ A: 0.95, B: 0.9, C: 0.85 }),
  targetCoverDays: z.number().default(30),
  soonThresholdDays: z.number().default(7),
  noMovementDays: z.number().default(90),
  minDaysForAuto: z.number().default(30),
});
export type StatsSettings = z.infer<typeof statsSchema>;

const SCHEMAS = {
  company: companySchema,
  policies: policiesSchema,
  printing: printingSchema,
  stats: statsSchema,
} as const;

type SettingKey = keyof typeof SCHEMAS;
type SettingValue<K extends SettingKey> = z.infer<(typeof SCHEMAS)[K]>;

export async function getSetting<K extends SettingKey>(key: K, dbx: DbOrTx = db): Promise<SettingValue<K>> {
  const [row] = await dbx.select().from(settings).where(eq(settings.key, key)).limit(1);
  const schema = SCHEMAS[key];
  return schema.parse(row?.value ?? {}) as SettingValue<K>;
}

export async function saveSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  userId: string,
  dbx: DbOrTx = db,
): Promise<SettingValue<K>> {
  const parsed = SCHEMAS[key].parse(value) as SettingValue<K>;
  await dbx
    .insert(settings)
    .values({ key, value: parsed, updatedBy: userId })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedBy: userId, updatedAt: new Date() } });
  return parsed;
}

/** When a setting was last saved (null while it still has the seed value). Used to cache-bust the logo URL. */
export async function getSettingUpdatedAt(key: SettingKey, dbx: DbOrTx = db): Promise<Date | null> {
  const [row] = await dbx.select({ updatedAt: settings.updatedAt }).from(settings).where(eq(settings.key, key)).limit(1);
  return row?.updatedAt ?? null;
}

export const getCompanySettings = () => getSetting("company");
export const getPolicies = () => getSetting("policies");
export const getPrintingSettings = () => getSetting("printing");
export const getStatsSettings = () => getSetting("stats");
