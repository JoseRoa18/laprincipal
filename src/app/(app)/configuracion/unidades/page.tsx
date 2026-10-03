import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listUnits } from "@/modules/settings/infrastructure/catalogs";
import { UnitsTable } from "@/modules/settings/ui/units-table";

export const metadata = { title: "Unidades" };

export default async function UnitsPage() {
  await requireRole("admin");
  const units = await listUnits();

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/configuracion", label: "Volver a configuración" }} title="Unidades" description="Unidades de medida de los productos y cuántos decimales admiten sus cantidades." />
      <UnitsTable units={units} />
    </div>
  );
}
