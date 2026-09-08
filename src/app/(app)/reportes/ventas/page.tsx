import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth-guards";
import { businessDate, formatPct, formatQty } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { describeRange, formatDay, parseDateRange, rangeDays } from "@/modules/reporting/domain/date-range";
import { pctChange } from "@/modules/reporting/infrastructure/common";
import { getSalesReport } from "@/modules/reporting/infrastructure/sales-report";
import { BackToReports } from "@/modules/reporting/ui/back-to-reports";
import { Equivalents } from "@/modules/reporting/ui/equivalents";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { PeriodFilter } from "@/modules/reporting/ui/period-filter";
import { SalesByDayChart } from "@/modules/reporting/ui/sales-by-day-chart";
import { ShareBar } from "@/modules/reporting/ui/share-bar";

export const metadata = { title: "Reporte de ventas" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SalesReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const params = await searchParams;
  const today = businessDate();
  const range = parseDateRange(params, today);
  const [report, rates] = await Promise.all([getSalesReport(range), getRatesSnapshot()]);
  const t = report.totals;
  const p = report.previousTotals;
  const hasData = t.count > 0 || report.voided.count > 0 || report.returned.count > 0;
  const prev = `${rangeDays(range) === 1 ? "el día anterior" : "el período anterior"} (${describeRange(report.previous)})`;
  const chartData = report.byDay.map((d) => ({ day: d.day, total: Number(d.total), count: d.count }));
  const exportParams = { from: range.from, to: range.to };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description={describeRange(range)}
        actions={
          <>
            <BackToReports />
            <ExportButton report="sales" params={exportParams} disabled={!hasData} />
          </>
        }
      />

      <PeriodFilter range={range} today={today} />

      {!hasData ? (
        <EmptyState
          icon={Receipt}
          title="Aún no hay ventas en este período"
          description="Cambia el período o registra ventas desde el punto de venta para ver el reporte."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Total vendido"
              value={<Money value={t.total} />}
              hint={<Equivalents usd={t.total} rates={rates.rateSet} />}
              delta={pctChange(t.total, p.total)}
              deltaLabel={prev}
            />
            <KpiCard label="Ventas" value={formatQty(t.count)} delta={pctChange(t.count, p.count)} deltaLabel={prev} />
            <KpiCard label="Ticket promedio" value={<Money value={t.avgTicket} />} delta={pctChange(t.avgTicket, p.avgTicket)} deltaLabel={prev} />
            <KpiCard label="Unidades" value={formatQty(t.units, 2)} delta={pctChange(t.units, p.units)} deltaLabel={prev} />
            <KpiCard label="IVA cobrado" value={<Money value={t.tax} />} hint="Incluido en el total" />
            <KpiCard label="Descuentos" value={<Money value={t.discount} />} delta={pctChange(t.discount, p.discount)} deltaLabel={prev} upIsGood={false} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Ventas anuladas</p>
                  <p className="text-sm">
                    {report.voided.count} {report.voided.count === 1 ? "venta" : "ventas"} · no cuentan en el total
                  </p>
                </div>
                <Money value={report.voided.total} className="text-lg font-semibold" />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Devoluciones</p>
                  <p className="text-sm">
                    {report.returned.count} {report.returned.count === 1 ? "devolución" : "devoluciones"} registradas en el período
                  </p>
                </div>
                <Money value={report.returned.total} className="text-lg font-semibold" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por día</CardTitle>
              <CardDescription>Total vendido en USD cada día del período.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SalesByDayChart data={chartData} height={260} label={`Ventas por día, ${describeRange(range)}`} />
              <div className="max-h-72 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Día</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byDay.map((d) => (
                      <TableRow key={d.day}>
                        <TableCell>{formatDay(d.day)}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                        <TableCell className="text-right">
                          <Money value={d.total} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
              <CardDescription>Qué se vendió, quién lo vendió, cómo pagaron y a qué hora.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="productos">
                <div className="overflow-x-auto">
                  <TabsList>
                    <TabsTrigger value="productos">Productos</TabsTrigger>
                    <TabsTrigger value="categorias">Categorías</TabsTrigger>
                    <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
                    <TabsTrigger value="metodos">Métodos de pago</TabsTrigger>
                    <TabsTrigger value="horas">Horas</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="productos">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="hidden w-48 md:table-cell">% del total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byProduct.map((r) => (
                        <TableRow key={r.productId}>
                          <TableCell className="whitespace-normal">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-muted-foreground text-xs">{r.partNumber ?? r.sku}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(r.units, 3)}</TableCell>
                          <TableCell className="text-right">
                            <Money value={r.revenue} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <ShareBar pct={r.share} />
                              <span className="w-14 text-right text-xs tabular-nums">{formatPct(r.share)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(t.units, 3)}</TableCell>
                        <TableCell className="text-right">
                          <Money value={t.total} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell" />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TabsContent>

                <TabsContent value="categorias">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="hidden w-48 md:table-cell">% del total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byCategory.map((r) => (
                        <TableRow key={r.categoryId ?? "none"}>
                          <TableCell className="whitespace-normal font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(r.units, 3)}</TableCell>
                          <TableCell className="text-right">
                            <Money value={r.revenue} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <ShareBar pct={r.share} />
                              <span className="w-14 text-right text-xs tabular-nums">{formatPct(r.share)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="vendedores">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="hidden w-48 md:table-cell">% del total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.bySeller.map((r) => (
                        <TableRow key={r.sellerId}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                          <TableCell className="text-right">
                            <Money value={r.total} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <ShareBar pct={r.share} />
                              <span className="w-14 text-right text-xs tabular-nums">{formatPct(r.share)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="metodos">
                  {report.byMethod.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-center text-sm">No hay pagos registrados en este período.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Método</TableHead>
                          <TableHead>Moneda</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="hidden text-right md:table-cell">Equivalente USD</TableHead>
                          <TableHead className="hidden text-right md:table-cell">Ventas</TableHead>
                          <TableHead className="hidden w-48 md:table-cell">% de los pagos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.byMethod.map((r) => (
                          <TableRow key={`${r.methodId}-${r.currencyCode}`}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.currencyCode === "VES" ? "Bs" : r.currencyCode}</TableCell>
                            <TableCell className="text-right">
                              <Money value={r.amount} currency={r.currencyCode} />
                            </TableCell>
                            <TableCell className="hidden text-right md:table-cell">
                              <Money value={r.amountUsd} />
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums md:table-cell">{r.count}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <ShareBar pct={r.share} />
                                <span className="w-14 text-right text-xs tabular-nums">{formatPct(r.share)}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="horas">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="hidden w-48 md:table-cell">% del total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byHour.map((r) => {
                        const sharePct = Number(t.total) > 0 ? (Number(r.total) / Number(t.total)) * 100 : 0;
                        return (
                          <TableRow key={r.hour}>
                            <TableCell className="tabular-nums">
                              {String(r.hour).padStart(2, "0")}:00 – {String(r.hour).padStart(2, "0")}:59
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                            <TableCell className="text-right">
                              <Money value={r.total} />
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <ShareBar pct={sharePct} />
                                <span className="w-14 text-right text-xs tabular-nums">{formatPct(sharePct)}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
