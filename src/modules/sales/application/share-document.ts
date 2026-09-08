import { AppError, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { getCompanySettings, getPrintingSettings } from "@/modules/settings/infrastructure/settings";
import { renderQuotePdf, renderSalePdf } from "../infrastructure/pdf/documents";
import { getQuoteDetail } from "../infrastructure/quotes-queries";
import { getSaleDetail } from "../infrastructure/sales-queries";
import { formatDateOnly, whatsappPhone } from "./labels";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export interface SharedDocument {
  /** Signed URL to the PDF in the private `documents` bucket (7 days). */
  url: string;
  /** wa.me link with the message and the URL, addressed to the customer when a phone is known. */
  waLink: string;
}

function safeName(value: string | null, fallback: string): string {
  return (value ?? fallback).replace(/[^A-Za-z0-9-]/g, "") || fallback;
}

function waLink(phone: string | null | undefined, text: string): string {
  const digits = whatsappPhone(phone);
  return `https://wa.me/${digits ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Render the delivery note, store it and build the WhatsApp link. */
export async function shareSaleDocument(saleId: string): Promise<SharedDocument> {
  const sale = await getSaleDetail(saleId);
  if (!sale) throw notFound("La venta");
  if (sale.status === "held") throw new AppError("INVALID_STATE", "Una venta en espera no tiene nota de entrega.");
  const [company, printing] = await Promise.all([getCompanySettings(), getPrintingSettings()]);
  const pdf = await renderSalePdf(sale, company, printing);
  const path = `sales/${sale.id}/nota-${safeName(sale.number, "venta")}.pdf`;
  const storage = getStorage();
  await storage.put({ bucket: "documents", path, data: pdf, contentType: "application/pdf" });
  const url = await storage.signedUrl("documents", path, SEVEN_DAYS);
  const bs = D(sale.rateVes).gt(0) ? ` (${formatMoney(D(sale.totalUsd).mul(sale.rateVes), "VES")})` : "";
  const text = `${company.name}\nNota de entrega ${sale.number ?? ""}\nTotal: ${formatMoney(sale.totalUsd, "USD")}${bs}\n${url}`;
  return { url, waLink: waLink(sale.customer?.phone, text) };
}

export async function shareQuoteDocument(quoteId: string): Promise<SharedDocument> {
  const quote = await getQuoteDetail(quoteId);
  if (!quote) throw notFound("La cotización");
  const [company, printing] = await Promise.all([getCompanySettings(), getPrintingSettings()]);
  const pdf = await renderQuotePdf(quote, company, printing);
  const path = `quotes/${quote.id}/cotizacion-${safeName(quote.number, "cotizacion")}.pdf`;
  const storage = getStorage();
  await storage.put({ bucket: "documents", path, data: pdf, contentType: "application/pdf" });
  const url = await storage.signedUrl("documents", path, SEVEN_DAYS);
  const bs = D(quote.rateVes).gt(0) ? ` (${formatMoney(D(quote.totalUsd).mul(quote.rateVes), "VES")})` : "";
  const text = `${company.name}\nCotización ${quote.number ?? ""} válida hasta ${formatDateOnly(quote.validUntil)}\nTotal: ${formatMoney(quote.totalUsd, "USD")}${bs}\n${url}`;
  return { url, waLink: waLink(quote.customer?.phone, text) };
}
