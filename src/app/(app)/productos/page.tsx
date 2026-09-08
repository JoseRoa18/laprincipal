import { FileUp, FolderTree, Package, Plus, SearchX, Tags } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { StockStatusBadge } from "@/components/app/stock-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireUser } from "@/lib/auth-guards";
import { formatPct, formatQty } from "@/lib/format";
import { listBrands, listCategoryOptions } from "@/modules/catalog/infrastructure/catalog-options";
import { listProducts, parseListFilter } from "@/modules/catalog/infrastructure/products-list";
import { priceMargin } from "@/modules/catalog/domain/pricing";
import { LinkRow } from "@/modules/catalog/ui/link-row";
import { ProductFilters } from "@/modules/catalog/ui/product-filters";
import { ProductThumb } from "@/modules/catalog/ui/product-thumb";
import { getDefaultLocation } from "@/modules/core/application/context";
import { fromUsd } from "@/modules/currency/domain/conversion";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";

export const metadata = { title: "Productos" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);
  const filter = parseListFilter(params);
  const location = await getDefaultLocation();
  const [{ rows, total }, categories, brands, rates] = await Promise.all([
    listProducts(filter, { warehouseId: location.warehouseId, page, pageSize: DEFAULT_PAGE_SIZE }),
    listCategoryOptions(),
    listBrands(),
    getRatesSnapshot(),
  ]);
  const canManage = can(user.role, "manage_products");
  const showCosts = can(user.role, "view_costs");
  const hasVes = Boolean(rates.rateSet.VES);
  const bs = (usd: string | null) => (usd && hasVes ? fromUsd(usd, "VES", rates.rateSet) : null);
  const hasFilters = Boolean(filter.q || filter.categoryId || filter.brandId || filter.stock !== "all" || filter.active !== "1");

  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "page") exportParams.set(k, v);
  const exportHref = `/api/products/export?${exportParams.toString()}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos"
        description={total > 0 ? `${total} producto(s)` : undefined}
        actions={
          <>
            {canManage ? (
              <>
                <Button variant="outline" size="sm" className="hidden md:inline-flex" render={<Link href="/productos/categorias" />}>
                  <FolderTree /> Categorías y marcas
                </Button>
                <Button variant="outline" size="sm" className="hidden md:inline-flex" render={<Link href="/productos/etiquetas" />}>
                  <Tags /> Etiquetas
                </Button>
              </>
            ) : null}
            {user.role === "admin" ? (
              <Button variant="outline" size="sm" className="hidden md:inline-flex" render={<Link href="/productos/importar" />}>
                <FileUp /> Importar
              </Button>
            ) : null}
            {canManage ? (
              <Button size="lg" className="h-11" render={<Link href="/productos/nuevo" />}>
                <Plus /> Nuevo producto
              </Button>
            ) : null}
          </>
        }
      />

      {canManage ? (
        <div className="flex gap-2 overflow-x-auto md:hidden">
          <Button variant="outline" size="sm" render={<Link href="/productos/categorias" />}>
            <FolderTree /> Categorías
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/productos/etiquetas" />}>
            <Tags /> Etiquetas
          </Button>
          {user.role === "admin" ? (
            <Button variant="outline" size="sm" render={<Link href="/productos/importar" />}>
              <FileUp /> Importar
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <SearchInput placeholder="Nombre, número de parte, equivalencia, modelo o código" autoFocus={false} />
        <ProductFilters categories={categories} brands={brands} filter={filter} exportHref={total > 0 ? exportHref : null} />
      </div>

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={SearchX}
            title="Sin resultados"
            description="Prueba con otra palabra, el número de parte o un código equivalente, o quita los filtros."
            action={
              <Button variant="outline" render={<Link href="/productos" />}>
                Quitar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Package}
            title="Todavía no hay productos"
            description={canManage ? "Registra el primero con la cámara del celular o importa tu lista desde Excel." : "Cuando el administrador registre productos aparecerán aquí."}
            action={
              canManage ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="lg" render={<Link href="/productos/nuevo" />}>
                    <Plus /> Nuevo producto
                  </Button>
                  {user.role === "admin" ? (
                    <Button size="lg" variant="outline" render={<Link href="/productos/importar" />}>
                      <FileUp /> Importar desde Excel
                    </Button>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/productos/${p.id}`} className="bg-card flex gap-3 rounded-xl border p-3 active:bg-muted/50">
                  <ProductThumb url={p.thumbUrl} alt="" size={56} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium leading-tight">{p.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {p.partNumber ? `${p.partNumber} · ` : ""}
                      {p.sku}
                      {p.brandName ? ` · ${p.brandName}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>
                        <span className="text-muted-foreground">Público </span>
                        {p.publicPriceUsd ? <Money value={p.publicPriceUsd} /> : "—"}
                        {bs(p.publicPriceUsd) ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · <Money value={bs(p.publicPriceUsd)!} currency="VES" />
                          </span>
                        ) : null}
                      </span>
                      <span>
                        <span className="text-muted-foreground">Técnico </span>
                        {p.techPriceUsd ? <Money value={p.techPriceUsd} /> : "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm tabular-nums">
                        Stock {formatQty(p.stockAvailable, p.unitDecimals)} {p.unitSymbol}
                      </span>
                      <StockStatusBadge status={p.status} />
                      {p.locationCode ? <Badge variant="outline">{p.locationCode}</Badge> : null}
                      {!p.isActive ? <Badge variant="secondary">Inactivo</Badge> : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14" />
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Público</TableHead>
                  <TableHead className="text-right">Técnico</TableHead>
                  {showCosts ? <TableHead className="text-right">Costo / margen</TableHead> : null}
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ubicación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const margin = showCosts ? priceMargin(p.publicPriceUsd ?? "", p.costAvgUsd) : null;
                  return (
                    <LinkRow key={p.id} href={`/productos/${p.id}`} className={!p.isActive ? "opacity-60" : undefined}>
                      <TableCell>
                        <ProductThumb url={p.thumbUrl} alt="" size={44} />
                      </TableCell>
                      <TableCell className="min-w-48 max-w-72 whitespace-normal">
                        <Link href={`/productos/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {p.partNumber ? `${p.partNumber} · ` : ""}
                          {p.sku}
                          {p.brandName ? ` · ${p.brandName}` : ""}
                          {!p.isActive ? " · Inactivo" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate text-xs">{p.categoryPath ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {p.publicPriceUsd ? <Money value={p.publicPriceUsd} /> : "—"}
                        {bs(p.publicPriceUsd) ? (
                          <p className="text-muted-foreground text-xs">
                            <Money value={bs(p.publicPriceUsd)!} currency="VES" />
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.techPriceUsd ? <Money value={p.techPriceUsd} /> : "—"}
                        {bs(p.techPriceUsd) ? (
                          <p className="text-muted-foreground text-xs">
                            <Money value={bs(p.techPriceUsd)!} currency="VES" />
                          </p>
                        ) : null}
                      </TableCell>
                      {showCosts ? (
                        <TableCell className="text-right">
                          <Money value={p.costAvgUsd} />
                          {margin?.marginPct ? <p className={`text-xs ${margin.belowCost ? "text-destructive" : "text-muted-foreground"}`}>{formatPct(margin.marginPct)}</p> : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums">
                        {formatQty(p.stockAvailable, p.unitDecimals)} {p.unitSymbol}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.locationCode ?? "—"}</TableCell>
                    </LinkRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={total} basePath="/productos" params={params} />
        </>
      )}
    </div>
  );
}
