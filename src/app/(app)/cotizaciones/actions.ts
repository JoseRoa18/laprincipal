"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { cancelQuote } from "@/modules/sales/application/quotes";
import { shareQuoteDocument } from "@/modules/sales/application/share-document";

export async function cancelQuoteAction(quoteId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const id = parseInput(z.uuid(), quoteId);
    await cancelQuote(db, id, { userId: user.id });
    revalidatePath("/cotizaciones");
    revalidatePath(`/cotizaciones/${id}`);
  });
}

export async function shareQuoteWhatsAppAction(quoteId: string) {
  return runAction(async () => {
    await assertRole("admin", "seller");
    const id = parseInput(z.uuid(), quoteId);
    return shareQuoteDocument(id);
  });
}
