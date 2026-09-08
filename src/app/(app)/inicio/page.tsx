import { Package, ShoppingCart, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { AnimatedMoney } from "@/components/app/animated-money";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireUser } from "@/lib/auth-guards";
import { formatDateTime, formatQty } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { formatDay } from "@/modules/reporting/domain/date-range";
import { getDashboardData } from "@/modules/reporting/infrastructure/dashboard";
import { Equivalents } from "@/modules/reporting/ui/equivalents";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { SalesByDayChart } from "@/modules/reporting/ui/sales-by-day-chart";

export const metadata = { title: "Inicio" };

function elapsed(since: Date): string {
  const minutes = Math.max(Math.floor((Date.now() - since.getTime()) / 60_000), 0);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${m} min`;
}

export default async function HomePage() {
  const user = await requireUser();
  const [rates, data] = await Promise.all([getRatesSnapshot(), getDashboardData()]);
  const firstName = user.name.split(" ")[0];
  const showSales = user.role !== "warehouse";
  const showCosts = can(user.role, "view_costs");
  const buyHref = user.role === "admin" ? "/reportes/velocidad?status=buy_now" : "/inventario";
  const chartData = data.byDay.map((d) => ({ day: d.day, total: Number(d.total), count: d.count }));

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${firstName}`} description="Resumen del día" />

      {rates.missing.length > 0 && user.role === "admin" ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <TriangleAlert className="text-destructive size-5 shrink-0" />
              <div>
                <p className="font-medium">Falta la tasa de cambio de hoy</p>
                <p className="text-muted-foreground text-sm">
                  Sin tasa para {rates.missing.join(" y ")} no se puede vender ni mostrar precios en Bs o pesos.
                </p>
              </div>
            </div>
            <Button render={<Link href="/configuracion/tasas" />}>Cargar tasa</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="stagger grid gap-4 *:animate-in *:fade-in-0 *:slide-in-from-bottom-2 *:duration-500 sm:grid-cols-2 lg:grid-cols-4">
        {showSales ? (
          <KpiCard
            label="Ventas de hoy"
            value={<AnimatedMoney value={data.salesToday.total} />}
            hint={
              <>
                {data.salesToday.count} {data.salesToday.count === 1 ? "venta" : "ventas"}
                {data.salesToday.count > 0 ? (
                  <>
                    {" · ticket promedio "}
                    <Money value={data.salesToday.avgTicket} />
                  </>
                ) : null}
                <div>
                  <Equivalents usd={data.salesToday.total} rates={rates.rateSet} />
                </div>
              </>
            }
            delta={data.salesToday.changePct}
            deltaLabel={data.salesToday.comparedTo}
          />
        ) : (
          <KpiCard label="Unidades vendidas hoy" value={formatQty(data.unitsToday, 2)} hint={`${data.salesToday.count} ventas`} />
        )}
        {showSales ? (
          <KpiCard
            label="Ventas del mes"
            value={<AnimatedMoney value={data.salesMonth.total} />}
            hint={
              <>
                {data.salesMonth.count === 0 ? "Sin ventas registradas" : `${data.salesMonth.count} ventas`}
                <div>
                  <Equivalents usd={data.salesMonth.total} rates={rates.rateSet} />
                </div>
              </>
            }
            delta={data.salesMonth.changePct}
            deltaLabel={data.salesMonth.comparedTo}
          />
        ) : (
          <KpiCard label="Por comprar pronto" value={formatQty(data.soon)} hint="Cobertura de una semana o menos" />
        )}
        <Link href={buyHref} className="group focus-visible:outline-none">
          <KpiCard
            className="h-full transition-colors group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-ring"
            label="Productos por comprar"
            value={formatQty(data.buyNow)}
            hint={data.soon > 0 ? `${data.soon} más pronto · según mínimos y velocidad de venta` : "Según mínimos y velocidad de venta"}
          />
        </Link>
        {showCosts ? (
          <KpiCard
            label="Valor del inventario"
            value={<AnimatedMoney value={data.inventoryValue} />}
            hint={
              <>
                A costo promedio
                <div>
                  <Equivalents usd={data.inventoryValue} rates={rates.rateSet} />
                </div>
              </>
            }
          />
        ) : (
          <KpiCard label="Unidades vendidas hoy" value={formatQty(data.unitsToday, 2)} />
        )}
      </div>

      <div className="stagger grid gap-4 *:animate-in *:fade-in-0 *:slide-in-from-bottom-2 *:duration-500 lg:grid-cols-3">
        {showSales ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Últimos 14 días</CardTitle>
              <CardDescription>Total vendido cada día en USD.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <SalesByDayChart data={chartData} height={190} label="Ventas por día de los últimos 14 días" />
              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer select-none">Ver tabla</summary>
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Día</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byDay.map((d) => (
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
              </details>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {user.role !== "warehouse" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="size-4" /> Caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.cash.open ? (
                  <>
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">Caja abierta</p>
                    <p className="text-muted-foreground text-sm">
                      {data.cash.number ? `${data.cash.number} · ` : ""}
                      abierta por {data.cash.openedBy || "—"} hace {elapsed(data.cash.openedAt)} ({formatDateTime(data.cash.openedAt)})
                    </p>
                    <Button variant="outline" render={<Link href="/caja" />}>
                      Ver caja
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Caja cerrada</p>
                    <p className="text-muted-foreground text-sm">Abre la caja con el fondo en USD y COP antes de vender.</p>
                    <Button variant="outline" render={<Link href="/caja" />}>
                      Abrir caja
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Más vendidos esta semana</CardTitle>
              <CardDescription>Unidades de los últimos 7 días.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aún no hay ventas esta semana.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {data.topProducts.map((p, i) => (
                    <li key={p.productId} className="flex items-center gap-3">
                      <span className="text-muted-foreground w-4 text-right tabular-nums">{i + 1}</span>
                      <Link href={`/productos/${p.productId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {p.name}
                      </Link>
                      <span className="tabular-nums">{formatQty(p.units, 2)} u</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {user.role !== "warehouse" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="size-4" /> Vender
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">Abre el punto de venta para atender en el mostrador.</p>
              <Button size="lg" className="w-full sm:w-auto" render={<Link href="/vender" />}>
                Ir a vender
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {user.role !== "seller" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4" /> Registrar productos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">Toma la foto con el celular y la app la deja con fondo blanco.</p>
              <Button size="lg" variant="outline" className="w-full sm:w-auto" render={<Link href="/productos/nuevo" />}>
                Nuevo producto
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
