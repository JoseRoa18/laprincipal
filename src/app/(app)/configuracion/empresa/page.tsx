import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { getStorage } from "@/lib/storage";
import { getCompanySettings, getSettingUpdatedAt } from "@/modules/settings/infrastructure/settings";
import { CompanyForm } from "@/modules/settings/ui/company-form";

export const metadata = { title: "Empresa" };

export default async function CompanySettingsPage() {
  await requireRole("admin");
  const [company, updatedAt] = await Promise.all([getCompanySettings(), getSettingUpdatedAt("company")]);
  const logoUrl = company.logoPath ? `${getStorage().publicUrl("product-photos", company.logoPath)}?v=${updatedAt?.getTime() ?? 0}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        back={{ href: "/configuracion", label: "Volver a configuración" }}
        title="Empresa"
        description="Datos que aparecen en tickets, cotizaciones y reportes."
      />
      <CompanyForm
        defaultValues={{ name: company.name, taxId: company.taxId, address: company.address, phone: company.phone, email: company.email }}
        logoUrl={logoUrl}
      />
    </div>
  );
}
