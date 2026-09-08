import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listPriceLists } from "@/modules/customers/infrastructure/customers";
import { CustomerForm } from "@/modules/customers/ui/customer-form";

export const metadata = { title: "Nuevo cliente" };

export default async function NewCustomerPage() {
  await requireRole("admin", "seller");
  const priceLists = await listPriceLists();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Nuevo cliente" description="Solo el nombre es obligatorio." />
      <CustomerForm priceLists={priceLists} />
    </div>
  );
}
