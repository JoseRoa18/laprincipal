import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { saleItems, sales, type UserRole } from "@/db/schema";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { applyMovements } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import type { VoidSaleInput } from "./schemas";

export interface VoidContext {
  userId: string;
  role: UserRole;
}

/**
 * Void a completed sale (admin only): stock comes back with `sale_void_in`
 * movements at the cost stored on each line; the sale keeps its number.
 */
export async function voidSale(dbx: Db, input: VoidSaleInput, ctx: VoidContext): Promise<{ saleId: string; number: string | null }> {
  // Mirrors PERMISSIONS.void_sale in src/lib/auth-guards (kept out of here so tests run without next-auth).
  if (ctx.role !== "admin") throw forbidden();
  const policies = await getSetting("policies", dbx);

  return dbx.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1).for("update");
    if (!sale) throw notFound("La venta");
    if (sale.status === "voided") throw new AppError("INVALID_STATE", "La venta ya está anulada.");
    if (sale.status === "held") throw new AppError("INVALID_STATE", "Una venta en espera se descarta, no se anula.");
    if (sale.status !== "completed") {
      throw new AppError("INVALID_STATE", "No se puede anular una venta con devoluciones registradas.");
    }
    const hoursSince = (Date.now() - sale.saleDate.getTime()) / 3_600_000;
    const outsideWindow = hoursSince > policies.voidWindowHours;

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    await applyMovements(
      tx,
      items.map((item) => ({
        productId: item.productId,
        warehouseId: sale.warehouseId,
        type: "sale_void_in" as const,
        quantity: item.quantity,
        unitCostUsd: item.unitCostUsd,
        referenceType: "sale",
        referenceId: sale.id,
        userId: ctx.userId,
        notes: `Anulación de ${sale.number ?? "venta"}`,
        allowNegative: true,
      })),
    );

    await tx
      .update(sales)
      .set({ status: "voided", voidReason: input.reason, voidedBy: ctx.userId, voidedAt: new Date() })
      .where(eq(sales.id, sale.id));

    await writeAudit(tx, {
      userId: ctx.userId,
      action: "sale.void",
      entityType: "sale",
      entityId: sale.id,
      before: { status: sale.status, totalUsd: sale.totalUsd },
      after: { status: "voided", reason: input.reason, outsideWindow, voidWindowHours: policies.voidWindowHours },
    });
    return { saleId: sale.id, number: sale.number };
  });
}
