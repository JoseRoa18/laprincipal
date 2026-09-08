import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listCategoryOptions } from "@/modules/inventory/infrastructure/stock-query";
import { CountCreateForm } from "@/modules/inventory/ui/count-create-form";

export const metadata = { title: "Nuevo conteo" };

export default async function NewCountPage() {
  await requireRole("admin", "warehouse");
  const categories = await listCategoryOptions();
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo conteo" description="Elige qué contar. La app guarda la existencia esperada de cada producto al empezar." />
      <CountCreateForm categories={categories} />
    </div>
  );
}
