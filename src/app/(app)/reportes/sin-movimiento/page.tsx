import { PackageX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatQty } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { getNoMovementReport } from "@/modules/reporting/infrastructure/no-movement-report";
import { BackToReports } from "@/modules/reporting/ui/back-to-reports";
import { Equivalents } from "@/modules/reporting/ui/equivalents";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { ParamSelect } from "@/modules/reporting/ui/param-select";
import { getStatsSettings } from "@/modules/settings/infrastructure/settings";

export const metadata = { title: "Productos sin movimiento" };

const DAY_OPTIONS = [30, 60, 90, 180, 365];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseDays(value: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 7 && n <= 730 ? n : fallback;
}

export default async function NoMovementReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [params, settings] = await Promise.all([searchParams, getStatsSettings()]);
  const days = parseDays(params.days, settings.noMovementDays);
  const [report, rates] = await Promise.all([getNoMovementReport({ days }), getRatesSnapshot()]);
  const options = [...new Set([...DAY_OPTIONS, settings.noMovementDays, days])].sort((a, b) => a - b).map((d) => ({ value: String(d), label: `${d} días` }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos sin movimiento"
        description={`Con existencia y sin ventas en los últimos ${days} días.`}
        actions={
          <>
            <BackToReports />
            <ExportButton report="no_movement" params={{ days: String(days) }} disabled={report.count === 0} />
          </>
        }
      />

      <ParamSelect param="days" label="Sin vender desde hace" options={options} hideAll defaultValue={String(settings.noMovementDays)} />

      {report.count === 0 ? (
        <EmptyState
          icon={PackageX}
          title={`Ningún producto lleva ${days} días sin venderse`}
          description="Buena señal: todo lo que hay en existencia se ha vendido en ese período. Prueba con un plazo más corto."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard label="Productos sin movimiento" value={formatQty(report.count)} hint={`Con existencia y sin ventas desde el ${formatDate(new Date(`${report.cutoff}T12:00:00-04:00`))}`} />
            <KpiCard
              label="Dinero inmovilizado"
              value={<Money value={report.totalValue} />}
              hint={<Equivalents usd={report.totalValue} rates={rates.rateSet} />}
            />
          </div>

          <Card>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Producto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="text-right">Valor a costo</TableHead>
                    <TableHead>Última venta</TableHead>
                    <TableHead className="hidden md:table-cell">Última entrada</TableHead>
                    <TableHead className="pr-4 text-right">Días sin vender</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="max-w-64 pl-4 whitespace-normal">
                        <Link href={`/productos/${r.productId}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">{r.partNumber ?? r.sku}</div>
                      </TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">{r.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(r.quantity, r.unitDecimals)}</TableCell>
                      <TableCell className="text-right">
                        <Money value={r.value} />
                      </TableCell>
                      <TableCell>{r.lastSaleAt ? formatDate(r.lastSaleAt) : <span className="text-muted-foreground">Nunca</span>}</TableCell>
                      <TableCell className="hidden md:table-cell">{r.lastInboundAt ? formatDate(r.lastInboundAt) : "—"}</TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular-nums">{r.idleDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-4">Total ({report.count} productos)</TableCell>
                    <TableCell className="hidden md:table-cell" />
                    <TableCell />
                    <TableCell className="text-right">
                      <Money value={report.totalValue} />
                    </TableCell>
                    <TableCell />
                    <TableCell className="hidden md:table-cell" />
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
