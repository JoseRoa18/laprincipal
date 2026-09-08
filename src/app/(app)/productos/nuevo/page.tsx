import { PageHeader } from "@/components/app/page-header";
import { can, requireRole } from "@/lib/auth-guards";
import { isAiPhotoEnabled } from "@/modules/catalog/application/photo-ai";
import { emptyProductForm } from "@/modules/catalog/domain/product-schema";
import { getProductFormOptions } from "@/modules/catalog/infrastructure/catalog-options";
import { ProductForm } from "@/modules/catalog/ui/product-form";

export const metadata = { title: "Nuevo producto" };
// "Estilo catálogo con IA" (server action of this page) can take 10–20 s: allow up to 60 s on Vercel.
export const maxDuration = 60;

export default async function NewProductPage() {
  const user = await requireRole("admin", "warehouse");
  const options = await getProductFormOptions();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Nuevo producto" description="Foto, datos básicos, precios y stock inicial. Solo el nombre y el precio público son obligatorios." />
      <ProductForm
        mode="create"
        initialValues={emptyProductForm({ unitId: options.defaultUnitId, taxId: options.defaultTaxId })}
        options={options}
        canViewCosts={can(user.role, "view_costs")}
        aiPhotosEnabled={isAiPhotoEnabled()}
      />
    </div>
  );
}
