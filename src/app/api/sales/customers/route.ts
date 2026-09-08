import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole } from "@/modules/sales/infrastructure/api-guard";
import { searchCustomers } from "@/modules/sales/infrastructure/customers-lookup";

/** Customer search for the POS picker: ?q=<name | document | phone> */
export async function GET(req: NextRequest) {
  const guard = await requireApiRole("admin", "seller");
  if (guard.error) return guard.error;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const customers = await searchCustomers(q, { limit: 12 });
  return NextResponse.json({ customers });
}
