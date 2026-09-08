import { NextResponse, type NextRequest } from "next/server";
import { findProductByBarcode, getProductsForSale, searchProducts } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { toPosProduct } from "@/modules/sales/application/schemas";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Product lookup for the POS:
 *   ?barcode=<code>          exact barcode
 *   ?q=<text>                name / part number / equivalence / model
 *   ?ids=<uuid,uuid>         re-price cart lines
 * Optional ?priceListId=<uuid> selects the price list (falls back to PUBLIC).
 */
export async function GET(req: NextRequest) {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;

  const sp = req.nextUrl.searchParams;
  const priceListIdRaw = sp.get("priceListId");
  const priceListId = priceListIdRaw && UUID.test(priceListIdRaw) ? priceListIdRaw : null;
  const { warehouseId } = await getDefaultLocation();
  const opts = { priceListId, warehouseId };

  const barcode = sp.get("barcode");
  if (barcode) {
    const product = await findProductByBarcode(barcode, opts);
    return NextResponse.json({ products: product && product.isActive ? [toPosProduct(product)] : [] });
  }

  const ids = sp.get("ids");
  if (ids) {
    const list = ids
      .split(",")
      .map((s) => s.trim())
      .filter((s) => UUID.test(s))
      .slice(0, 200);
    const products = await getProductsForSale(list, opts);
    return NextResponse.json({ products: products.map(toPosProduct) });
  }

  const q = (sp.get("q") ?? "").slice(0, 80);
  const products = await searchProducts(q, { ...opts, limit: 20 });
  return NextResponse.json({ products: products.map(toPosProduct) });
}
