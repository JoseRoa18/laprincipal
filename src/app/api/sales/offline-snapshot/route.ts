import { NextResponse } from "next/server";
import { getDefaultLocation } from "@/modules/core/application/context";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { buildOfflineSnapshot } from "@/modules/sales/infrastructure/offline-snapshot";

/**
 * Catalog, prices, stock and customers the counter saves on the device to
 * keep selling and checking prices without a connection.
 */
export async function GET() {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const { warehouseId } = await getDefaultLocation();
  const snapshot = await buildOfflineSnapshot(warehouseId);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
