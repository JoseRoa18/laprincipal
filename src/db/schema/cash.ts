import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, pct, timestamps } from "./_common";
import { cashMovementTypeEnum, cashSessionStatusEnum, paymentKindEnum } from "./enums";
import { branches, users } from "./core";
import { currencies } from "./currency";

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: paymentKindEnum("kind").notNull(),
  currencyCode: text("currency_code")
    .notNull()
    .references(() => currencies.code),
  requiresReference: boolean("requires_reference").notNull().default(false),
  /** Cash methods count in the drawer and in the blind count. */
  countsInDrawer: boolean("counts_in_drawer").notNull().default(false),
  /** Extra charge on this method (IGTF), 0 by default. */
  surchargePct: pct("surcharge_pct").notNull().default("0"),
  /** Can this method be used to give change? Only cash methods. */
  allowsChange: boolean("allows_change").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

export const cashRegisters = pgTable("cash_registers", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    registerId: uuid("register_id")
      .notNull()
      .references(() => cashRegisters.id),
    status: cashSessionStatusEnum("status").notNull().default("open"),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Totals by payment method and currency captured at close. */
    closingSummary: jsonb("closing_summary"),
    notes: text("notes"),
    closingNotes: text("closing_notes"),
    ...timestamps(),
  },
  (t) => [
    // Only one open session per register.
    uniqueIndex("cash_sessions_open_uidx")
      .on(t.registerId)
      .where(sql`${t.status} = 'open'`),
    index("cash_sessions_opened_idx").on(t.openedAt),
  ],
);

/** One row per cash currency (USD, COP) per session. */
export const cashSessionBalances = pgTable(
  "cash_session_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code),
    openingAmount: money("opening_amount").notNull().default("0"),
    salesCash: money("sales_cash").notNull().default("0"),
    changeGiven: money("change_given").notNull().default("0"),
    refundsCash: money("refunds_cash").notNull().default("0"),
    movementsIn: money("movements_in").notNull().default("0"),
    movementsOut: money("movements_out").notNull().default("0"),
    expectedAmount: money("expected_amount"),
    countedAmount: money("counted_amount"),
    difference: money("difference"),
    justification: text("justification"),
  },
  (t) => [uniqueIndex("cash_session_balances_uidx").on(t.sessionId, t.currencyCode)],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cashSessions.id),
    type: cashMovementTypeEnum("type").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    authorizedBy: uuid("authorized_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cash_movements_session_idx").on(t.sessionId)],
);
