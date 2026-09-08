import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listCurrencies } from "@/modules/currency/infrastructure/rates";
import { getSupplier } from "@/modules/purchasing/infrastructure/suppliers";
import { SupplierForm } from "@/modules/purchasing/ui/supplier-form";

export const metadata = { title: "Editar proveedor" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "warehouse");
  const { id } = await params;
  const [supplier, currencies] = await Promise.all([getSupplier(id), listCurrencies()]);
  if (!supplier) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={`Editar ${supplier.name}`} />
      <SupplierForm initial={supplier} currencies={currencies.map((c) => c.code)} />
    </div>
  );
}
