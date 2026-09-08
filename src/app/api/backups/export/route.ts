import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-guards";
import { buildExcel, isExportType, XLSX_CONTENT_TYPE } from "@/modules/settings/application/export-excel";

/**
 * Excel export for admins: /api/backups/export?type=products|customers|sales.
 * Linked from /configuracion/respaldos with a plain <a download>.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "No tienes permiso para esta acción." }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type");
  if (!isExportType(type)) {
    return NextResponse.json({ error: "Tipo de exportación inválido. Usa products, customers o sales." }, { status: 400 });
  }

  const { buffer, filename } = await buildExcel(type);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": XLSX_CONTENT_TYPE,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
