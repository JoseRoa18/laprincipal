import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
      <Link href="/configuracion" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" />
        Volver a configuración
      </Link>
      <PageHeader title="Motivos de ajuste" description="Razones que se eligen al registrar entradas y salidas manuales de inventario." />
      <ReasonsTable reasons={reasons} />
    </div>
  );
}
