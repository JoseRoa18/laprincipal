import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { getPriceListIds } from "@/modules/catalog/infrastructure/catalog-options";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { PriceCheck } from "@/modules/sales/ui/pos/price-check";

export const metadata = { title: "Consultar precio" };

/** Price questions without a customer: see prices and stock, nothing is sold or invoiced. */
export default async function PriceCheckPage() {
  await requireRole("admin", "seller");
  const [lists, snapshot] = await Promise.all([getPriceListIds(), getRatesSnapshot()]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        back={{ href: "/vender", label: "Volver a vender" }}
        title="Consultar precio"
        description="Escanea o busca un producto para ver su precio y existencia. Aquí no se vende: para facturar, vuelve a Vender con la cédula del cliente."
      />
      <PriceCheck
        publicListId={lists.publicId}
        techListId={lists.techId ?? null}
        rateSet={Object.fromEntries(Object.entries(snapshot.rateSet).map(([k, v]) => [k, String(v)]))}
        currencies={snapshot.currencies.map((c) => ({ ...c, cashRounding: String(c.cashRounding) }))}
      />
    </div>
  );
}
