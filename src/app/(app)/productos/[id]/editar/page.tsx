import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireRole } from "@/lib/auth-guards";
import { isAiPhotoEnabled } from "@/modules/catalog/application/photo-ai";
import { codeLabel } from "@/modules/catalog/domain/sku";
import { getProductFormOptions } from "@/modules/catalog/infrastructure/catalog-options";
import { getProductDetail, getProductFormData } from "@/modules/catalog/infrastructure/product-detail";
import { ProductForm } from "@/modules/catalog/ui/product-form";
import { ProductGallery } from "@/modules/catalog/ui/product-gallery";
import { ProductStickyBar } from "@/modules/catalog/ui/product-sticky-bar";
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
    <>
      {/* Outside the column so it sticks for the whole page and adds no gap. */}
      <ProductStickyBar watchId="product-edit-title" name={data.name} sku={data.sku} barcode={data.primaryBarcode} thumbUrl={detail.images[0]?.thumbUrl ?? null} />
      <div className="mx-auto max-w-5xl space-y-4">
        <div id="product-edit-title">
          <PageHeader back={{ href: `/productos/${id}`, label: "Volver al producto" }} title={`Editar: ${data.name}`} description={`${codeLabel(data.sku)} ${data.sku}${data.primaryBarcode ? ` · Cód. barras ${data.primaryBarcode}` : ""}`} />
        </div>
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
    </>
  );
}
