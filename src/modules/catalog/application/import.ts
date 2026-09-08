import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/db/client";
import { importJobs, inventoryMovements, productBarcodes, products, users } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { applyMovement, lockStock } from "@/modules/inventory/application/stock";
import { validateImportRows, type ImportColumnKey, type ImportLookups, type ImportRowResult } from "../domain/import-rows";
import { getInitialStockReasonId, getProductFormOptions, listBrands, listCategoryOptions } from "../infrastructure/catalog-options";
import { parseImportWorkbook } from "../infrastructure/excel";
import { lockCatalogSequences, type ActorUser } from "./catalog-shared";
import { createProductInTx } from "./products";

export const IMPORT_BUCKET = "documents" as const;
const MAX_ERRORS_STORED = 500;

export interface ImportPreviewRow {
  rowNumber: number;
  values: Partial<Record<ImportColumnKey, string>>;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  jobId: string;
  fileName: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  unknownHeaders: string[];
  rows: ImportPreviewRow[];
}

async function buildLookups(dbx: DbOrTx): Promise<ImportLookups> {
  const [options, categories, brands, skus, codes] = await Promise.all([
    getProductFormOptions(dbx),
    listCategoryOptions(dbx, { includeInactive: false }),
    listBrands(dbx, { includeInactive: true }),
    dbx.select({ sku: products.sku }).from(products),
    dbx.select({ code: productBarcodes.code }).from(productBarcodes),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId })),
    units: options.units,
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    existingSkus: new Set(skus.map((s) => s.sku.toUpperCase())),
    existingBarcodes: new Set(codes.map((c) => c.code)),
    defaultUnitId: options.defaultUnitId,
    defaultTaxId: options.defaultTaxId,
  };
}

async function validateBuffer(buffer: Buffer, dbx: DbOrTx) {
  const parsed = await parseImportWorkbook(buffer);
  if (parsed.missingRequired.length > 0) {
    throw new AppError("VALIDATION", `El archivo no tiene las columnas obligatorias: ${parsed.missingRequired.join(", ")}. Descarga la plantilla y úsala como base.`);
  }
  if (parsed.rows.length === 0) throw new AppError("VALIDATION", "El archivo no tiene filas con datos debajo del encabezado.");
  const lookups = await buildLookups(dbx);
  const results = validateImportRows(parsed.rows, lookups);
  return { parsed, results };
}

function summarize(results: ImportRowResult[]) {
  const okRows = results.filter((r) => r.errors.length === 0).length;
  return { totalRows: results.length, okRows, errorRows: results.length - okRows };
}

/** Parse and validate an uploaded workbook; stores the file and creates an import job in "ready" state. */
export async function validateImportFile(buffer: Buffer, fileName: string, user: ActorUser): Promise<ImportPreview> {
  const { parsed, results } = await validateBuffer(buffer, db);
  const counts = summarize(results);
  const errors = results.filter((r) => r.errors.length > 0).slice(0, MAX_ERRORS_STORED).map((r) => ({ row: r.rowNumber, errors: r.errors }));

  const [job] = await db
    .insert(importJobs)
    .values({ type: "products", filePath: "", status: "ready", ...counts, errors, createdBy: user.id })
    .returning({ id: importJobs.id });
  const filePath = `imports/${job.id}.xlsx`;
  await getStorage().put({ bucket: IMPORT_BUCKET, path: filePath, data: buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await db.update(importJobs).set({ filePath }).where(eq(importJobs.id, job.id));

  return {
    jobId: job.id,
    fileName,
    ...counts,
    unknownHeaders: parsed.unknownHeaders,
    rows: results.map((r) => {
      const raw = parsed.rows.find((x) => x.rowNumber === r.rowNumber);
      return { rowNumber: r.rowNumber, values: raw?.values ?? {}, errors: r.errors, warnings: r.warnings };
    }),
  };
}

export interface ApplyImportResult {
  jobId: string;
  created: number;
  skipped: number;
}

/** Import every valid row of a ready job in one transaction. Rows with errors are skipped. */
export async function applyImport(jobId: string, user: ActorUser): Promise<ApplyImportResult> {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
  if (!job) throw notFound("La importación");
  if (job.status !== "ready") throw new AppError("INVALID_STATE", "Esta importación ya fue aplicada o cancelada.");
  const file = await getStorage().get(IMPORT_BUCKET, job.filePath);
  if (!file) throw new AppError("NOT_FOUND", "No se encontró el archivo de la importación. Súbelo de nuevo.");

  const location = await getDefaultLocation();
  return db.transaction(async (tx) => {
    await lockCatalogSequences(tx);
    // Re-validate against the current catalog: things may have changed since the preview.
    const { results } = await validateBuffer(file.data, tx);
    const valid = results.filter((r) => r.input);
    const createdIds: string[] = [];
    for (const row of valid) {
      try {
        const created = await createProductInTx(tx, row.input!, user, location.warehouseId);
        createdIds.push(created.id);
      } catch (err) {
        const message = err instanceof AppError ? err.message : "error inesperado";
        throw new AppError("VALIDATION", `Fila ${row.rowNumber} (${row.name || "sin nombre"}): ${message} No se importó ninguna fila.`);
      }
    }
    const counts = summarize(results);
    const errors = results.filter((r) => r.errors.length > 0).slice(0, MAX_ERRORS_STORED).map((r) => ({ row: r.rowNumber, errors: r.errors }));
    await tx
      .update(importJobs)
      .set({ status: "applied", ...counts, errors, createdIds, appliedAt: new Date() })
      .where(eq(importJobs.id, jobId));
    await writeAudit(tx, { userId: user.id, action: "import.apply", entityType: "import_job", entityId: jobId, after: { created: createdIds.length, skipped: counts.errorRows } });
    return { jobId, created: createdIds.length, skipped: counts.errorRows };
  });
}

export interface UndoImportResult {
  jobId: string;
  undone: number;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

/**
 * Undo an applied import. The kardex is append-only, so a product that received initial
 * stock gets a compensating `adjust_out` movement and is then soft-deleted. Products with
 * any other movement (sales, purchases, adjustments) are left untouched and reported.
 */
export async function undoImport(jobId: string, user: ActorUser): Promise<UndoImportResult> {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
  if (!job) throw notFound("La importación");
  if (job.status !== "applied") throw new AppError("INVALID_STATE", "Solo se puede deshacer una importación aplicada.");
  const ids = (job.createdIds as string[]) ?? [];
  const location = await getDefaultLocation();

  return db.transaction(async (tx: Tx) => {
    const skipped: UndoImportResult["skipped"] = [];
    let undone = 0;
    const reasonId = await getInitialStockReasonId(tx);
    const rows = ids.length
      ? await tx
          .select({ id: products.id, name: products.name, costAvgUsd: products.costAvgUsd })
          .from(products)
          .where(inArray(products.id, ids))
      : [];
    for (const p of rows) {
      const [alreadyDeleted] = await tx.select({ deletedAt: products.deletedAt }).from(products).where(eq(products.id, p.id));
      if (alreadyDeleted?.deletedAt) continue;
      const movements = await tx
        .select({ type: inventoryMovements.type })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.productId, p.id));
      const foreign = movements.filter((m) => m.type !== "initial");
      if (foreign.length > 0) {
        skipped.push({ id: p.id, name: p.name, reason: `Tiene ${foreign.length} movimiento(s) de inventario posteriores` });
        continue;
      }
      const locked = await lockStock(tx, [p.id], location.warehouseId);
      const stock = locked.get(p.id)?.quantity ?? D(0);
      if (stock.gt(0)) {
        await applyMovement(tx, {
          productId: p.id,
          warehouseId: location.warehouseId,
          type: "adjust_out",
          quantity: stock.neg(),
          unitCostUsd: p.costAvgUsd,
          reasonId,
          referenceType: "import_job",
          referenceId: jobId,
          userId: user.id,
          notes: "Deshacer importación",
        });
      }
      await tx.update(products).set({ deletedAt: new Date(), isActive: false }).where(eq(products.id, p.id));
      // Free manufacturer codes; internal codes stay so the sequence never re-issues a printed label.
      await tx.delete(productBarcodes).where(and(eq(productBarcodes.productId, p.id), ne(productBarcodes.type, "INTERNAL")));
      undone++;
    }
    await tx.update(importJobs).set({ status: "undone" }).where(eq(importJobs.id, jobId));
    await writeAudit(tx, { userId: user.id, action: "import.undo", entityType: "import_job", entityId: jobId, after: { undone, skipped } });
    return { jobId, undone, skipped };
  });
}

export interface ImportJobView {
  id: string;
  status: "validating" | "ready" | "applied" | "failed" | "undone";
  totalRows: number;
  okRows: number;
  errorRows: number;
  createdCount: number;
  createdBy: string | null;
  createdAt: Date;
  appliedAt: Date | null;
}

export async function listImportJobs(limit = 10, dbx: DbOrTx = db): Promise<ImportJobView[]> {
  const rows = await dbx
    .select({ job: importJobs, userName: users.name })
    .from(importJobs)
    .leftJoin(users, eq(users.id, importJobs.createdBy))
    .where(eq(importJobs.type, "products"))
    .orderBy(desc(importJobs.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.job.id,
    status: r.job.status,
    totalRows: r.job.totalRows,
    okRows: r.job.okRows,
    errorRows: r.job.errorRows,
    createdCount: Array.isArray(r.job.createdIds) ? (r.job.createdIds as string[]).length : 0,
    createdBy: r.userName,
    createdAt: r.job.createdAt,
    appliedAt: r.job.appliedAt,
  }));
}

/** Products still present (not deleted) among those created by a job, for the undo confirmation. */
export async function countUndoableProducts(jobId: string, dbx: DbOrTx = db): Promise<number> {
  const [job] = await dbx.select({ createdIds: importJobs.createdIds }).from(importJobs).where(eq(importJobs.id, jobId));
  const ids = (job?.createdIds as string[] | undefined) ?? [];
  if (ids.length === 0) return 0;
  const [{ total }] = await dbx
    .select({ total: count() })
    .from(products)
    .where(and(inArray(products.id, ids), isNull(products.deletedAt)));
  return Number(total);
}
