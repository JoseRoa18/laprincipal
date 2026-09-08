import { ClockArrowDown, Lock, Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { D } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getSessionSummary } from "@/modules/cash/application/session-summary";
import { listAuthorizingAdmins, listCashCurrencies } from "@/modules/cash/infrastructure/queries";
import { MovementDialog } from "@/modules/cash/ui/movement-dialog";
import { OpenSessionForm } from "@/modules/cash/ui/open-session-form";
import { SessionClock } from "@/modules/cash/ui/session-clock";
import { getDefaultCashRegister } from "@/modules/core/application/context";

export const metadata = { title: "Caja" };

export default async function CashPage() {
  const user = await requireRole("admin", "seller");
  const register = await getDefaultCashRegister();
  const session = await getOpenCashSession(undefined, register.id);
  const isAdmin = user.role === "admin";

  if (!session) {
    const currencies = await listCashCurrencies();
    return (
      <div className="space-y-6">
        <PageHeader
          title="Caja"
          description={`${register.name} · cerrada`}
          actions={
            isAdmin ? (
              <Button variant="outline" render={<Link href="/caja/historial" />}>
                Historial
              </Button>
            ) : null
          }
        />
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4" /> Abrir caja
            </CardTitle>
            <CardDescription>Registra el fondo inicial en efectivo para empezar a vender.</CardDescription>
          </CardHeader>
          <CardContent>
            {currencies.length === 0 ? (
              <EmptyState
                icon={Lock}
                title="No hay métodos de pago en efectivo activos"
                description="Activa Efectivo USD o Efectivo COP en Configuración → Métodos de pago para poder abrir la caja."
                action={isAdmin ? <Button render={<Link href="/configuracion/metodos-de-pago" />}>Ir a métodos de pago</Button> : undefined}
              />
            ) : (
              <OpenSessionForm currencies={currencies} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = await getSessionSummary(session.id);
  const admins = isAdmin ? [] : await listAuthorizingAdmins();
  const movementCurrencies = summary.currencies.map((c) => ({ code: c.code, symbol: c.symbol }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description={`${summary.session.number ?? ""} · abierta por ${summary.session.openedBy.name} el ${formatDateTime(summary.session.openedAt)}`}
        actions={
          <>
            {isAdmin ? (
              <Button variant="outline" render={<Link href="/caja/historial" />}>
                Historial
              </Button>
            ) : null}
            <Button size="lg" render={<Link href="/caja/cerrar" />}>
              <Lock />
              Cerrar caja
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-medium">Tiempo abierta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-2 text-2xl font-semibold">
              <ClockArrowDown className="text-muted-foreground size-5" />
              <SessionClock since={summary.session.openedAt.toISOString()} />
            </p>
            <p className="text-muted-foreground text-xs">
              {summary.totals.salesCount} {summary.totals.salesCount === 1 ? "venta cobrada" : "ventas cobradas"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-medium">Cobrado en la sesión</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              <Money value={summary.totals.netUsd} currency="USD" />
            </p>
            <p className="text-muted-foreground text-xs">
              {D(summary.totals.refundsUsd).gt(0) ? (
                <>
                  Incluye <Money value={summary.totals.refundsUsd} currency="USD" /> en devoluciones
                </>
              ) : (
                "Equivalente en USD, todos los métodos"
              )}
            </p>
          </CardContent>
        </Card>
        {summary.balances.map((b) => (
          <Card size="sm" key={b.currencyCode}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">Efectivo esperado {b.currencyCode}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                <Money value={b.expected} currency={b.currencyCode} />
              </p>
              <p className="text-muted-foreground text-xs">
                Fondo <Money value={b.opening} currency={b.currencyCode} /> · ventas <Money value={b.salesCash} currency={b.currencyCode} />
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Totales por método de pago</h2>
        {summary.methods.length === 0 ? (
          <EmptyState icon={Wallet} title="Todavía no hay cobros" description="Los pagos de las ventas de esta sesión aparecerán aquí por método y moneda." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Pagos</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">Devuelto</TableHead>
                  <TableHead className="text-right">En USD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.methods.map((m) => (
                  <TableRow key={m.paymentMethodId}>
                    <TableCell className="font-medium">
                      {m.name}
                      {m.countsInDrawer ? (
                        <Badge variant="outline" className="ml-2">
                          Gaveta
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{m.currencyCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                    <TableCell className="text-right">
                      <Money value={m.amount} currency={m.currencyCode} />
                    </TableCell>
                    <TableCell className="text-right">{D(m.refundsAmount).gt(0) ? <Money value={m.refundsAmount} currency={m.currencyCode} /> : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Money value={D(m.amountUsd).minus(m.refundsAmountUsd)} currency="USD" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Ingresos y retiros</h2>
          <div className="flex gap-2">
            <MovementDialog type="in" currencies={movementCurrencies} admins={admins} requiresAuthorization={!isAdmin} />
            <MovementDialog type="out" currencies={movementCurrencies} admins={admins} requiresAuthorization={!isAdmin} />
          </div>
        </div>
        {summary.session.movements.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            Sin movimientos. Usa Ingreso para meter efectivo que no viene de una venta y Retiro para sacar dinero de la caja.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="hidden md:table-cell">Registró</TableHead>
                  <TableHead className="hidden md:table-cell">Autorizó</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.session.movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === "in" ? "outline" : "secondary"}>{m.type === "in" ? "Ingreso" : "Retiro"}</Badge>
                    </TableCell>
                    <TableCell>{m.reason}</TableCell>
                    <TableCell className="hidden md:table-cell">{m.createdByName}</TableCell>
                    <TableCell className="hidden md:table-cell">{m.authorizedByName ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Money value={m.type === "out" ? D(m.amount).neg() : m.amount} currency={m.currencyCode} colored />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
