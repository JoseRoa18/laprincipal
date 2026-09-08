import { Boxes } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatPct, formatQty } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { getInventoryValuation, type InventorySort } from "@/modules/reporting/infrastructure/inventory-report";
import { BackToReports } from "@/modules/reporting/ui/back-to-reports";
import { Equivalents } from "@/modules/reporting/ui/equivalents";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { ShareBar } from "@/modules/reporting/ui/share-bar";

export const metadata = { title: "Inventario valorizado" };

const TOP = 50;
const SORTS: Array<{ key: InventorySort; label: string }> = [
  { key: "value", label: "Mayor valor" },
  { key: "qty", label: "Mayor existencia" },
  { key: "name", label: "Nombre" },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InventoryReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const params = await searchParams;
  const sortParam = typeof params.sort === "string" ? params.sort : "value";
  const sort: InventorySort = SORTS.some((s) => s.key === sortParam) ? (sortParam as InventorySort) : "value";
  const [v, rates] = await Promise.all([getInventoryValuation({ sort, limit: TOP }), getRatesSnapshot()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario valorizado"
        description="Cuánto vale la mercancía en existencia, a costo promedio."
        actions={
          <>
            <BackToReports />
            <ExportButton report="inventory" params={{ sort }} disabled={v.withStock === 0} />
          </>
        }
      />

      {v.withStock === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Aún no hay existencias"
          description="Registra productos con stock inicial o aplica una entrada por compra para ver la valorización."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Valor a costo" value={<Money value={v.totalValue} />} hint={<Equivalents usd={v.totalValue} rates={rates.rateSet} />} />
            <KpiCard label="Unidades en existencia" value={formatQty(v.totalQty, 2)} />
            <KpiCard label="Productos con existencia" value={formatQty(v.withStock)} />
            <KpiCard label="Productos sin existencia" value={formatQty(v.withoutStock)} hint="Activos, con stock en cero" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Por categoría</CardTitle>
              <CardDescription>Valor a costo de cada categoría y su peso en el total.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Productos</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Unidades</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-56">% del total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.byCategory.map((c) => (
                    <TableRow key={c.categoryId ?? "none"}>
                      <TableCell className="whitespace-normal font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.products}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(c.quantity, 2)}</TableCell>
                      <TableCell className="text-right">
                        <Money value={c.value} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ShareBar pct={c.share} />
                          <span className="w-14 text-right text-xs tabular-nums">{formatPct(c.share)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{v.withStock}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(v.totalQty, 2)}</TableCell>
                    <TableCell className="text-right">
                      <Money value={v.totalValue} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por producto</CardTitle>
              <CardDescription>
                {v.rowsTotal > TOP
                  ? `Los ${TOP} productos principales de ${v.rowsTotal} con existencia. El Excel incluye todos.`
                  : `${v.rowsTotal} productos con existencia.`}
              </CardDescription>
              <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Ordenar por">
                {SORTS.map((s) => (
                  <Button
                    key={s.key}
                    size="sm"
                    variant={sort === s.key ? "default" : "outline"}
                    aria-pressed={sort === s.key}
                    render={<Link href={s.key === "value" ? "/reportes/inventario" : `/reportes/inventario?sort=${s.key}`} />}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Costo prom.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.rows.map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="whitespace-normal">
                        <Link href={`/productos/${r.productId}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">{r.partNumber ?? r.sku}</div>
                      </TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">{r.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(r.quantity, r.unitDecimals)}</TableCell>
                      <TableCell className="hidden text-right md:table-cell">
                        <Money value={r.costAvg} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={r.value} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
