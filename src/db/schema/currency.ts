import { boolean, date, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { rate, timestamps } from "./_common";
import { rateSourceEnum } from "./enums";
import { users } from "./core";

export const currencies = pgTable("currencies", {
  /** ISO 4217: USD, VES, COP */
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(2),
  /** Cash rounding step, e.g. 100 for COP, 0.01 for USD. */
  cashRounding: numeric("cash_rounding", { precision: 10, scale: 2 }).notNull().default("0.01"),
  isBase: boolean("is_base").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

/** One row per currency and date. rate = units of currency per 1 USD. */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code),
    rate: rate("rate").notNull(),
    effectiveDate: date("effective_date").notNull(),
    source: rateSourceEnum("source").notNull().default("manual"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("exchange_rates_currency_date_uidx").on(t.currencyCode, t.effectiveDate)],
);
