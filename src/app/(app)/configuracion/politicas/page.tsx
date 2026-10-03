import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { getPolicies } from "@/modules/settings/infrastructure/settings";
import { PoliciesForm } from "@/modules/settings/ui/policies-form";

export const metadata = { title: "Políticas" };

export default async function PoliciesSettingsPage() {
  await requireRole("admin");
  const policies = await getPolicies();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={{ href: "/configuracion", label: "Volver a configuración" }}
        title="Políticas"
        description="Reglas del negocio que la app hace cumplir."
      />
      <PoliciesForm defaultValues={policies} />
    </div>
  );
}
