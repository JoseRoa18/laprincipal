import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { products, stockSettings } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D, toQtyDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import type { StockSettingsInput } from "./schemas";

/** Create or update the min/max/reorder settings of a product in the default warehouse. */
export async function upsertStockSettings(input: StockSettingsInput, userId: string, dbx: DbOrTx = db) {
  const min = D(input.minStock);
  const max = D(input.maxStock);
  const rop = D(input.reorderPoint);
  if (max.gt(0) && max.lt(min)) throw new AppError("VALIDATION", "El máximo debe ser mayor o igual que el mínimo.", { fields: { maxStock: "Debe ser mayor o igual que el mínimo." } });
  if (max.gt(0) && rop.gt(max)) throw new AppError("VALIDATION", "El punto de reorden no puede superar el máximo.", { fields: { reorderPoint: "No puede superar el máximo." } });

  const [product] = await dbx.select({ id: products.id }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw notFound("El producto");

  const { warehouseId } = await getDefaultLocation(dbx);
  const [before] = await dbx
    .select()
    .from(stockSettings)
    .where(and(eq(stockSettings.productId, input.productId), eq(stockSettings.warehouseId, warehouseId)))
    .limit(1);

  const values = {
    minStock: toQtyDb(min),
    maxStock: toQtyDb(max),
    reorderPoint: toQtyDb(rop),
    reorderQty: toQtyDb(input.reorderQty),
    mode: input.mode,
    updatedBy: userId,
  };
  const [row] = await dbx
    .insert(stockSettings)
    .values({ productId: input.productId, warehouseId, ...values })
    .onConflictDoUpdate({ target: [stockSettings.productId, stockSettings.warehouseId], set: { ...values, updatedAt: new Date() } })
    .returning();

  await writeAudit(dbx, {
    userId,
    action: before ? "stock_settings.update" : "stock_settings.create",
    entityType: "product",
    entityId: input.productId,
    before: before ?? null,
    after: row,
  });
  return row;
}
