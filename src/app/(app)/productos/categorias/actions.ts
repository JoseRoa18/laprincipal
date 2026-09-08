"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createBrand, createCategory, deleteBrand, deleteCategory, updateBrand, updateCategory } from "@/modules/catalog/application/categories";
import { brandSchema, categorySchema } from "@/modules/catalog/domain/category-schema";

const idSchema = z.uuid("Identificador inválido");
const updateCategorySchema = categorySchema.extend({ isActive: z.boolean().optional() });
const updateBrandSchema = brandSchema.extend({ isActive: z.boolean().optional() });

function revalidate() {
  revalidatePath("/productos", "layout");
}

export async function createCategoryAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const row = await createCategory(parseInput(categorySchema, input), user);
    revalidate();
    return row;
  });
}

export async function updateCategoryAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const row = await updateCategory(parseInput(idSchema, id), parseInput(updateCategorySchema, input), user);
    revalidate();
    return row;
  });
}

export async function deleteCategoryAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const result = await deleteCategory(parseInput(idSchema, id), user);
    revalidate();
    return result;
  });
}

export async function createBrandAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const row = await createBrand(parseInput(brandSchema, input), user);
    revalidate();
    return row;
  });
}

export async function updateBrandAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const row = await updateBrand(parseInput(idSchema, id), parseInput(updateBrandSchema, input), user);
    revalidate();
    return row;
  });
}

export async function deleteBrandAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const result = await deleteBrand(parseInput(idSchema, id), user);
    revalidate();
    return result;
  });
}
