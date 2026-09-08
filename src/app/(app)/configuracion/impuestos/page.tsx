import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
      <Link href="/configuracion" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" />
        Volver a configuración
      </Link>
      <PageHeader title="Impuestos" description="Tasas de IVA que se asignan a los productos. Solo una puede ser la predeterminada." />
      <TaxesTable taxes={taxes} />
    </div>
  );
}
