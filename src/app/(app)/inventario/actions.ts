"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole, can, getSessionUser } from "@/lib/auth-guards";
import { searchProducts, type ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { stockSettingsSchema } from "@/modules/inventory/application/schemas";
import { upsertStockSettings } from "@/modules/inventory/application/stock-settings";

function hideCost(user: { role: "admin" | "seller" | "warehouse" }, p: ProductForSale): ProductForSale {
  return can(user.role, "view_costs") ? p : { ...p, costAvgUsd: "0" };
}

/** Product search for pickers (adjustments, receipts, kardex filter). Costs are hidden from sellers. */
export async function searchProductsAction(q: string): Promise<ProductForSale[]> {
  const user = await getSessionUser();
  if (!user || !q.trim()) return [];
  const { warehouseId } = await getDefaultLocation();
  const rows = await searchProducts(q, { warehouseId, limit: 12 });
  return rows.map((p) => hideCost(user, p));
}

export async function upsertStockSettingsAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(stockSettingsSchema, input);
    const row = await upsertStockSettings(data, user.id);
    revalidatePath("/inventario");
    revalidatePath("/inventario/alertas");
    revalidatePath("/compras/que-comprar");
    revalidatePath(`/productos/${data.productId}`);
    return { productId: row.productId };
  });
}
