import { requireRole } from "@/lib/auth-guards";
import { loadPosConfig } from "@/modules/sales/infrastructure/pos-config";
import { PosScreen } from "@/modules/sales/ui/pos/pos-screen";

export const metadata = { title: "Nueva cotización" };

export default async function NewQuotePage() {
  const user = await requireRole("admin", "seller");
  const config = await loadPosConfig({ user, mode: "quote" });
  return <PosScreen config={config} />;
}
