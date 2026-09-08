import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { getPrintingSettings } from "@/modules/settings/infrastructure/settings";
import { PrintingForm } from "@/modules/settings/ui/printing-form";

export const metadata = { title: "Impresión" };

export default async function PrintingSettingsPage() {
  await requireRole("admin");
  const printing = await getPrintingSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Impresión"
        description="Cómo se imprimen los tickets y notas de entrega."
        actions={
          <Button variant="outline" render={<Link href="/configuracion" />}>
            Volver a configuración
          </Button>
        }
      />
      <PrintingForm defaultValues={printing} />
    </div>
  );
}
