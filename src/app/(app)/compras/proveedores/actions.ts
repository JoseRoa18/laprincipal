"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { preferredSupplierSchema, supplierSchema } from "@/modules/purchasing/application/schemas";
import { createSupplier, setPreferredSupplier, updateSupplier } from "@/modules/purchasing/application/suppliers";

export async function createSupplierAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(supplierSchema, input);
    const row = await createSupplier(data, user);
    revalidatePath("/compras/proveedores");
    revalidatePath("/compras");
    return { id: row.id };
  });
}

export async function updateSupplierAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const { id, ...rest } = parseInput(supplierSchema.extend({ id: z.uuid() }), input);
    const row = await updateSupplier(id, rest, user);
    revalidatePath("/compras/proveedores");
    revalidatePath(`/compras/proveedores/${id}`);
    revalidatePath("/compras/que-comprar");
    return { id: row.id };
  });
}

export async function setPreferredSupplierAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(preferredSupplierSchema, input);
    await setPreferredSupplier(data.productId, data.supplierId, data.preferred, user);
    revalidatePath(`/compras/proveedores/${data.supplierId}`);
    revalidatePath("/compras/que-comprar");
    revalidatePath(`/productos/${data.productId}`);
    return data;
  });
}
