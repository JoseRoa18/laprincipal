import { Boxes, ClipboardList, History, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { STOCK_STATUS_LABEL } from "@/components/app/stock-status-badge";
import { Button } from "@/components/ui/button";
import { can, requireUser } from "@/lib/auth-guards";
import { fromUsd } from "@/modules/currency/domain/conversion";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { STOCK_STATUSES, isStockStatus, listCategoryOptions, listStock } from "@/modules/inventory/infrastructure/stock-query";
import { UrlSelect, UrlToggle } from "@/modules/inventory/ui/filters";
import { StockTable } from "@/modules/inventory/ui/stock-table";

export const metadata = { title: "Existencias" };

const PAGE_SIZE = 50;

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = str(params.q);
  const status = isStockStatus(params.status) ? params.status : "";
  const categoryId = str(params.category);
  const onlyWithStock = str(params.stock) === "1";
  const showCosts = can(user.role, "view_costs");
  const canEdit = can(user.role, "adjust_stock");

  const [{ rows, total, totalValueUsd }, categories, rates] = await Promise.all([
    listStock({ q, status, categoryId, onlyWithStock, page, pageSize: PAGE_SIZE }),
    listCategoryOptions(),
    showCosts ? getRatesSnapshot() : null,
  ]);
  const hasFilters = Boolean(q || status || categoryId || onlyWithStock);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Existencias"
        description="Stock físico, disponible y semáforo de reposición"
        actions={
          <>
            <Button variant="outline" render={<Link href="/inventario/movimientos" />}>
              <History data-icon="inline-start" /> Kardex
            </Button>
            <Button variant="outline" render={<Link href="/inventario/alertas" />}>
              <TriangleAlert data-icon="inline-start" /> Alertas
            </Button>
            {canEdit ? (
              <>
                <Button variant="outline" render={<Link href="/inventario/conteos" />}>
                  <ClipboardList data-icon="inline-start" /> Conteos
                </Button>
                <Button render={<Link href="/inventario/ajustes/nuevo" />}>
                  <SlidersHorizontal data-icon="inline-start" /> Nuevo ajuste
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput placeholder="Nombre, número de parte, SKU o ubicación" className="sm:w-80" />
        <UrlSelect param="status" placeholder="Todos los estados" options={STOCK_STATUSES.map((s) => ({ value: s, label: STOCK_STATUS_LABEL[s] }))} />
        <UrlSelect param="category" placeholder="Todas las categorías" options={categories.map((c) => ({ value: c.id, label: c.label }))} />
        <UrlToggle param="stock" label="Solo con existencia" />
      </div>

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={Boxes} title="Sin resultados" description="No hay productos que coincidan con la búsqueda o los filtros." />
        ) : (
          <EmptyState
            icon={Boxes}
            title="Todavía no hay productos"
            description="Registra productos y carga el inventario inicial con un ajuste para ver las existencias aquí."
            action={
              canEdit ? (
                <Button render={<Link href="/productos/nuevo" />}>Registrar producto</Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <StockTable rows={rows} showCosts={showCosts} canEdit={canEdit} />
          {showCosts ? (
            <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Valor a costo promedio {hasFilters ? "de los productos filtrados" : "del inventario"} ({total} {total === 1 ? "producto" : "productos"})
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
                <Money value={totalValueUsd} currency="USD" className="text-base" />
                {rates?.rates.map((r) => (
                  <Money key={r.currencyCode} value={fromUsd(totalValueUsd, r.currencyCode, rates.rateSet, r.currencyCode === "COP" ? 0 : 2)} currency={r.currencyCode} className="text-muted-foreground" />
                ))}
              </span>
            </div>
          ) : null}
        </>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/inventario" params={params} />
    </div>
  );
}
