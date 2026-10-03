import { Landmark, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { BCV_CURRENCY } from "@/modules/currency/domain/bcv";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { listRateHistoryWithUsers, type RateHistoryRow } from "@/modules/settings/infrastructure/rates-history";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { BcvSyncButton } from "@/modules/settings/ui/bcv-sync-button";
import { RatesForm } from "@/modules/settings/ui/rates-form";

export const metadata = { title: "Tasas de cambio" };

const NAME: Record<string, string> = { VES: "Bolívares (Bs)", COP: "Pesos colombianos (COP)" };
const SOURCE_LABEL: Record<string, string> = { bcv: "bcv.org.ve", dolarapi: "ve.dolarapi.com (respaldo)" };

const day = (date: string) => formatDate(`${date}T12:00:00`);

function loadedBy(r: RateHistoryRow): string {
  if (r.source === "bcv_api") return r.createdByName ? `BCV · ${r.createdByName}` : "BCV automático";
  return r.createdByName ?? "—";
}

export default async function RatesPage() {
  await requireRole("admin");
  const [snap, bcvStatus] = await Promise.all([getRatesSnapshot(), getSetting("bcvSync")]);
  const nonBase = snap.currencies.filter((c) => !c.isBase);
  const histories = await Promise.all(nonBase.map((c) => listRateHistoryWithUsers(c.code, 60)));

  const toForm = (c: (typeof nonBase)[number]) => {
    const current = snap.rates.find((r) => r.currencyCode === c.code);
    return { code: c.code, symbol: c.symbol, currentRate: current?.rate ?? null, currentDate: current?.effectiveDate ?? null };
  };
  const bcvCurrency = nonBase.find((c) => c.code === BCV_CURRENCY);
  const manualCurrencies = nonBase.filter((c) => c.code !== BCV_CURRENCY);
  const bcvCurrent = snap.rates.find((r) => r.currencyCode === BCV_CURRENCY);
  // Rows come newest first: the last future one is the next to apply.
  const bcvNext = (histories[nonBase.findIndex((c) => c.code === BCV_CURRENCY)] ?? []).filter((r) => r.effectiveDate > snap.today).at(-1);

  const manualMissing = snap.missing.filter((c) => c !== BCV_CURRENCY);
  const manualStale = snap.stale.filter((c) => c !== BCV_CURRENCY);
  const problem =
    manualMissing.length > 0
      ? `No hay tasa cargada para ${manualMissing.join(" y ")}. Sin tasa no se puede cobrar en esa moneda.`
      : manualStale.length > 0
        ? `La tasa de ${manualStale.join(" y ")} no es de hoy: se está usando la última cargada.`
        : null;
  const bcvBehind = snap.missing.includes(BCV_CURRENCY) || snap.stale.includes(BCV_CURRENCY);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/configuracion", label: "Volver a configuración" }}
        title="Tasas de cambio"
        description="Unidades de cada moneda por 1 USD. Cada venta guarda la tasa que se usó."
      />

      {problem ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{problem}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {bcvCurrency ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="text-muted-foreground size-4" /> Bolívares: tasa oficial del BCV
              </CardTitle>
              <CardDescription>
                Se actualiza sola cada día a las 3:00 a. m. La tasa que el BCV publica en la tarde rige desde su fecha valor: la del viernes, por ejemplo,
                rige desde el lunes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {bcvCurrent ? (
                    <>
                      <span className="text-muted-foreground text-base font-normal">1 $ =</span> {formatMoney(bcvCurrent.rate, BCV_CURRENCY)}
                    </>
                  ) : (
                    "Sin tasa"
                  )}
                </p>
                {bcvCurrent ? (
                  <p className="text-muted-foreground text-sm">
                    Vigente desde el {day(bcvCurrent.effectiveDate)} · {bcvCurrent.source === "bcv_api" ? "BCV" : "cargada a mano"}
                  </p>
                ) : null}
                {bcvNext ? (
                  <p className="mt-1 text-sm">
                    Próxima: <span className="font-medium tabular-nums">{formatMoney(bcvNext.rate, BCV_CURRENCY)}</span> desde el {day(bcvNext.effectiveDate)}
                  </p>
                ) : null}
              </div>

              {bcvStatus.lastError && bcvBehind ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>
                    No se pudo actualizar la tasa del BCV{bcvStatus.lastAttemptAt ? ` (${formatDateTime(bcvStatus.lastAttemptAt)})` : ""}: {bcvStatus.lastError}
                  </p>
                </div>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {bcvStatus.lastSuccessAt
                  ? `Última consulta correcta: ${formatDateTime(bcvStatus.lastSuccessAt)}${bcvStatus.lastSource ? ` en ${SOURCE_LABEL[bcvStatus.lastSource] ?? bcvStatus.lastSource}` : ""}.`
                  : "Todavía no se ha consultado el BCV."}
              </p>
              <BcvSyncButton />

              <details className="border-t pt-2">
                <summary className="cursor-pointer py-2 text-sm font-medium">¿El BCV no responde? Cargar la tasa en Bs a mano</summary>
                <p className="text-muted-foreground mb-3 text-sm">Úsalo solo si la página del BCV está caída. La próxima consulta al BCV para esa fecha la reemplaza.</p>
                <RatesForm currencies={[toForm(bcvCurrency)]} today={snap.today} />
              </details>
            </CardContent>
          </Card>
        ) : null}

        {manualCurrencies.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{manualCurrencies.length === 1 ? `${NAME[manualCurrencies[0].code] ?? manualCurrencies[0].code}: tasa manual` : "Tasas manuales"}</CardTitle>
              <CardDescription>Hoy es {day(snap.today)}. Escribe la tasa que usa el negocio.</CardDescription>
            </CardHeader>
            <CardContent>
              <RatesForm currencies={manualCurrencies.map(toForm)} today={snap.today} />
            </CardContent>
          </Card>
        ) : null}
      </div>

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
                      Vigente: 1 $ = {formatMoney(current.rate, c.code)} desde el {day(current.effectiveDate)}
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
                              {day(r.effectiveDate)}
                              {current && r.effectiveDate === current.effectiveDate ? (
                                <Badge className="ml-2">vigente</Badge>
                              ) : r.effectiveDate > snap.today ? (
                                <Badge variant="secondary" className="ml-2">
                                  próxima
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(r.rate, c.code)}</TableCell>
                            <TableCell>
                              <div>{loadedBy(r)}</div>
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
