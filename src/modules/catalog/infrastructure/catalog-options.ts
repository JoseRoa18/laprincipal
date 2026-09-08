import { asc, count, eq, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { adjustmentReasons, brands, categories, priceLists, products, taxes, units } from "@/db/schema";
import { getSetting } from "@/modules/settings/infrastructure/settings";

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  /** "Refrigeración > Compresores" */
  label: string;
  depth: number;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryNode extends CategoryOption {
  productCount: number;
  children: CategoryNode[];
}

type CategoryRow = typeof categories.$inferSelect;

function walk(rows: CategoryRow[], parent: CategoryRow | null, parentLabel: string, depth: number, out: CategoryOption[]) {
  const parentId = parent?.id ?? null;
  const children = rows
    .filter((r) => r.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
  for (const child of children) {
    const label = parentLabel ? `${parentLabel} > ${child.name}` : child.name;
    out.push({
      id: child.id,
      name: child.name,
      parentId,
      parentName: parent?.name ?? null,
      label,
      depth,
      sortOrder: child.sortOrder,
      isActive: child.isActive,
    });
    if (depth < 4) walk(rows, child, label, depth + 1, out);
  }
}

/** Flat, depth-first list of categories with their full path label. */
export async function listCategoryOptions(dbx: DbOrTx = db, opts: { includeInactive?: boolean } = {}): Promise<CategoryOption[]> {
  const rows = await dbx.select().from(categories);
  const usable = opts.includeInactive ? rows : rows.filter((r) => r.isActive);
  const out: CategoryOption[] = [];
  walk(usable, null, "", 0, out);
  return out;
}

/** Tree with product counts, for the management screen (includes inactive). */
export async function listCategoryTree(dbx: DbOrTx = db): Promise<CategoryNode[]> {
  const options = await listCategoryOptions(dbx, { includeInactive: true });
  const counts = await dbx
    .select({ categoryId: products.categoryId, total: count() })
    .from(products)
    .where(isNull(products.deletedAt))
    .groupBy(products.categoryId);
  const countById = new Map(counts.map((c) => [c.categoryId, Number(c.total)]));
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const o of options) {
    const node: CategoryNode = { ...o, productCount: countById.get(o.id) ?? 0, children: [] };
    nodes.set(o.id, node);
    if (o.parentId && nodes.has(o.parentId)) nodes.get(o.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** The category plus every descendant id (for list filters). */
export function categoryWithDescendants(options: CategoryOption[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const o of options) if (o.parentId === out[i]) out.push(o.id);
  }
  return out;
}

export interface BrandOption {
  id: string;
  name: string;
  isActive: boolean;
  productCount?: number;
}

export async function listBrands(dbx: DbOrTx = db, opts: { includeInactive?: boolean; withCounts?: boolean } = {}): Promise<BrandOption[]> {
  const rows = await dbx
    .select({
      id: brands.id,
      name: brands.name,
      isActive: brands.isActive,
      productCount: opts.withCounts
        ? sql<number>`(select count(*) from ${products} where ${products.brandId} = ${brands.id} and ${products.deletedAt} is null)`
        : sql<number>`0`,
    })
    .from(brands)
    .orderBy(asc(brands.name));
  return rows
    .filter((r) => opts.includeInactive || r.isActive)
    .map((r) => ({ ...r, productCount: Number(r.productCount) }));
}

export async function listUnits(dbx: DbOrTx = db) {
  return dbx.select().from(units).orderBy(asc(units.name));
}

export async function listTaxes(dbx: DbOrTx = db) {
  return dbx.select().from(taxes).where(eq(taxes.isActive, true)).orderBy(asc(taxes.name));
}

export interface PriceListIds {
  publicId: string;
  techId: string | null;
}

/** PUBLIC (default) and TECH price lists. */
export async function getPriceListIds(dbx: DbOrTx = db): Promise<PriceListIds> {
  const lists = await dbx.select({ id: priceLists.id, code: priceLists.code, isDefault: priceLists.isDefault }).from(priceLists);
  const pub = lists.find((l) => l.code === "PUBLIC") ?? lists.find((l) => l.isDefault) ?? lists[0];
  if (!pub) throw new Error("No hay listas de precios. Ejecuta la semilla de datos.");
  const tech = lists.find((l) => l.code === "TECH") ?? null;
  return { publicId: pub.id, techId: tech?.id ?? null };
}

/** Adjustment reason used for initial stock; falls back to any reason that allows increases. */
export async function getInitialStockReasonId(dbx: DbOrTx = db): Promise<string | null> {
  const [exact] = await dbx.select({ id: adjustmentReasons.id }).from(adjustmentReasons).where(eq(adjustmentReasons.name, "Inventario inicial")).limit(1);
  if (exact) return exact.id;
  const [any] = await dbx
    .select({ id: adjustmentReasons.id })
    .from(adjustmentReasons)
    .where(eq(adjustmentReasons.isActive, true))
    .orderBy(asc(adjustmentReasons.sortOrder))
    .limit(1);
  return any?.id ?? null;
}

export interface ProductFormOptions {
  categories: CategoryOption[];
  brands: BrandOption[];
  units: Array<{ id: string; name: string; symbol: string; decimals: number }>;
  taxes: Array<{ id: string; name: string; rate: string; isDefault: boolean }>;
  defaultUnitId: string;
  defaultTaxId: string;
  techPriceMarkdownPct: number;
}

/** Everything the product form needs to render its selects. */
export async function getProductFormOptions(dbx: DbOrTx = db): Promise<ProductFormOptions> {
  const [cats, brandRows, unitRows, taxRows, policies] = await Promise.all([
    listCategoryOptions(dbx),
    listBrands(dbx),
    listUnits(dbx),
    listTaxes(dbx),
    getSetting("policies", dbx),
  ]);
  const defaultUnit = unitRows.find((u) => u.name.toLowerCase() === "unidad") ?? unitRows[0];
  const defaultTax = taxRows.find((t) => t.isDefault) ?? taxRows[0];
  if (!defaultUnit || !defaultTax) throw new Error("Faltan unidades o impuestos. Ejecuta la semilla de datos.");
  return {
    categories: cats,
    brands: brandRows,
    units: unitRows.map((u) => ({ id: u.id, name: u.name, symbol: u.symbol, decimals: u.decimals })),
    taxes: taxRows.map((t) => ({ id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault })),
    defaultUnitId: defaultUnit.id,
    defaultTaxId: defaultTax.id,
    techPriceMarkdownPct: policies.techPriceMarkdownPct,
  };
}
