import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listTaxes } from "@/modules/settings/infrastructure/catalogs";
import { TaxesTable } from "@/modules/settings/ui/taxes-table";

export const metadata = { title: "Impuestos" };

export default async function TaxesPage() {
  await requireRole("admin");
  const taxes = await listTaxes();

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/configuracion", label: "Volver a configuración" }} title="Impuestos" description="Tasas de IVA que se asignan a los productos. Solo una puede ser la predeterminada." />
      <TaxesTable taxes={taxes} />
    </div>
  );
}
