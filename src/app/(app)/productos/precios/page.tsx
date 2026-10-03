import { CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { requireRole } from "@/lib/auth-guards";
import { D } from "@/lib/money";
import { listProducts, parseListFilter } from "@/modules/catalog/infrastructure/products-list";
import { PriceEntryList } from "@/modules/catalog/ui/price-entry-list";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getSetting } from "@/modules/settings/infrastructure/settings";

export const metadata = { title: "Poner precios" };

const PAGE_SIZE = 40;

type SearchParams = Record<string, string | string[] | undefined>;

/** Products registered without a selling price, to price them one after another. */
export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const filter = { ...parseListFilter(params), price: "missing" as const, active: "all" as const };
  const location = await getDefaultLocation();
  const [{ rows, total }, policies] = await Promise.all([
    listProducts(filter, { warehouseId: location.warehouseId, page, pageSize: PAGE_SIZE }),
    getSetting("policies"),
  ]);
  const margin = D(policies.defaultMarginPct).div(100);
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    partNumber: r.partNumber,
    brandName: r.brandName,
    costUsd: r.costAvgUsd,
    // Suggested public price: cost plus the default margin of Configuración → Políticas.
    suggestedUsd: D(r.costAvgUsd).gt(0) ? D(r.costAvgUsd).mul(D(1).plus(margin)).toDecimalPlaces(2).toFixed(2) : null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/productos", label: "Volver a productos" }}
        title="Poner precios"
        description={
          total > 0
            ? `${total} producto(s) con "Falta precio". No se pueden vender hasta ponerles el precio público; el técnico se calcula solo (${policies.techPriceMarkdownPct} % menos) si lo dejas vacío.`
            : undefined
        }
      />
      <SearchInput placeholder="Buscar por nombre, número de parte o código" autoFocus={false} />
      {total === 0 ? (
        <EmptyState icon={CircleCheck} title="Todos los productos tienen precio" description="Los que se registren sin precio aparecerán aquí." />
      ) : (
        <>
          <PriceEntryList items={items} marginPct={policies.defaultMarginPct} techMarkdownPct={policies.techPriceMarkdownPct} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/productos/precios" params={params} />
        </>
      )}
    </div>
  );
}
