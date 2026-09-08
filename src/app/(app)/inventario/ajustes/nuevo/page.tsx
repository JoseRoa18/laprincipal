import { PageHeader } from "@/components/app/page-header";
import { can, requireRole } from "@/lib/auth-guards";
import { listAdjustmentReasons } from "@/modules/inventory/infrastructure/adjustments";
import { AdjustmentForm } from "@/modules/inventory/ui/adjustment-form";

export const metadata = { title: "Nuevo ajuste" };

export default async function NewAdjustmentPage() {
  const user = await requireRole("admin", "warehouse");
  const reasons = await listAdjustmentReasons();
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo ajuste" description="Elige el motivo, agrega los productos y aplica" />
      <AdjustmentForm reasons={reasons} showCosts={can(user.role, "view_costs")} />
    </div>
  );
}
