import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { getProductsForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { LabelsPicker, type LabelProduct } from "@/modules/catalog/ui/labels-picker";
import { getDefaultLocation } from "@/modules/core/application/context";

export const metadata = { title: "Etiquetas" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const add = typeof params.add === "string" ? params.add.split(",").filter((id) => UUID.test(id)) : [];
  let initial: LabelProduct[] = [];
  if (add.length > 0) {
    const location = await getDefaultLocation();
    const rows = await getProductsForSale(add, { warehouseId: location.warehouseId });
    initial = rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, partNumber: r.partNumber, thumbUrl: r.thumbUrl }));
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Etiquetas" description="Elige productos y cantidades, y genera el PDF para el rollo o para una hoja A4." />
      <LabelsPicker initial={initial} />
    </div>
  );
}
