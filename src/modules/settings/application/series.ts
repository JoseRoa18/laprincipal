import { and, eq, ne } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { documentSeries } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import {
  DOCUMENT_TYPE_LABEL,
  documentSeriesInputSchema,
  type DocumentSeriesData,
  type DocumentSeriesInput,
} from "../domain/catalog-forms";

export { documentSeriesInputSchema };
export type { DocumentSeriesData, DocumentSeriesInput };

export type DocumentSeriesRow = typeof documentSeries.$inferSelect;

/**
 * Update prefix, padding and next number of a series. The row is locked
 * (FOR UPDATE) so a concurrent nextDocumentNumber() waits for this change.
 * The next number can only move forward, and moving it requires `confirm`
 * because the skipped numbers are never used.
 */
export async function updateDocumentSeries(id: string, input: DocumentSeriesData, userId: string, dbx: Db = db): Promise<DocumentSeriesRow> {
  return dbx.transaction(async (tx) => {
    const [before] = await tx.select().from(documentSeries).where(eq(documentSeries.id, id)).for("update");
    if (!before) throw new AppError("NOT_FOUND", "La serie no existe.");

    if (input.nextNumber < before.nextNumber) {
      const message = `El próximo número no puede bajar: la serie ya va por el ${before.nextNumber}.`;
      throw new AppError("VALIDATION", message, { fields: { nextNumber: message } });
    }
    if (input.nextNumber > before.nextNumber && !input.confirm) {
      const message = "Confirma el salto de numeración para continuar.";
      throw new AppError("VALIDATION", message, { fields: { nextNumber: message }, requiresConfirm: true });
    }

    const [clash] = await tx
      .select({ documentType: documentSeries.documentType })
      .from(documentSeries)
      .where(and(eq(documentSeries.prefix, input.prefix), ne(documentSeries.id, id)))
      .limit(1);
    if (clash) {
      const message = `El prefijo "${input.prefix}" ya lo usa la serie de ${DOCUMENT_TYPE_LABEL[clash.documentType].toLowerCase()}.`;
      throw new AppError("CONFLICT", message, { fields: { prefix: message } });
    }

    const [row] = await tx
      .update(documentSeries)
      .set({ prefix: input.prefix, padding: input.padding, nextNumber: input.nextNumber })
      .where(eq(documentSeries.id, id))
      .returning();
    await writeAudit(tx, { userId, action: "document_series.update", entityType: "document_series", entityId: id, before, after: row });
    return row;
  });
}
