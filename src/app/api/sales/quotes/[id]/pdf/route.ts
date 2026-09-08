import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { renderQuotePdf } from "@/modules/sales/infrastructure/pdf/documents";
import { getQuoteDetail } from "@/modules/sales/infrastructure/quotes-queries";
import { getCompanySettings, getPrintingSettings } from "@/modules/settings/infrastructure/settings";

/** Quote (A4 PDF), rendered on demand. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Id inválido", { status: 400 });
  const quote = await getQuoteDetail(id);
  if (!quote) return new NextResponse("No encontrada", { status: 404 });
  const [company, printing] = await Promise.all([getCompanySettings(), getPrintingSettings()]);
  const pdf = await renderQuotePdf(quote, company, printing);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="cotizacion-${(quote.number ?? "cotizacion").replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
