import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { money, qty, rate, timestamps } from "./_common";
import { receiptStatusEnum } from "./enums";
import { users, warehouses } from "./core";
import { currencies } from "./currency";
import { products, suppliers } from "./catalog";

/** "Entrada por compra": goods received with the supplier's document. */
export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    supplierDocument: text("supplier_document"),
    receiptDate: date("receipt_date").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code),
    exchangeRate: rate("exchange_rate").notNull().default("1"),
    subtotalUsd: money("subtotal_usd").notNull().default("0"),
    extraCostsUsd: money("extra_costs_usd").notNull().default("0"),
    totalUsd: money("total_usd").notNull().default("0"),
    notes: text("notes"),
    status: receiptStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    ...timestamps(),
  },
  (t) => [index("purchase_receipts_supplier_idx").on(t.supplierId, t.receiptDate)],
);

export const purchaseReceiptItems = pgTable(
  "purchase_receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: qty("quantity").notNull(),
    /** Unit cost in the receipt currency. */
    unitCostAmount: money("unit_cost_amount").notNull(),
    unitCostUsd: money("unit_cost_usd").notNull(),
    extraCostShareUsd: money("extra_cost_share_usd").notNull().default("0"),
    /** unit_cost_usd + extra_cost_share_usd, used for the weighted average. */
    unitCostFinalUsd: money("unit_cost_final_usd").notNull(),
    lineTotalUsd: money("line_total_usd").notNull(),
  },
  (t) => [index("purchase_receipt_items_receipt_idx").on(t.receiptId)],
);
