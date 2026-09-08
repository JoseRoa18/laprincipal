import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, type DbOrTx } from "@/db/client";
import { branches, cashRegisters, warehouses } from "@/db/schema";
import { AppError } from "@/lib/errors";

/** Single-store MVP: the first active branch and warehouse. */
export const getDefaultLocation = cache(async (dbx: DbOrTx = db) => {
  const [wh] = await dbx
    .select({ warehouseId: warehouses.id, branchId: warehouses.branchId, warehouseName: warehouses.name })
    .from(warehouses)
    .innerJoin(branches, eq(branches.id, warehouses.branchId))
    .where(eq(warehouses.isActive, true))
    .orderBy(warehouses.createdAt)
    .limit(1);
  if (!wh) throw new AppError("INTERNAL", "No hay un almacén configurado. Ejecuta la semilla de datos.");
  return wh;
});

export const getDefaultCashRegister = cache(async (dbx: DbOrTx = db) => {
  const [reg] = await dbx
    .select()
    .from(cashRegisters)
    .where(eq(cashRegisters.isActive, true))
    .orderBy(cashRegisters.createdAt)
    .limit(1);
  if (!reg) throw new AppError("INTERNAL", "No hay una caja configurada. Ejecuta la semilla de datos.");
  return reg;
});
