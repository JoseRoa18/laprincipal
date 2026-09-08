import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireRole } from "@/lib/auth-guards";
import { isAiPhotoEnabled } from "@/modules/catalog/application/photo-ai";
import { getProductFormOptions } from "@/modules/catalog/infrastructure/catalog-options";
import { getProductDetail, getProductFormData } from "@/modules/catalog/infrastructure/product-detail";
import { ProductForm } from "@/modules/catalog/ui/product-form";
import { ProductGallery } from "@/modules/catalog/ui/product-gallery";
import { getDefaultLocation } from "@/modules/core/application/context";

export const metadata = { title: "Editar producto" };
// "Estilo catálogo con IA" (server action of this page) can take 10–20 s: allow up to 60 s on Vercel.
export const maxDuration = 60;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "warehouse");
  const { id } = await params;
  const location = await getDefaultLocation();
  const [data, detail, options] = await Promise.all([getProductFormData(id, location.warehouseId), getProductDetail(id, location.warehouseId), getProductFormOptions()]);
  if (!data || !detail) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`Editar: ${data.name}`} description={`${data.sku}${data.primaryBarcode ? ` · código ${data.primaryBarcode}` : ""}`} />
      <Card>
        <CardHeader>
          <CardTitle>Fotos</CardTitle>
          <CardDescription>Las fotos se guardan al instante; el resto del formulario, al pulsar Guardar.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductGallery productId={detail.id} productName={detail.name} images={detail.images} canEdit aiEnabled={isAiPhotoEnabled()} />
        </CardContent>
      </Card>
      <ProductForm mode="edit" productId={data.id} initialValues={data.values} options={options} canViewCosts={can(user.role, "view_costs")} />
    </div>
  );
}
