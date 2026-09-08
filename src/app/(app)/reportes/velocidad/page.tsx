import { Gauge, Info } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { STOCK_STATUS_LABEL, StockStatusBadge } from "@/components/app/stock-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatDateTime, formatPct, formatQty } from "@/lib/format";
import type { AbcClass, StockStatus } from "@/modules/inventory/domain/velocity";
import { listCategoryOptions } from "@/modules/reporting/infrastructure/categories";
import { getVelocityReport, STATUS_ORDER, type VelocitySort } from "@/modules/reporting/infrastructure/velocity-report";
import { BackToReports } from "@/modules/reporting/ui/back-to-reports";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { ParamSelect } from "@/modules/reporting/ui/param-select";
import { RecomputeButton } from "@/modules/reporting/ui/recompute-button";
import { getStatsSettings } from "@/modules/settings/infrastructure/settings";
import { cn } from "cn";

export const metadata = { title: "Velocidad de venta" };

const PAGE_SIZE = 50;
const ABC: AbcClass[] = ["A", "B", "C"];
const SORTS: Array<{ value: VelocitySort; label: string }> = [
  { value: "velocity", label: "Mayor velocidad" },
  { value: "cover", label: "Menor cobertura" },
  { value: "name", label: "Nombre" },
];

type Params = Record<string, string | string[] | undefined>;

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function hrefWith(params: Params, patch: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) sp.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v) sp.set(k, v);
    else sp.delete(k);
  }
  sp.delete("page");
  const qs = sp.toString();
  return qs ? `/reportes/velocidad?${qs}` : "/reportes/velocidad";
}

export default async function VelocityReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin");
  const params = await searchParams;
  const statusParam = str(params.status);
  const status = STATUS_ORDER.includes(statusParam as StockStatus) ? (statusParam as StockStatus) : undefined;
  const abcParam = str(params.abc);
  const abc = ABC.includes(abcParam as AbcClass) ? (abcParam as AbcClass) : undefined;
  const categoryId = str(params.category);
  const sortParam = str(params.sort);
  const sort: VelocitySort = SORTS.some((s) => s.value === sortParam) ? (sortParam as VelocitySort) : "velocity";
  const page = parsePage(params.page);

  const [report, categories, settings] = await Promise.all([
    getVelocityReport({ status, abc, categoryId, sort, page, pageSize: PAGE_SIZE }),
    listCategoryOptions(),
    getStatsSettings(),
  ]);
  const totalProducts = Object.values(report.statusCounts).reduce((a, b) => a + b, 0);
  const filtered = Boolean(status || abc || categoryId);
  const exportParams = { status, abc, category: categoryId, sort };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Velocidad de venta y reposición"
        description={
          report.computedAt
            ? `Calculado el ${formatDateTime(report.computedAt)}. Se actualiza solo cada día a las 3:00 a. m.`
            : "Todavía no se han calculado las estadísticas. Pulsa «Recalcular ahora»."
        }
        actions={
          <>
            <BackToReports />
            <ExportButton report="velocity" params={exportParams} disabled={totalProducts === 0} />
            <RecomputeButton />
          </>
        }
      />

      {totalProducts === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Aún no hay productos"
          description="Registra productos y ventas; la velocidad de venta se calcula con el historial de los últimos 90 días."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
            {STATUS_ORDER.map((s) => {
              const active = status === s;
              return (
                <Link
                  key={s}
                  href={hrefWith(params, { status: active ? undefined : s })}
                  aria-pressed={active}
                  className={cn(
                    "tap-target bg-card flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                    active && "ring-ring ring-2",
                  )}
                >
                  <StockStatusBadge status={s} />
                  <span className="font-semibold tabular-nums">{report.statusCounts[s]}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ParamSelect param="status" label="Estado" options={STATUS_ORDER.map((s) => ({ value: s, label: STOCK_STATUS_LABEL[s] }))} />
            <ParamSelect param="abc" label="Clase" options={ABC.map((c) => ({ value: c, label: `Clase ${c}` }))} allLabel="Todas" />
            <ParamSelect param="category" label="Categoría" options={categories.map((c) => ({ value: c.id, label: c.label }))} allLabel="Todas" />
            <ParamSelect param="sort" label="Ordenar" options={SORTS} hideAll defaultValue="velocity" />
          </div>

          {report.rows.length === 0 ? (
            <EmptyState title="Ningún producto coincide con los filtros" description="Quita algún filtro para ver más productos." />
          ) : (
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Producto</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead className="text-right">Velocidad/día</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      <TableHead className="hidden text-center md:table-cell">ABC</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Reorden sugerido</TableHead>
                      <TableHead className="text-right">Cantidad sugerida</TableHead>
                      <TableHead className="hidden md:table-cell">Última venta</TableHead>
                      <TableHead className="hidden pr-4 md:table-cell">Modo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r) => (
                      <TableRow key={r.productId}>
                        <TableCell className="max-w-64 pl-4 whitespace-normal">
                          <Link href={`/productos/${r.productId}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          <div className="text-muted-foreground text-xs">
                            {r.partNumber ?? r.sku} · {r.category}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(r.available, r.unitDecimals)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(r.velocity, 2)}
                          {Number(r.velocity30) !== Number(r.velocity) ? (
                            <div className="text-muted-foreground text-xs">30 d: {formatQty(r.velocity30, 2)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.daysOfCover ? `${formatQty(r.daysOfCover, 1)} días` : "—"}</TableCell>
                        <TableCell className="hidden text-center md:table-cell">
                          {r.abcClass ? (
                            <Badge variant="outline" className="font-semibold">
                              {r.abcClass}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <StockStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {formatQty(r.suggestedReorderPoint, r.unitDecimals)}
                          {r.mode === "manual" ? (
                            <div className="text-muted-foreground text-xs">
                              manual: {formatQty(Number(r.reorderPoint) > 0 ? r.reorderPoint : r.minStock, r.unitDecimals)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatQty(r.suggestedQty, r.unitDecimals)}</TableCell>
                        <TableCell className="hidden md:table-cell">{r.lastSaleAt ? formatDate(r.lastSaleAt) : <span className="text-muted-foreground">Nunca</span>}</TableCell>
                        <TableCell className="hidden pr-4 md:table-cell">
                          <Badge variant={r.mode === "auto" ? "secondary" : "outline"}>{r.mode === "auto" ? "Automático" : "Manual"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Pagination page={report.page} pageSize={PAGE_SIZE} total={report.total} basePath="/reportes/velocidad" params={params} />
          {filtered ? (
            <p className="text-muted-foreground text-sm">
              {report.total} de {totalProducts} productos.{" "}
              <Link href="/reportes/velocidad" className="underline underline-offset-4">
                Quitar filtros
              </Link>
            </p>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="text-muted-foreground size-4" />
            ¿Cómo se calculan estos números?
          </CardTitle>
          <CardDescription>Todo sale de las ventas y del kardex; no hay que cargar nada a mano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Velocidad de venta</strong>: unidades vendidas ÷ días con existencia en la ventana. Se calcula a{" "}
              {settings.windows.join(", ")} días y se combina dando más peso a la ventana corta (pesos{" "}
              {settings.weights.map((w) => formatPct(w * 100, 0)).join(", ")}). Los días en que el producto estaba agotado no cuentan, así un
              producto que se agotó no parece «lento».
            </li>
            <li>
              <strong>Cobertura</strong>: existencia disponible ÷ velocidad. Son los días que alcanza el stock actual si se sigue vendiendo igual.
            </li>
            <li>
              <strong>Clase ABC</strong>: por ingresos de los últimos 90 días. Los productos que suman el 80 % de los ingresos son A; los del
              siguiente 15 %, B; el resto, C. Los A se protegen más contra quiebres (nivel de servicio A{" "}
              {formatPct(settings.serviceLevels.A * 100, 0)}, B {formatPct(settings.serviceLevels.B * 100, 0)}, C{" "}
              {formatPct(settings.serviceLevels.C * 100, 0)}).
            </li>
            <li>
              <strong>Reorden sugerido</strong>: velocidad × días de entrega del proveedor + stock de seguridad (según lo irregular que sea la
              demanda y la clase ABC). Cuando la existencia baja a ese punto, toca comprar.
            </li>
            <li>
              <strong>Cantidad sugerida</strong>: lo que falta para cubrir {settings.targetCoverDays} días de venta, redondeado al empaque del
              proveedor.
            </li>
            <li>
              <strong>Semáforo</strong>: <em>Comprar ya</em> cuando la existencia está en el punto de reorden o por debajo; <em>Pronto</em> cuando la
              cobertura es de {settings.soonThresholdDays} días o menos; <em>Exceso</em> cuando supera el máximo configurado; <em>OK</em> en el
              resto de los casos.
            </li>
          </ul>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Arranque sin historial.</strong> Un producto se calcula en automático cuando lleva al menos{" "}
            {settings.minDaysForAuto} días con existencia y tiene ventas en los últimos 90 días; mientras tanto se usan el mínimo, el máximo y el
            punto de reorden manuales de su ficha (modo <em>Manual</em>). En modo <em>Automático</em> la app escribe el punto de reorden y la
            cantidad sugerida en la ficha del producto cada vez que recalcula.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
