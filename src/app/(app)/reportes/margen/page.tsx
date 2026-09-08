import { Percent } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth-guards";
import { businessDate, formatPct, formatQty } from "@/lib/format";
import { describeRange, parseDateRange } from "@/modules/reporting/domain/date-range";
import { getMarginReport, type MarginRow } from "@/modules/reporting/infrastructure/margin-report";
import { BackToReports } from "@/modules/reporting/ui/back-to-reports";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { PeriodFilter } from "@/modules/reporting/ui/period-filter";

export const metadata = { title: "Margen bruto" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function MarginTable({ rows, totals, firstColumn }: { rows: MarginRow[]; totals: MarginRow; firstColumn: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{firstColumn}</TableHead>
          <TableHead className="hidden text-right md:table-cell">Unidades</TableHead>
          <TableHead className="text-right">Ingresos sin IVA</TableHead>
          <TableHead className="hidden text-right md:table-cell">Costo</TableHead>
          <TableHead className="text-right">Margen</TableHead>
          <TableHead className="text-right">Margen %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id ?? "none"}>
            <TableCell className="whitespace-normal">
              <div className="font-medium">{r.name}</div>
              {r.detail ? <div className="text-muted-foreground text-xs">{r.detail}</div> : null}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(r.units, 3)}</TableCell>
            <TableCell className="text-right">
              <Money value={r.revenue} />
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              <Money value={r.cost} />
            </TableCell>
            <TableCell className="text-right">
              <Money value={r.margin} colored />
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.marginPct === null ? "—" : formatPct(r.marginPct)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(totals.units, 3)}</TableCell>
          <TableCell className="text-right">
            <Money value={totals.revenue} />
          </TableCell>
          <TableCell className="hidden text-right md:table-cell">
            <Money value={totals.cost} />
          </TableCell>
          <TableCell className="text-right">
            <Money value={totals.margin} colored />
          </TableCell>
          <TableCell className="text-right tabular-nums">{totals.marginPct === null ? "—" : formatPct(totals.marginPct)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export default async function MarginReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const params = await searchParams;
  const today = businessDate();
  const range = parseDateRange(params, today);
  const report = await getMarginReport(range);
  const hasData = report.byProduct.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Margen bruto"
        description={describeRange(range)}
        actions={
          <>
            <BackToReports />
            <ExportButton report="margin" params={{ from: range.from, to: range.to }} disabled={!hasData} />
          </>
        }
      />

      <PeriodFilter range={range} today={today} />

      {!hasData ? (
        <EmptyState icon={Percent} title="Aún no hay ventas en este período" description="Cambia el período para ver el margen." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Ingresos sin IVA" value={<Money value={report.totals.revenue} />} hint="Lo cobrado menos el IVA incluido en el precio" />
            <KpiCard label="Costo de lo vendido" value={<Money value={report.totals.cost} />} hint="Costo promedio al momento de cada venta" />
            <KpiCard label="Margen bruto" value={<Money value={report.totals.margin} colored />} />
            <KpiCard
              label="Margen %"
              value={report.totals.marginPct === null ? "—" : formatPct(report.totals.marginPct)}
              hint="Margen ÷ ingresos sin IVA"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
              <CardDescription>Las devoluciones se descuentan; los productos sin costo registrado muestran margen 100 %.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="productos">
                <TabsList>
                  <TabsTrigger value="productos">Por producto</TabsTrigger>
                  <TabsTrigger value="categorias">Por categoría</TabsTrigger>
                </TabsList>
                <TabsContent value="productos">
                  <MarginTable rows={report.byProduct} totals={report.totals} firstColumn="Producto" />
                </TabsContent>
                <TabsContent value="categorias">
                  <MarginTable rows={report.byCategory} totals={report.totals} firstColumn="Categoría" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
