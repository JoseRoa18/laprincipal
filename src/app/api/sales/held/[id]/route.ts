import { NextResponse, type NextRequest } from "next/server";
import { getDefaultLocation } from "@/modules/core/application/context";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { getHeldSaleCart } from "@/modules/sales/infrastructure/sales-queries";

/** A held sale as a cart payload (fresh product data, saved quantities and discounts). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const { warehouseId } = await getDefaultLocation();
  const payload = await getHeldSaleCart(id, warehouseId);
  if (!payload) return NextResponse.json({ error: "La venta en espera ya no existe." }, { status: 404 });
  return NextResponse.json(payload);
}
