import { can, requireRole } from "@/lib/auth-guards";
import { loadPosConfig } from "@/modules/sales/infrastructure/pos-config";
import { PosScreen } from "@/modules/sales/ui/pos/pos-screen";

export const metadata = { title: "Vender" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VenderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin", "seller");
  const params = await searchParams;
  // Turning a quote into a sale is for whoever can see quotes (the admin).
  const quoteId = can(user.role, "quote") && typeof params.cotizacion === "string" && UUID.test(params.cotizacion) ? params.cotizacion : undefined;
  const heldSaleId = typeof params.espera === "string" && UUID.test(params.espera) ? params.espera : undefined;
  const config = await loadPosConfig({ user, mode: "sale", quoteId, heldSaleId });
  return <PosScreen config={config} />;
}
