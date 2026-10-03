import { PageHeader } from "@/components/app/page-header";
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
        back={{ href: "/configuracion", label: "Volver a configuración" }}
        title="Impresión"
        description="Cómo se imprimen los tickets y notas de entrega."
      />
      <PrintingForm defaultValues={printing} />
    </div>
  );
}
