import { and, eq, gte, isNotNull, notExists, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { inventoryMovements, products, stockSettings } from "@/db/schema";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { listStock, qtyExpr, type StockRow } from "./stock-query";

export interface AlertGroups {
  buyNow: StockRow[];
  soon: StockRow[];
  excess: StockRow[];
  noMovement: StockRow[];
  outOfStock: StockRow[];
  noMovementDays: number;
}

const LIMIT = 500;

/** Stock alerts for the default warehouse. Each list is capped at 500 rows. */
export async function getAlerts(dbx: DbOrTx = db): Promise<AlertGroups> {
  const { warehouseId } = await getDefaultLocation(dbx);
  const stats = await getSetting("stats", dbx);
  const noMovementDays = Math.max(1, stats.noMovementDays || 90);
  const since = new Date(Date.now() - noMovementDays * 86_400_000);

  const common = { dbx, warehouseId, pageSize: LIMIT } as const;
  const [buyNow, soon, excess, noMovement, outOfStock] = await Promise.all([
    listStock({ ...common, status: "buy_now" }),
    listStock({ ...common, status: "soon" }),
    listStock({ ...common, status: "excess" }),
    listStock({
      ...common,
      extraWhere: [
        sql`${qtyExpr} > 0`,
        notExists(
          dbx
            .select({ one: sql`1` })
            .from(inventoryMovements)
            .where(
              and(
                eq(inventoryMovements.productId, products.id),
                eq(inventoryMovements.type, "sale_out"),
                gte(inventoryMovements.createdAt, since),
              ),
            ),
        ),
      ],
    }),
    listStock({ ...common, extraWhere: [isNotNull(stockSettings.productId), sql`${qtyExpr} <= 0`] }),
  ]);

  return {
    buyNow: buyNow.rows,
    soon: soon.rows,
    excess: excess.rows,
    noMovement: noMovement.rows,
    outOfStock: outOfStock.rows,
    noMovementDays,
  };
}
