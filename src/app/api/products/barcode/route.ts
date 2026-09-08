import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-guards";
import { isValidBarcodeText, normalizeBarcode, type BarcodeType } from "@/modules/catalog/domain/barcodes";
import { barcodePng } from "@/modules/catalog/infrastructure/barcode-image";

export const dynamic = "force-dynamic";

const TYPES: BarcodeType[] = ["EAN13", "UPC", "CODE128", "INTERNAL"];

/** GET /api/products/barcode?code=...&type=EAN13 → PNG preview of a barcode. */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return new NextResponse("Unauthorized", { status: 401 });
  const code = normalizeBarcode(req.nextUrl.searchParams.get("code") ?? "");
  if (!isValidBarcodeText(code)) return new NextResponse("Código inválido", { status: 400 });
  const typeParam = req.nextUrl.searchParams.get("type");
  const type = TYPES.includes(typeParam as BarcodeType) ? (typeParam as BarcodeType) : null;
  const png = await barcodePng(code, type, { scale: 2, height: 10 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" },
  });
}
