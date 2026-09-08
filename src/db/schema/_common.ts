import { numeric, timestamp } from "drizzle-orm/pg-core";

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const softDelete = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Money amount: numeric(18,4). Drizzle returns it as string. */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
/** Quantity: numeric(18,3). */
export const qty = (name: string) => numeric(name, { precision: 18, scale: 3 });
/** Exchange rate: numeric(18,6). */
export const rate = (name: string) => numeric(name, { precision: 18, scale: 6 });
/** Percentage or tax rate: numeric(8,4) (0.1600 = 16 %). */
export const pct = (name: string) => numeric(name, { precision: 8, scale: 4 });
