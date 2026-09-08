import { NextResponse, type NextRequest } from "next/server";
import { can, getSessionUser } from "@/lib/auth-guards";
import { expandLabelItems, isLabelFormat, parseLabelItems, type LabelFormat, type LabelRequestItem } from "@/modules/catalog/domain/labels";
import { getLabelData } from "@/modules/catalog/infrastructure/labels-data";
import { renderLabelsPdf } from "@/modules/catalog/infrastructure/labels-pdf";

export const dynamic = "force-dynamic";

async function authorize() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "manage_products")) return new NextResponse("Forbidden", { status: 403 });
  return null;
}

async function render(items: LabelRequestItem[], format: LabelFormat, showPrice: boolean) {
  if (items.length === 0) return new NextResponse("No hay productos seleccionados", { status: 400 });
  const data = await getLabelData(items.map((i) => i.productId));
  const byId = new Map(data.map((d) => [d.productId, d]));
  const labels = expandLabelItems(items)
    .map((id) => byId.get(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  const pdf = await renderLabelsPdf({ format, labels, showPrice });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="etiquetas-${format}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

/** GET /api/products/labels?items=<id>:<qty>,<id>:<qty>&format=roll|a4&price=1|0 */
export async function GET(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format");
  return render(parseLabelItems(sp.get("items")), isLabelFormat(format) ? format : "roll", sp.get("price") !== "0");
}

/** POST { items: [{ productId, quantity }], format, showPrice } */
export async function POST(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  let body: { items?: Array<{ productId?: string; quantity?: number }>; format?: string; showPrice?: boolean };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  const items = parseLabelItems((body.items ?? []).map((i) => `${i.productId ?? ""}:${i.quantity ?? 1}`).join(","));
  return render(items, isLabelFormat(body.format) ? body.format : "roll", body.showPrice !== false);
}
