import { desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { backups, users } from "@/db/schema";
import { APP_LOCALE } from "@/lib/format";

export type BackupKind = (typeof backups.$inferSelect)["kind"];

export const BACKUP_KIND_LABEL: Record<BackupKind, string> = {
  manual: "Manual",
  scheduled: "Programado",
};

export interface BackupListRow {
  id: string;
  kind: BackupKind;
  sizeBytes: number;
  filePath: string;
  createdAt: Date;
  /** Null for scheduled backups (no user). */
  createdByName: string | null;
}

/** Latest backups first, with the name of the user who created them. */
export async function listBackups(limit = 50, dbx: DbOrTx = db): Promise<BackupListRow[]> {
  return dbx
    .select({
      id: backups.id,
      kind: backups.kind,
      sizeBytes: backups.sizeBytes,
      filePath: backups.filePath,
      createdAt: backups.createdAt,
      createdByName: users.name,
    })
    .from(backups)
    .leftJoin(users, eq(backups.createdBy, users.id))
    .orderBy(desc(backups.createdAt))
    .limit(limit);
}

/** "850 B", "12 KB", "1,2 MB" in the app locale. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  return `${formatted} ${units[unit]}`;
}
