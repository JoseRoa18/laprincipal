import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { categories } from "@/db/schema";

export interface CategoryOption {
  id: string;
  /** "Refrigeración › Compresores" for subcategories. */
  label: string;
}

/** Active categories for filter selects, with the parent name as prefix. */
export async function listCategoryOptions(dbx: DbOrTx = db): Promise<CategoryOption[]> {
  const parent = alias(categories, "parent");
  const rows = await dbx
    .select({ id: categories.id, name: categories.name, parentName: parent.name })
    .from(categories)
    .leftJoin(parent, eq(parent.id, categories.parentId))
    .where(eq(categories.isActive, true))
    .orderBy(asc(parent.name), asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({ id: r.id, label: r.parentName ? `${r.parentName} › ${r.name}` : r.name }));
}
