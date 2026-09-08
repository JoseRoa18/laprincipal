import { NextResponse } from "next/server";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { listHeldSales } from "@/modules/sales/infrastructure/sales-queries";

/** Sales on hold, newest first. */
export async function GET() {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const sales = await listHeldSales();
  return NextResponse.json({ sales });
}
