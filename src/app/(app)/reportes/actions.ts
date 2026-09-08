"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { writeAudit } from "@/modules/core/application/audit";
import { recomputeProductStats } from "@/modules/reporting/application/product-stats";

/** "Recalcular ahora": recomputes product_stats for every active product. */
export async function recomputeStatsAction() {
  return runAction(async () => {
    const user = await assertRole("admin");
    const summary = await recomputeProductStats();
    await writeAudit(db, {
      userId: user.id,
      action: "stats.recompute",
      entityType: "product_stats",
      after: { products: summary.products, autoUpdated: summary.autoUpdated, durationMs: summary.durationMs },
    });
    for (const path of ["/reportes", "/reportes/velocidad", "/reportes/sin-movimiento", "/inicio", "/inventario", "/compras/que-comprar"]) {
      revalidatePath(path);
    }
    return summary;
  });
}
