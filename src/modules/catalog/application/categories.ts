import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { brands, categories, products } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { slugify, type BrandInput, type CategoryInput } from "../domain/category-schema";
import type { ActorUser } from "./catalog-shared";

async function uniqueSlug(tx: Tx, base: string, excludeId?: string): Promise<string> {
  let slug = base || "categoria";
  for (let i = 2; i < 100; i++) {
    const [taken] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(excludeId ? and(eq(categories.slug, slug), ne(categories.id, excludeId)) : eq(categories.slug, slug));
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

async function assertParent(tx: Tx, parentId: string | null, selfId?: string) {
  if (!parentId) return null;
  if (selfId && parentId === selfId) throw new AppError("VALIDATION", "Una categoría no puede ser su propio padre.", { fields: { parentId: "Inválido" } });
  const [parent] = await tx.select({ id: categories.id, parentId: categories.parentId, slug: categories.slug }).from(categories).where(eq(categories.id, parentId));
  if (!parent) throw new AppError("VALIDATION", "La categoría padre no existe.", { fields: { parentId: "No existe" } });
  if (selfId) {
    // Walk up to make sure the new parent is not a descendant.
    let cursor: string | null = parent.parentId;
    for (let i = 0; cursor && i < 10; i++) {
      if (cursor === selfId) throw new AppError("VALIDATION", "No puedes mover una categoría dentro de una de sus subcategorías.", { fields: { parentId: "Inválido" } });
      const [up] = await tx.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, cursor));
      cursor = up?.parentId ?? null;
    }
  }
  return parent;
}

export async function createCategory(input: CategoryInput, user: ActorUser) {
  return db.transaction(async (tx) => {
    const parent = await assertParent(tx, input.parentId);
    const slug = await uniqueSlug(tx, parent ? `${parent.slug}-${slugify(input.name)}` : slugify(input.name));
    const [row] = await tx.insert(categories).values({ name: input.name, parentId: input.parentId, sortOrder: input.sortOrder, slug }).returning();
    await writeAudit(tx, { userId: user.id, action: "category.create", entityType: "category", entityId: row.id, after: row });
    return row;
  });
}

export async function updateCategory(id: string, input: CategoryInput & { isActive?: boolean }, user: ActorUser) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw notFound("La categoría");
    const parent = await assertParent(tx, input.parentId, id);
    const slug =
      before.name === input.name && before.parentId === input.parentId
        ? before.slug
        : await uniqueSlug(tx, parent ? `${parent.slug}-${slugify(input.name)}` : slugify(input.name), id);
    const [row] = await tx
      .update(categories)
      .set({ name: input.name, parentId: input.parentId, sortOrder: input.sortOrder, slug, isActive: input.isActive ?? before.isActive })
      .where(eq(categories.id, id))
      .returning();
    await writeAudit(tx, { userId: user.id, action: "category.update", entityType: "category", entityId: id, before, after: row });
    return row;
  });
}

export interface DeleteResult {
  deleted: boolean;
  deactivated: boolean;
  reason?: string;
}

/** Delete when unused; otherwise deactivate so it stops showing in forms. */
export async function deleteCategory(id: string, user: ActorUser): Promise<DeleteResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw notFound("La categoría");
    const [{ used }] = await tx.select({ used: count() }).from(products).where(eq(products.categoryId, id));
    const [{ children }] = await tx.select({ children: count() }).from(categories).where(eq(categories.parentId, id));
    if (Number(used) > 0 || Number(children) > 0) {
      await tx.update(categories).set({ isActive: false }).where(eq(categories.id, id));
      await writeAudit(tx, { userId: user.id, action: "category.deactivate", entityType: "category", entityId: id, before, after: { isActive: false } });
      const reason = Number(used) > 0 ? `${used} producto(s) la usan` : `tiene ${children} subcategoría(s)`;
      return { deleted: false, deactivated: true, reason };
    }
    await tx.delete(categories).where(eq(categories.id, id));
    await writeAudit(tx, { userId: user.id, action: "category.delete", entityType: "category", entityId: id, before });
    return { deleted: true, deactivated: false };
  });
}

export async function createBrand(input: BrandInput, user: ActorUser) {
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: brands.id, isActive: brands.isActive })
      .from(brands)
      .where(sql`lower(${brands.name}) = lower(${input.name})`);
    if (dup) {
      if (dup.isActive) throw new AppError("CONFLICT", `La marca "${input.name}" ya existe.`, { fields: { name: "Ya existe" } });
      const [row] = await tx.update(brands).set({ isActive: true, name: input.name }).where(eq(brands.id, dup.id)).returning();
      await writeAudit(tx, { userId: user.id, action: "brand.reactivate", entityType: "brand", entityId: row.id, after: row });
      return row;
    }
    const [row] = await tx.insert(brands).values({ name: input.name }).returning();
    await writeAudit(tx, { userId: user.id, action: "brand.create", entityType: "brand", entityId: row.id, after: row });
    return row;
  });
}

export async function updateBrand(id: string, input: BrandInput & { isActive?: boolean }, user: ActorUser) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(brands).where(eq(brands.id, id));
    if (!before) throw notFound("La marca");
    const [dup] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(sql`lower(${brands.name}) = lower(${input.name})`, ne(brands.id, id)));
    if (dup) throw new AppError("CONFLICT", `La marca "${input.name}" ya existe.`, { fields: { name: "Ya existe" } });
    const [row] = await tx
      .update(brands)
      .set({ name: input.name, isActive: input.isActive ?? before.isActive })
      .where(eq(brands.id, id))
      .returning();
    await writeAudit(tx, { userId: user.id, action: "brand.update", entityType: "brand", entityId: id, before, after: row });
    return row;
  });
}

export async function deleteBrand(id: string, user: ActorUser): Promise<DeleteResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(brands).where(eq(brands.id, id));
    if (!before) throw notFound("La marca");
    const [{ used }] = await tx
      .select({ used: count() })
      .from(products)
      .where(and(eq(products.brandId, id), isNull(products.deletedAt)));
    const [{ usedAny }] = await tx.select({ usedAny: count() }).from(products).where(eq(products.brandId, id));
    if (Number(usedAny) > 0) {
      await tx.update(brands).set({ isActive: false }).where(eq(brands.id, id));
      await writeAudit(tx, { userId: user.id, action: "brand.deactivate", entityType: "brand", entityId: id, before, after: { isActive: false } });
      return { deleted: false, deactivated: true, reason: `${used} producto(s) la usan` };
    }
    await tx.delete(brands).where(eq(brands.id, id));
    await writeAudit(tx, { userId: user.id, action: "brand.delete", entityType: "brand", entityId: id, before });
    return { deleted: true, deactivated: false };
  });
}
