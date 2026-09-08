"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { documentSeriesInputSchema, updateDocumentSeries } from "@/modules/settings/application/series";

const PATH = "/configuracion/series";
const idSchema = z.uuid("Serie inválida");

export async function updateDocumentSeriesAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const seriesId = parseInput(idSchema, id);
    const data = parseInput(documentSeriesInputSchema, input);
    const row = await updateDocumentSeries(seriesId, data, user.id);
    revalidatePath(PATH);
    return { id: row.id, nextNumber: row.nextNumber };
  });
}
