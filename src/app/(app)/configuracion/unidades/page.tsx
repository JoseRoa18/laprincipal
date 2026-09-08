import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
      <Link href="/configuracion" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" />
        Volver a configuración
      </Link>
      <PageHeader title="Unidades" description="Unidades de medida de los productos y cuántos decimales admiten sus cantidades." />
      <UnitsTable units={units} />
    </div>
  );
}
