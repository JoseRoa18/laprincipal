import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listAdjustmentReasons } from "@/modules/settings/infrastructure/catalogs";
import { ReasonsTable } from "@/modules/settings/ui/reasons-table";

export const metadata = { title: "Motivos de ajuste" };

export default async function ReasonsPage() {
  await requireRole("admin");
  const reasons = await listAdjustmentReasons();

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/configuracion", label: "Volver a configuración" }} title="Motivos de ajuste" description="Razones que se eligen al registrar entradas y salidas manuales de inventario." />
      <ReasonsTable reasons={reasons} />
    </div>
  );
}
