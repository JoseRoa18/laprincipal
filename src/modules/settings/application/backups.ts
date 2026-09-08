import { format } from "date-fns";
import { eq, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, type Db } from "@/db/client";
import {
  adjustmentReasons,
  backups,
  branches,
  brands,
  cashMovements,
  cashRegisters,
  cashSessionBalances,
  cashSessions,
  categories,
  currencies,
  customers,
  documentSeries,
  exchangeRates,
  importJobs,
  inventoryAdjustmentItems,
  inventoryAdjustments,
  inventoryMovements,
  paymentMethods,
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
  purchaseReceiptItems,
  purchaseReceipts,
  quoteItems,
  quotes,
  saleItems,
  salePayments,
  saleReturnItems,
  saleReturns,
  sales,
  settings,
  stockCountItems,
  stockCounts,
  stockLevels,
  stockSettings,
  suppliers,
  taxes,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { toTz } from "@/lib/format";
import { getStorage } from "@/lib/storage";
import { writeAudit } from "@/modules/core/application/audit";
import type { BackupKind } from "../infrastructure/backups";

export const BACKUP_VERSION = 1;
export const BACKUP_BUCKET = "documents" as const;
/** Download links stay valid this long. */
export const BACKUP_URL_TTL_SECONDS = 600;

/**
 * Every table with business data, parents before children so a restore can
 * replay the file in order. `audit_logs` is left out on purpose: it is an
 * append-only log that grows far faster than the rest of the data.
 */
const BACKUP_TABLES: PgTable[] = [
  branches,
  warehouses,
  users,
  currencies,
  exchangeRates,
  settings,
  documentSeries,
  categories,
  brands,
  units,
  taxes,
  products,
  productEquivalences,
  productCompatibilities,
  productBarcodes,
  productImages,
  suppliers,
  productSuppliers,
  priceLists,
  priceListItems,
  priceHistory,
  stockLevels,
  stockSettings,
  adjustmentReasons,
  inventoryMovements,
  inventoryAdjustments,
  inventoryAdjustmentItems,
  stockCounts,
  stockCountItems,
  productStats,
  purchaseReceipts,
  purchaseReceiptItems,
  customers,
  paymentMethods,
  cashRegisters,
  cashSessions,
  cashSessionBalances,
  cashMovements,
  quotes,
  quoteItems,
  sales,
  saleItems,
  salePayments,
  saleReturns,
  saleReturnItems,
  importJobs,
  backups,
];

/** Never written to a backup file. */
const SECRET_COLUMNS = new Set(["passwordHash", "pinHash"]);

export interface BackupDocument {
  version: number;
  createdAt: string;
  kind: BackupKind;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface CreateBackupInput {
  kind: BackupKind;
  /** Null for scheduled backups. */
  userId: string | null;
}

export interface CreateBackupResult {
  id: string;
  filePath: string;
  sizeBytes: number;
  /** Row count per table, keyed by table name. */
  tables: Record<string, number>;
}

function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !SECRET_COLUMNS.has(key)));
}

/** Reads every table inside one repeatable-read transaction so the snapshot is consistent. */
async function snapshotTables(dbx: Db): Promise<BackupDocument["tables"]> {
  return dbx.transaction(
    async (tx) => {
      const out: BackupDocument["tables"] = {};
      for (const table of BACKUP_TABLES) {
        const name = getTableName(table);
        const rows = (await tx.select().from(table)) as Record<string, unknown>[];
        out[name] = name === "users" ? rows.map(stripSecrets) : rows;
      }
      return out;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** "backups/2026-09-08-1530.json"; adds "-2", "-3"... if that name is already taken. */
async function uniqueFilePath(dbx: Db, now: Date): Promise<string> {
  const stamp = format(toTz(now), "yyyy-MM-dd-HHmm");
  for (let n = 1; ; n++) {
    const candidate = `backups/${stamp}${n === 1 ? "" : `-${n}`}.json`;
    const [taken] = await dbx.select({ id: backups.id }).from(backups).where(eq(backups.filePath, candidate)).limit(1);
    if (!taken) return candidate;
  }
}

/**
 * Dumps every business table to one JSON file in the private `documents`
 * bucket and records it in `backups`. Used by the manual button and the
 * weekly cron.
 */
export async function createBackup({ kind, userId }: CreateBackupInput, dbx: Db = db): Promise<CreateBackupResult> {
  const now = new Date();
  const tables = await snapshotTables(dbx);
  const doc: BackupDocument = { version: BACKUP_VERSION, createdAt: now.toISOString(), kind, tables };
  const json = JSON.stringify(doc);
  const data = Buffer.from(json, "utf8");
  const sizeBytes = data.byteLength;

  const filePath = await uniqueFilePath(dbx, now);
  await getStorage().put({ bucket: BACKUP_BUCKET, path: filePath, data, contentType: "application/json" });

  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  const row = await dbx.transaction(async (tx) => {
    const [inserted] = await tx.insert(backups).values({ filePath, sizeBytes, kind, createdBy: userId }).returning();
    await writeAudit(tx, {
      userId,
      action: "backup.create",
      entityType: "backup",
      entityId: inserted.id,
      after: { filePath, sizeBytes, kind, tables: counts },
    });
    return inserted;
  });

  return { id: row.id, filePath, sizeBytes, tables: counts };
}

/** Time-limited download link for a backup file (10 minutes). */
export async function getBackupDownloadUrl(filePath: string): Promise<string> {
  return getStorage().signedUrl(BACKUP_BUCKET, filePath, BACKUP_URL_TTL_SECONDS);
}
