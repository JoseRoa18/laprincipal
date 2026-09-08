import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { documentSeries } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type DocumentType = (typeof documentSeries.$inferSelect)["documentType"];

/**
 * Reserve the next consecutive number for a document type.
 * MUST be called inside the same transaction that persists the document:
 * the UPDATE takes a row lock, so concurrent callers are serialized and a
 * rolled-back transaction never consumes a number (no gaps).
 */
export async function nextDocumentNumber(tx: Tx, type: DocumentType): Promise<string> {
  const [row] = await tx
    .update(documentSeries)
    .set({ nextNumber: sql`${documentSeries.nextNumber} + 1` })
    .where(eq(documentSeries.documentType, type))
    .returning({ prefix: documentSeries.prefix, padding: documentSeries.padding, next: documentSeries.nextNumber });
  if (!row) throw new AppError("INTERNAL", `No existe la serie de documentos "${type}".`);
  const assigned = row.next - 1;
  return `${row.prefix}${String(assigned).padStart(row.padding, "0")}`;
}
