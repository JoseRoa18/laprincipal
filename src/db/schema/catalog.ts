import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { money, pct, softDelete, timestamps } from "./_common";
import { barcodeTypeEnum, imageStatusEnum } from "./enums";
import { users } from "./core";
import { currencies } from "./currency";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("categories_parent_idx").on(t.parentId)],
);

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(0),
  ...timestamps(),
});

export const taxes = pgTable("taxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** 0.1600 = 16 % */
  rate: pct("rate").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull().unique(),
    partNumber: text("part_number"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id),
    brandId: uuid("brand_id").references(() => brands.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    taxId: uuid("tax_id")
      .notNull()
      .references(() => taxes.id),
    warrantyDays: integer("warranty_days").notNull().default(0),
    /** Shelf location, e.g. "P2-E3-N1" */
    locationCode: text("location_code"),
    costAvgUsd: money("cost_avg_usd").notNull().default("0"),
    costLastUsd: money("cost_last_usd"),
    attributes: jsonb("attributes").notNull().default({}),
    /**
     * Lower-cased, accent-stripped concatenation of name, part number,
     * equivalences and compatibilities. Maintained by the application.
     */
    searchText: text("search_text").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    ...softDelete(),
    ...timestamps(),
  },
  (t) => [
    index("products_part_number_idx").on(t.partNumber),
    index("products_category_idx").on(t.categoryId),
    index("products_search_trgm_idx").using("gin", t.searchText.op("gin_trgm_ops")),
  ],
);

export const productEquivalences = pgTable(
  "product_equivalences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    brand: text("brand"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("product_equivalences_uidx").on(t.productId, t.code),
    index("product_equivalences_code_idx").on(t.code),
  ],
);

export const productCompatibilities = pgTable(
  "product_compatibilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** nevera, lavadora, aire acondicionado, cocina, microondas, secadora... */
    applianceType: text("appliance_type"),
    brand: text("brand"),
    model: text("model"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("product_compatibilities_product_idx").on(t.productId)],
);

export const productBarcodes = pgTable(
  "product_barcodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    type: barcodeTypeEnum("type").notNull().default("CODE128"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("product_barcodes_product_idx").on(t.productId)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    originalPath: text("original_path").notNull(),
    processedPath: text("processed_path"),
    thumbPath: text("thumb_path"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: imageStatusEnum("status").notNull().default("pending"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** RIF */
  taxId: text("tax_id"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  currencyCode: text("currency_code")
    .notNull()
    .default("USD")
    .references(() => currencies.code),
  leadTimeDays: integer("lead_time_days").notNull().default(7),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  ...softDelete(),
  ...timestamps(),
});

export const productSuppliers = pgTable(
  "product_suppliers",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    supplierCode: text("supplier_code"),
    lastCostAmount: money("last_cost_amount"),
    lastCostCurrency: text("last_cost_currency").references(() => currencies.code),
    lastCostUsd: money("last_cost_usd"),
    lastPurchaseAt: timestamp("last_purchase_at", { withTimezone: true }),
    /** Units per pack the supplier sells (for rounding suggestions). */
    packSize: integer("pack_size").notNull().default(1),
    isPreferred: boolean("is_preferred").notNull().default(false),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.supplierId] })],
);

export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** PUBLIC | TECH */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const priceListItems = pgTable(
  "price_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceUsd: money("price_usd").notNull(),
    taxIncluded: boolean("tax_included").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [uniqueIndex("price_list_items_uidx").on(t.priceListId, t.productId)],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    oldPriceUsd: money("old_price_usd"),
    newPriceUsd: money("new_price_usd").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("price_history_product_idx").on(t.productId, t.changedAt)],
);
