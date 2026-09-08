import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { renderSalePdf } from "@/modules/sales/infrastructure/pdf/documents";
import { getSaleDetail } from "@/modules/sales/infrastructure/sales-queries";
import { getCompanySettings, getPrintingSettings } from "@/modules/settings/infrastructure/settings";

/** Delivery note (A4 PDF) for a sale, rendered on demand. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Id inválido", { status: 400 });
  const sale = await getSaleDetail(id);
  if (!sale || sale.status === "held") return new NextResponse("No encontrada", { status: 404 });
  const [company, printing] = await Promise.all([getCompanySettings(), getPrintingSettings()]);
  const pdf = await renderSalePdf(sale, company, printing);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="nota-${(sale.number ?? "venta").replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
