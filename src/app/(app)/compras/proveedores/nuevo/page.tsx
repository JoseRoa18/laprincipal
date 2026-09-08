import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listCurrencies } from "@/modules/currency/infrastructure/rates";
import { SupplierForm } from "@/modules/purchasing/ui/supplier-form";

export const metadata = { title: "Nuevo proveedor" };

export default async function NewSupplierPage() {
  await requireRole("admin", "warehouse");
  const currencies = await listCurrencies();
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo proveedor" description="Solo el nombre es obligatorio; el resto ayuda a calcular cuándo comprar." />
      <SupplierForm currencies={currencies.map((c) => c.code)} />
    </div>
  );
}
