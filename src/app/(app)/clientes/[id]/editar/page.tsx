import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { getCustomer, listPriceLists } from "@/modules/customers/infrastructure/customers";
import { CustomerForm } from "@/modules/customers/ui/customer-form";

export const metadata = { title: "Editar cliente" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "seller");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [customer, priceLists] = await Promise.all([getCustomer(id), listPriceLists()]);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Editar cliente" description={customer.name} />
      <CustomerForm
        customerId={customer.id}
        priceLists={priceLists}
        defaultValues={{
          kind: customer.kind,
          docType: customer.docType,
          docNumber: customer.docNumber ?? "",
          name: customer.name,
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          address: customer.address ?? "",
          customerType: customer.customerType,
          priceListId: customer.priceListId ?? "",
          notes: customer.notes ?? "",
          isActive: customer.isActive,
        }}
      />
    </div>
  );
}
