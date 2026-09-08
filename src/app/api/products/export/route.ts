import { NextResponse, type NextRequest } from "next/server";
import { can, getSessionUser } from "@/lib/auth-guards";
import { businessDate } from "@/lib/format";
import { buildProductsWorkbook } from "@/modules/catalog/infrastructure/excel";
import { listProductsForExport, parseListFilter } from "@/modules/catalog/infrastructure/products-list";
import { getDefaultLocation } from "@/modules/core/application/context";

export const dynamic = "force-dynamic";

/** GET /api/products/export?q=&category=&brand=&stock=&active= → Excel with the filtered catalog. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const location = await getDefaultLocation();
  const rows = await listProductsForExport(parseListFilter(params), { warehouseId: location.warehouseId });
  const buffer = await buildProductsWorkbook(rows, { includeCosts: can(user.role, "view_costs") });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="productos-${businessDate()}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
