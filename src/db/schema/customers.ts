import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { softDelete, timestamps } from "./_common";
import { customerKindEnum, customerTypeEnum, docTypeEnum } from "./enums";
import { priceLists } from "./catalog";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: customerKindEnum("kind").notNull().default("person"),
    docType: docTypeEnum("doc_type").notNull().default("NONE"),
    docNumber: text("doc_number"),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    customerType: customerTypeEnum("customer_type").notNull().default("public"),
    priceListId: uuid("price_list_id").references(() => priceLists.id),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...softDelete(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("customers_doc_uidx")
      .on(t.docType, t.docNumber)
      .where(sql`${t.docType} <> 'NONE' AND ${t.deletedAt} IS NULL`),
    index("customers_name_idx").on(t.name),
    index("customers_phone_idx").on(t.phone),
  ],
);
