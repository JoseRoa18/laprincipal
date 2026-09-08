import {
  bigserial,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { money, qty, timestamps } from "./_common";
import {
  adjustmentStatusEnum,
  countStatusEnum,
  movementTypeEnum,
  reasonKindEnum,
  statsStatusEnum,
  stockModeEnum,
} from "./enums";
import { users, warehouses } from "./core";
import { products } from "./catalog";

export const stockLevels = pgTable(
  "stock_levels",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: qty("quantity").notNull().default("0"),
    reservedQty: qty("reserved_qty").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.warehouseId] })],
);

export const stockSettings = pgTable(
  "stock_settings",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    minStock: qty("min_stock").notNull().default("0"),
    maxStock: qty("max_stock").notNull().default("0"),
    reorderPoint: qty("reorder_point").notNull().default("0"),
    reorderQty: qty("reorder_qty").notNull().default("0"),
    mode: stockModeEnum("mode").notNull().default("manual"),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.warehouseId] })],
);

export const adjustmentReasons = pgTable("adjustment_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: reasonKindEnum("kind").notNull().default("both"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

/** Kardex. Append-only: a trigger blocks UPDATE and DELETE. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    type: movementTypeEnum("type").notNull(),
    /** Signed: positive for inbound, negative for outbound. */
    quantity: qty("quantity").notNull(),
    unitCostUsd: money("unit_cost_usd").notNull().default("0"),
    totalCostUsd: money("total_cost_usd").notNull().default("0"),
    balanceAfter: qty("balance_after").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    reasonId: uuid("reason_id").references(() => adjustmentReasons.id),
    userId: uuid("user_id").references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("inventory_movements_product_idx").on(t.productId, t.createdAt),
    index("inventory_movements_reference_idx").on(t.referenceType, t.referenceId),
    index("inventory_movements_created_idx").on(t.createdAt),
  ],
);

export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").unique(),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  reasonId: uuid("reason_id")
    .notNull()
    .references(() => adjustmentReasons.id),
  status: adjustmentStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  appliedBy: uuid("applied_by").references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  ...timestamps(),
});

export const inventoryAdjustmentItems = pgTable(
  "inventory_adjustment_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adjustmentId: uuid("adjustment_id")
      .notNull()
      .references(() => inventoryAdjustments.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Signed delta applied to stock. */
    quantityDelta: qty("quantity_delta").notNull(),
    unitCostUsd: money("unit_cost_usd").notNull().default("0"),
    notes: text("notes"),
  },
  (t) => [index("inventory_adjustment_items_adj_idx").on(t.adjustmentId)],
);

export const stockCounts = pgTable("stock_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").unique(),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  /** e.g. { categoryId, locationPrefix } */
  filter: jsonb("filter").notNull().default({}),
  status: countStatusEnum("status").notNull().default("open"),
  blind: boolean("blind").notNull().default(true),
  startedBy: uuid("started_by")
    .notNull()
    .references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  appliedBy: uuid("applied_by").references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  notes: text("notes"),
  ...timestamps(),
});

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    expectedQty: qty("expected_qty").notNull(),
    countedQty: qty("counted_qty"),
    difference: qty("difference"),
    countedBy: uuid("counted_by").references(() => users.id),
    countedAt: timestamp("counted_at", { withTimezone: true }),
  },
  (t) => [index("stock_count_items_count_idx").on(t.countId)],
);

/** Sales velocity and reorder statistics, recomputed daily. */
export const productStats = pgTable("product_stats", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  velocity30: numeric("velocity_30", { precision: 18, scale: 4 }).notNull().default("0"),
  velocity60: numeric("velocity_60", { precision: 18, scale: 4 }).notNull().default("0"),
  velocity90: numeric("velocity_90", { precision: 18, scale: 4 }).notNull().default("0"),
  /** Weighted velocity used for decisions. */
  velocity: numeric("velocity", { precision: 18, scale: 4 }).notNull().default("0"),
  demandStdDev: numeric("demand_std_dev", { precision: 18, scale: 4 }).notNull().default("0"),
  daysOfCover: numeric("days_of_cover", { precision: 10, scale: 2 }),
  abcClass: char("abc_class", { length: 1 }),
  revenue90Usd: money("revenue_90_usd").notNull().default("0"),
  units90: qty("units_90").notNull().default("0"),
  daysWithSales: integer("days_with_sales").notNull().default(0),
  lastSaleAt: timestamp("last_sale_at", { withTimezone: true }),
  firstStockAt: timestamp("first_stock_at", { withTimezone: true }),
  suggestedReorderPoint: qty("suggested_reorder_point").notNull().default("0"),
  suggestedQty: qty("suggested_qty").notNull().default("0"),
  status: statsStatusEnum("status").notNull().default("no_data"),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});
