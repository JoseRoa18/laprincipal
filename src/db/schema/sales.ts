import { boolean, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { money, pct, qty, rate, timestamps } from "./_common";
import { discountTypeEnum, quoteStatusEnum, returnStatusEnum, saleStatusEnum } from "./enums";
import { branches, users, warehouses } from "./core";
import { currencies } from "./currency";
import { priceLists, products } from "./catalog";
import { customers } from "./customers";
import { adjustmentReasons } from "./inventory";
import { cashSessions, paymentMethods } from "./cash";

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id),
    status: quoteStatusEnum("status").notNull().default("open"),
    validUntil: date("valid_until").notNull(),
    subtotalUsd: money("subtotal_usd").notNull().default("0"),
    discountUsd: money("discount_usd").notNull().default("0"),
    taxUsd: money("tax_usd").notNull().default("0"),
    totalUsd: money("total_usd").notNull().default("0"),
    rateVes: rate("rate_ves").notNull().default("0"),
    rateCop: rate("rate_cop").notNull().default("0"),
    reservesStock: boolean("reserves_stock").notNull().default(false),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [index("quotes_customer_idx").on(t.customerId), index("quotes_status_idx").on(t.status)],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unitPriceUsd: money("unit_price_usd").notNull(),
    discountType: discountTypeEnum("discount_type").notNull().default("pct"),
    discountValue: money("discount_value").notNull().default("0"),
    taxRate: pct("tax_rate").notNull().default("0"),
    taxUsd: money("tax_usd").notNull().default("0"),
    lineTotalUsd: money("line_total_usd").notNull(),
    sortOrder: text("sort_order"),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId)],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Assigned when the sale is completed. Held sales have no number. */
    number: text("number").unique(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id),
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id),
    status: saleStatusEnum("status").notNull().default("held"),
    saleDate: timestamp("sale_date", { withTimezone: true }).defaultNow().notNull(),
    subtotalUsd: money("subtotal_usd").notNull().default("0"),
    discountUsd: money("discount_usd").notNull().default("0"),
    taxUsd: money("tax_usd").notNull().default("0"),
    totalUsd: money("total_usd").notNull().default("0"),
    paidUsd: money("paid_usd").notNull().default("0"),
    changeUsd: money("change_usd").notNull().default("0"),
    changeCurrencyCode: text("change_currency_code").references(() => currencies.code),
    changeAmount: money("change_amount").notNull().default("0"),
    rateVes: rate("rate_ves").notNull().default("0"),
    rateCop: rate("rate_cop").notNull().default("0"),
    /** Label shown when a sale is held ("Cliente de la gorra azul"). */
    holdLabel: text("hold_label"),
    notes: text("notes"),
    quoteId: uuid("quote_id").references(() => quotes.id),
    voidReason: text("void_reason"),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("sales_date_idx").on(t.saleDate),
    index("sales_status_idx").on(t.status),
    index("sales_customer_idx").on(t.customerId),
    index("sales_session_idx").on(t.cashSessionId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    /** Price from the list at sale time, tax included. */
    unitPriceUsd: money("unit_price_usd").notNull(),
    /** Weighted average cost at sale time, for historical margin. */
    unitCostUsd: money("unit_cost_usd").notNull().default("0"),
    discountType: discountTypeEnum("discount_type").notNull().default("pct"),
    discountValue: money("discount_value").notNull().default("0"),
    discountUsd: money("discount_usd").notNull().default("0"),
    taxRate: pct("tax_rate").notNull().default("0"),
    taxUsd: money("tax_usd").notNull().default("0"),
    lineTotalUsd: money("line_total_usd").notNull(),
    returnedQty: qty("returned_qty").notNull().default("0"),
    discountAuthorizedBy: uuid("discount_authorized_by").references(() => users.id),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.productId)],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code),
    /** Amount in the payment currency. */
    amount: money("amount").notNull(),
    exchangeRate: rate("exchange_rate").notNull().default("1"),
    amountUsd: money("amount_usd").notNull(),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sale_payments_sale_idx").on(t.saleId), index("sale_payments_method_idx").on(t.paymentMethodId)],
);

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id),
    status: returnStatusEnum("status").notNull().default("completed"),
    reasonId: uuid("reason_id").references(() => adjustmentReasons.id),
    reasonText: text("reason_text"),
    restock: boolean("restock").notNull().default(true),
    refundMethodId: uuid("refund_method_id").references(() => paymentMethods.id),
    refundCurrencyCode: text("refund_currency_code").references(() => currencies.code),
    refundAmount: money("refund_amount").notNull().default("0"),
    refundAmountUsd: money("refund_amount_usd").notNull().default("0"),
    totalUsd: money("total_usd").notNull().default("0"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [index("sale_returns_sale_idx").on(t.saleId)],
);

export const saleReturnItems = pgTable(
  "sale_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => saleReturns.id, { onDelete: "cascade" }),
    saleItemId: uuid("sale_item_id")
      .notNull()
      .references(() => saleItems.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: qty("quantity").notNull(),
    unitPriceUsd: money("unit_price_usd").notNull(),
    lineTotalUsd: money("line_total_usd").notNull(),
  },
  (t) => [index("sale_return_items_return_idx").on(t.returnId)],
);
