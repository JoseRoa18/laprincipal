import { and, asc, count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import {
  adjustmentReasons,
  brands,
  categories,
  inventoryMovements,
  priceHistory,
  priceListItems,
  priceLists,
  productBarcodes,
  productCompatibilities,
  productEquivalences,
  productImages,
  productStats,
  productSuppliers,
  products,
  stockLevels,
  stockSettings,
  suppliers,
  taxes,
  units,
  users,
} from "@/db/schema";
import { D } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import type { StockStatus } from "@/modules/inventory/domain/velocity";
import { NEW_BRAND_OPTION, type ProductFormValues } from "../domain/product-schema";
import { getPriceListIds } from "./catalog-options";
import { rowStatus } from "./products-list";

export interface ProductImageView {
  id: string;
  url: string;
  thumbUrl: string;
  originalUrl: string;
  status: "pending" | "processed" | "original_only" | "failed";
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  partNumber: string | null;
  description: string | null;
  warrantyDays: number;
  locationCode: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  costAvgUsd: string;
  costLastUsd: string | null;
  category: { id: string; name: string; parentName: string | null } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; symbol: string; decimals: number };
  tax: { id: string; name: string; rate: string };
  images: ProductImageView[];
  barcodes: Array<{ id: string; code: string; type: "EAN13" | "UPC" | "CODE128" | "INTERNAL"; isPrimary: boolean }>;
  equivalences: Array<{ id: string; code: string; brand: string | null; notes: string | null }>;
  compatibilities: Array<{ id: string; applianceType: string | null; brand: string | null; model: string | null; notes: string | null }>;
  prices: { publicUsd: string | null; techUsd: string | null };
  stock: {
    available: string;
    physical: string;
    reserved: string;
    minStock: string;
    maxStock: string;
    reorderPoint: string;
    mode: "manual" | "auto";
    status: StockStatus;
  };
  stats: {
    velocity: string;
    velocity30: string;
    velocity60: string;
    velocity90: string;
    daysOfCover: string | null;
    abcClass: string | null;
    revenue90Usd: string;
    units90: string;
    lastSaleAt: Date | null;
    suggestedReorderPoint: string;
    suggestedQty: string;
    status: StockStatus;
    computedAt: Date;
  } | null;
  suppliers: Array<{
    supplierId: string;
    name: string;
    supplierCode: string | null;
    lastCostUsd: string | null;
    lastPurchaseAt: Date | null;
    packSize: number;
    isPreferred: boolean;
    leadTimeDays: number;
  }>;
  movements: Array<{
    id: number;
    type: string;
    quantity: string;
    unitCostUsd: string;
    balanceAfter: string;
    referenceType: string | null;
    referenceId: string | null;
    reasonName: string | null;
    userName: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
  movementCount: number;
  priceHistory: Array<{
    id: string;
    listCode: string;
    listName: string;
    oldPriceUsd: string | null;
    newPriceUsd: string;
    changedBy: string | null;
    changedAt: Date;
  }>;
}

export async function getProductDetail(id: string, warehouseId: string, dbx: DbOrTx = db): Promise<ProductDetail | null> {
  const parentCat = alias(categories, "parent_category");
  const [p] = await dbx
    .select({
      product: products,
      categoryName: categories.name,
      parentCategoryName: parentCat.name,
      brandName: brands.name,
      unit: units,
      tax: taxes,
      stockQty: stockLevels.quantity,
      stockReserved: stockLevels.reservedQty,
      settings: stockSettings,
      stats: productStats,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(parentCat, eq(parentCat.id, categories.parentId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(units, eq(units.id, products.unitId))
    .innerJoin(taxes, eq(taxes.id, products.taxId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .leftJoin(stockSettings, and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId)))
    .leftJoin(productStats, eq(productStats.productId, products.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!p) return null;

  const storage = getStorage();
  const lists = await getPriceListIds(dbx);
  const listNames = await dbx.select({ id: priceLists.id, code: priceLists.code, name: priceLists.name }).from(priceLists);

  const images = await dbx.select().from(productImages).where(eq(productImages.productId, id)).orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder));
  const codes = await dbx.select().from(productBarcodes).where(eq(productBarcodes.productId, id)).orderBy(desc(productBarcodes.isPrimary), asc(productBarcodes.createdAt));
  const eqs = await dbx.select().from(productEquivalences).where(eq(productEquivalences.productId, id)).orderBy(asc(productEquivalences.code));
  const compat = await dbx.select().from(productCompatibilities).where(eq(productCompatibilities.productId, id)).orderBy(asc(productCompatibilities.createdAt));
  const prices = await dbx.select().from(priceListItems).where(eq(priceListItems.productId, id));
  const supplierRows = await dbx
    .select({ ps: productSuppliers, supplier: suppliers })
    .from(productSuppliers)
    .innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId))
    .where(eq(productSuppliers.productId, id))
    .orderBy(desc(productSuppliers.isPreferred), asc(suppliers.name));
  const movementRows = await dbx
    .select({ mv: inventoryMovements, reasonName: adjustmentReasons.name, userName: users.name })
    .from(inventoryMovements)
    .leftJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryMovements.reasonId))
    .leftJoin(users, eq(users.id, inventoryMovements.userId))
    .where(eq(inventoryMovements.productId, id))
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(20);
  const [{ movementCount }] = await dbx.select({ movementCount: count() }).from(inventoryMovements).where(eq(inventoryMovements.productId, id));
  const history = await dbx
    .select({ h: priceHistory, userName: users.name })
    .from(priceHistory)
    .leftJoin(users, eq(users.id, priceHistory.changedBy))
    .where(eq(priceHistory.productId, id))
    .orderBy(desc(priceHistory.changedAt))
    .limit(30);

  const physical = D(p.stockQty ?? 0);
  const reserved = D(p.stockReserved ?? 0);
  const available = physical.minus(reserved);
  const settings = p.settings;

  return {
    id: p.product.id,
    sku: p.product.sku,
    name: p.product.name,
    partNumber: p.product.partNumber,
    description: p.product.description,
    warrantyDays: p.product.warrantyDays,
    locationCode: p.product.locationCode,
    isActive: p.product.isActive,
    deletedAt: p.product.deletedAt,
    createdAt: p.product.createdAt,
    updatedAt: p.product.updatedAt,
    costAvgUsd: p.product.costAvgUsd,
    costLastUsd: p.product.costLastUsd,
    category: p.product.categoryId && p.categoryName ? { id: p.product.categoryId, name: p.categoryName, parentName: p.parentCategoryName } : null,
    brand: p.product.brandId && p.brandName ? { id: p.product.brandId, name: p.brandName } : null,
    unit: { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol, decimals: p.unit.decimals },
    tax: { id: p.tax.id, name: p.tax.name, rate: p.tax.rate },
    images: images.map((img) => ({
      id: img.id,
      url: storage.publicUrl("product-photos", img.processedPath ?? img.originalPath),
      thumbUrl: storage.publicUrl("product-photos", img.thumbPath ?? img.processedPath ?? img.originalPath),
      originalUrl: storage.publicUrl("product-photos", img.originalPath),
      status: img.status,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    })),
    barcodes: codes.map((c) => ({ id: c.id, code: c.code, type: c.type, isPrimary: c.isPrimary })),
    equivalences: eqs.map((e) => ({ id: e.id, code: e.code, brand: e.brand, notes: e.notes })),
    compatibilities: compat.map((c) => ({ id: c.id, applianceType: c.applianceType, brand: c.brand, model: c.model, notes: c.notes })),
    prices: {
      publicUsd: prices.find((x) => x.priceListId === lists.publicId)?.priceUsd ?? null,
      techUsd: lists.techId ? (prices.find((x) => x.priceListId === lists.techId)?.priceUsd ?? null) : null,
    },
    stock: {
      available: available.toFixed(3),
      physical: physical.toFixed(3),
      reserved: reserved.toFixed(3),
      minStock: settings?.minStock ?? "0",
      maxStock: settings?.maxStock ?? "0",
      reorderPoint: settings?.reorderPoint ?? "0",
      mode: settings?.mode ?? "manual",
      status: rowStatus({
        statsStatus: p.stats?.status ?? null,
        stockAvailable: available.toFixed(3),
        minStock: settings?.minStock ?? null,
        maxStock: settings?.maxStock ?? null,
        reorderPoint: settings?.reorderPoint ?? null,
      }),
    },
    stats: p.stats
      ? {
          velocity: p.stats.velocity,
          velocity30: p.stats.velocity30,
          velocity60: p.stats.velocity60,
          velocity90: p.stats.velocity90,
          daysOfCover: p.stats.daysOfCover,
          abcClass: p.stats.abcClass,
          revenue90Usd: p.stats.revenue90Usd,
          units90: p.stats.units90,
          lastSaleAt: p.stats.lastSaleAt,
          suggestedReorderPoint: p.stats.suggestedReorderPoint,
          suggestedQty: p.stats.suggestedQty,
          status: p.stats.status,
          computedAt: p.stats.computedAt,
        }
      : null,
    suppliers: supplierRows.map((s) => ({
      supplierId: s.supplier.id,
      name: s.supplier.name,
      supplierCode: s.ps.supplierCode,
      lastCostUsd: s.ps.lastCostUsd,
      lastPurchaseAt: s.ps.lastPurchaseAt,
      packSize: s.ps.packSize,
      isPreferred: s.ps.isPreferred,
      leadTimeDays: s.supplier.leadTimeDays,
    })),
    movements: movementRows.map((m) => ({
      id: m.mv.id,
      type: m.mv.type,
      quantity: m.mv.quantity,
      unitCostUsd: m.mv.unitCostUsd,
      balanceAfter: m.mv.balanceAfter,
      referenceType: m.mv.referenceType,
      referenceId: m.mv.referenceId,
      reasonName: m.reasonName,
      userName: m.userName,
      notes: m.mv.notes,
      createdAt: m.mv.createdAt,
    })),
    movementCount: Number(movementCount),
    priceHistory: history.map((h) => {
      const list = listNames.find((l) => l.id === h.h.priceListId);
      return {
        id: h.h.id,
        listCode: list?.code ?? "?",
        listName: list?.name ?? "?",
        oldPriceUsd: h.h.oldPriceUsd,
        newPriceUsd: h.h.newPriceUsd,
        changedBy: h.userName,
        changedAt: h.h.changedAt,
      };
    }),
  };
}

/** "12.5000" → "12,50"; "3.000" → "3". Blank for null. */
export function toFormNumber(value: string | null | undefined, decimals: number): string {
  if (value === null || value === undefined || value === "") return "";
  const d = D(value);
  if (d.isZero()) return decimals === 0 ? "0" : "";
  const fixed = d.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed.replace(".", ",");
}

export interface ProductFormData {
  id: string;
  sku: string;
  name: string;
  values: ProductFormValues;
  primaryBarcode: string | null;
}

/** Values to pre-fill the edit form. */
export async function getProductFormData(id: string, warehouseId: string, dbx: DbOrTx = db): Promise<ProductFormData | null> {
  const detail = await getProductDetail(id, warehouseId, dbx);
  if (!detail || detail.deletedAt) return null;
  return {
    id: detail.id,
    sku: detail.sku,
    name: detail.name,
    primaryBarcode: detail.barcodes.find((b) => b.isPrimary)?.code ?? detail.barcodes[0]?.code ?? null,
    values: {
      name: detail.name,
      sku: detail.sku,
      partNumber: detail.partNumber ?? "",
      description: detail.description ?? "",
      categoryId: detail.category?.id ?? "",
      brandId: detail.brand?.id ?? "",
      newBrandName: "",
      unitId: detail.unit.id,
      taxId: detail.tax.id,
      warrantyDays: detail.warrantyDays ? String(detail.warrantyDays) : "",
      locationCode: detail.locationCode ?? "",
      isActive: detail.isActive,
      publicPriceUsd: toFormNumber(detail.prices.publicUsd, 2),
      techPriceUsd: toFormNumber(detail.prices.techUsd, 2),
      costUsd: toFormNumber(detail.costLastUsd ?? detail.costAvgUsd, 2),
      initialStock: "",
      minStock: toFormNumber(detail.stock.minStock, 3),
      maxStock: toFormNumber(detail.stock.maxStock, 3),
      barcode: "",
      generateInternalBarcode: false,
      equivalences: detail.equivalences.map((e) => ({ code: e.code, brand: e.brand ?? "" })),
      compatibilities: detail.compatibilities.map((c) => ({ applianceType: c.applianceType ?? "", brand: c.brand ?? "", model: c.model ?? "" })),
    },
  };
}

export { NEW_BRAND_OPTION };
