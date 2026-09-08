import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth-guards";
import { listCategoryOptions, listUnits } from "@/modules/catalog/infrastructure/catalog-options";
import { buildImportTemplate } from "@/modules/catalog/infrastructure/excel";

export const dynamic = "force-dynamic";

/** GET /api/products/import/template → empty Excel template with help and reference lists. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "manage_products")) return new NextResponse("Forbidden", { status: 403 });
  const [categories, units] = await Promise.all([listCategoryOptions(), listUnits()]);
  const buffer = await buildImportTemplate({ categoryPaths: categories.map((c) => c.label), units: units.map((u) => ({ name: u.name, symbol: u.symbol })) });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="plantilla-productos.xlsx"',
      "cache-control": "no-store",
    },
  });
}
