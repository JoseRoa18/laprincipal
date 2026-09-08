import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { listRateHistoryWithUsers } from "@/modules/settings/infrastructure/rates-history";
import { RatesForm } from "@/modules/settings/ui/rates-form";

export const metadata = { title: "Tasas de cambio" };

const NAME: Record<string, string> = { VES: "Bolívares (Bs)", COP: "Pesos colombianos (COP)" };

export default async function RatesPage() {
  await requireRole("admin");
  const snap = await getRatesSnapshot();
  const nonBase = snap.currencies.filter((c) => !c.isBase);
  const histories = await Promise.all(nonBase.map((c) => listRateHistoryWithUsers(c.code, 60)));

  const formCurrencies = nonBase.map((c) => {
    const current = snap.rates.find((r) => r.currencyCode === c.code);
    return { code: c.code, symbol: c.symbol, currentRate: current?.rate ?? null, currentDate: current?.effectiveDate ?? null };
  });
  const problem =
    snap.missing.length > 0
      ? `No hay tasa cargada para ${snap.missing.join(" y ")}. Sin tasa no se puede cobrar en esa moneda.`
      : snap.stale.length > 0
        ? `La tasa de ${snap.stale.join(" y ")} no es de hoy: se está usando la última cargada.`
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasas de cambio"
        description="Unidades de cada moneda por 1 USD. Cada venta guarda la tasa que se usó."
        actions={
          <Button variant="outline" render={<Link href="/configuracion" />}>
            Volver a configuración
          </Button>
        }
      />

      {problem ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{problem}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tasa del día</CardTitle>
          <CardDescription>Hoy es {formatDate(`${snap.today}T12:00:00`)}. Escribe la tasa BCV o la que use el negocio.</CardDescription>
        </CardHeader>
        <CardContent>
          <RatesForm currencies={formCurrencies} today={snap.today} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {nonBase.map((c, i) => {
          const current = snap.rates.find((r) => r.currencyCode === c.code);
          const rows = histories[i];
          return (
            <Card key={c.code}>
              <CardHeader>
                <CardTitle>{NAME[c.code] ?? c.code}</CardTitle>
                <CardDescription>
                  {current ? (
                    <>
                      Vigente: 1 $ = {formatMoney(current.rate, c.code)} desde el {formatDate(`${current.effectiveDate}T12:00:00`)}
                    </>
                  ) : (
                    "Sin tasa cargada"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Todavía no hay historial.</p>
                ) : (
                  <div className="rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Tasa</TableHead>
                          <TableHead>Cargada por</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              {formatDate(`${r.effectiveDate}T12:00:00`)}
                              {current && r.effectiveDate === current.effectiveDate ? (
                                <Badge className="ml-2">vigente</Badge>
                              ) : r.effectiveDate > snap.today ? (
                                <Badge variant="secondary" className="ml-2">
                                  futura
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(r.rate, c.code)}</TableCell>
                            <TableCell>
                              <div>{r.createdByName ?? (r.source === "bcv_api" ? "BCV automático" : "—")}</div>
                              <div className="text-muted-foreground text-xs">{formatDateTime(r.createdAt)}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
