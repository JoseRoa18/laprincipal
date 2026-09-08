import { Money } from "@/components/app/money";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import type { ClosingReference, CurrencyBalance, MethodTotal, SessionTotals } from "@/modules/cash/domain/summary";
import type { MovementView } from "@/modules/cash/infrastructure/queries";

export interface ReportBalance extends CurrencyBalance {
  counted: string | null;
  difference: string | null;
  justification: string | null;
}

export interface ReportData {
  companyName: string;
  number: string | null;
  status: "open" | "closed";
  openedAt: Date;
  openedByName: string;
  closedAt: Date | null;
  closedByName: string | null;
  notes: string | null;
  closingNotes: string | null;
  balances: ReportBalance[];
  methods: MethodTotal[];
  totals: SessionTotals;
  references: ClosingReference[];
  movements: MovementView[];
  reconciled: Record<string, boolean>;
}

const PRINT_CSS = `
@media print {
  @page { margin: 12mm; }
  [data-slot="sidebar-gap"], [data-slot="sidebar-container"], header, nav, .no-print { display: none !important; }
  [data-slot="sidebar-inset"], main { margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
  #cash-report { padding: 0 !important; border: 0 !important; box-shadow: none !important; }
  #cash-report table { page-break-inside: auto; }
  #cash-report tr { page-break-inside: avoid; }
}
`;

/** Printable closing report. Server component: give it plain data. */
export function ClosingReport({ data }: { data: ReportData }) {
  const cashMethods = data.methods.filter((m) => m.countsInDrawer);
  const electronic = data.methods.filter((m) => !m.countsInDrawer);

  return (
    <article id="cash-report" className="bg-card space-y-6 rounded-xl border p-4 text-sm md:p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-muted-foreground text-xs uppercase">{data.companyName}</p>
          <h2 className="text-lg font-semibold">Cierre de caja {data.number ?? ""}</h2>
          {data.status === "open" ? <Badge variant="secondary">Sesión abierta · totales en vivo</Badge> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Apertura</dt>
          <dd>
            {formatDateTime(data.openedAt)} · {data.openedByName}
          </dd>
          <dt className="text-muted-foreground">Cierre</dt>
          <dd>{data.closedAt ? `${formatDateTime(data.closedAt)} · ${data.closedByName ?? ""}` : "—"}</dd>
        </dl>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ventas cobradas" value={<Money value={data.totals.paymentsUsd} currency="USD" />} hint={`${data.totals.salesCount} ${data.totals.salesCount === 1 ? "venta" : "ventas"}`} />
        <Stat label="Devoluciones" value={<Money value={data.totals.refundsUsd} currency="USD" />} hint={`${data.totals.refundsCount} ${data.totals.refundsCount === 1 ? "devolución" : "devoluciones"}`} />
        <Stat label="Neto del día" value={<Money value={data.totals.netUsd} currency="USD" />} hint="Cobros menos devoluciones, en USD" />
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Efectivo por moneda</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2">Concepto</th>
                {data.balances.map((b) => (
                  <th key={b.currencyCode} className="p-2 text-right">
                    {b.currencyCode}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Fondo inicial" values={data.balances.map((b) => [b.currencyCode, b.opening])} />
              <Row label="+ Ventas en efectivo" values={data.balances.map((b) => [b.currencyCode, b.salesCash])} />
              <Row label="− Cambio entregado" values={data.balances.map((b) => [b.currencyCode, b.changeGiven])} />
              <Row label="− Devoluciones en efectivo" values={data.balances.map((b) => [b.currencyCode, b.refundsCash])} />
              <Row label="+ Ingresos" values={data.balances.map((b) => [b.currencyCode, b.movementsIn])} />
              <Row label="− Retiros" values={data.balances.map((b) => [b.currencyCode, b.movementsOut])} />
              <Row label="= Esperado" values={data.balances.map((b) => [b.currencyCode, b.expected])} strong />
              <Row label="Contado" values={data.balances.map((b) => [b.currencyCode, b.counted])} strong />
              <tr className="border-t">
                <td className="p-2 font-medium">Diferencia</td>
                {data.balances.map((b) => (
                  <td key={b.currencyCode} className="p-2 text-right font-medium">
                    {b.difference === null ? "—" : D(b.difference).isZero() ? <span className="text-emerald-700 dark:text-emerald-400">Cuadra</span> : <Money value={b.difference} currency={b.currencyCode} colored />}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {data.balances.some((b) => b.justification) ? (
          <ul className="space-y-1 text-sm">
            {data.balances
              .filter((b) => b.justification)
              .map((b) => (
                <li key={b.currencyCode}>
                  <span className="font-medium">{b.currencyCode}:</span> {b.justification}
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Totales por método de pago</h3>
        {data.methods.length === 0 ? (
          <p className="text-muted-foreground">No se registraron pagos en esta sesión.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">Método</th>
                  <th className="p-2 text-right">Pagos</th>
                  <th className="p-2 text-right">Cobrado</th>
                  <th className="p-2 text-right">Devuelto</th>
                  <th className="p-2 text-right">En USD</th>
                  <th className="p-2 text-center">Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {[...cashMethods, ...electronic].map((m) => (
                  <tr key={m.paymentMethodId} className="border-t">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2 text-right tabular-nums">{m.count}</td>
                    <td className="p-2 text-right">{formatMoney(m.amount, m.currencyCode)}</td>
                    <td className="p-2 text-right">{D(m.refundsAmount).gt(0) ? formatMoney(m.refundsAmount, m.currencyCode) : "—"}</td>
                    <td className="p-2 text-right">{formatMoney(D(m.amountUsd).minus(m.refundsAmountUsd), "USD")}</td>
                    <td className="p-2 text-center">{m.countsInDrawer ? "—" : data.reconciled[m.paymentMethodId] ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.references.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Referencias de pagos electrónicos</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">Hora</th>
                  <th className="p-2">Venta</th>
                  <th className="p-2">Método</th>
                  <th className="p-2">Referencia</th>
                  <th className="p-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.references.map((r, i) => (
                  <tr key={`${r.saleNumber}-${i}`} className="border-t">
                    <td className="p-2">{r.at ? formatDateTime(r.at).slice(11) : ""}</td>
                    <td className="p-2">{r.saleNumber ?? "—"}</td>
                    <td className="p-2">{r.methodName}</td>
                    <td className="p-2 font-mono text-xs">{r.reference ?? "—"}</td>
                    <td className="p-2 text-right">{formatMoney(r.amount, r.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.movements.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Ingresos y retiros</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">Hora</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Registró</th>
                  <th className="p-2">Autorizó</th>
                  <th className="p-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">{formatDateTime(m.createdAt).slice(11)}</td>
                    <td className="p-2">{m.type === "in" ? "Ingreso" : "Retiro"}</td>
                    <td className="p-2">{m.reason}</td>
                    <td className="p-2">{m.createdByName}</td>
                    <td className="p-2">{m.authorizedByName ?? "—"}</td>
                    <td className="p-2 text-right">{formatMoney(m.type === "out" ? D(m.amount).neg() : m.amount, m.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.notes || data.closingNotes ? (
        <section className="space-y-1">
          <h3 className="font-semibold">Notas</h3>
          {data.notes ? <p className="whitespace-pre-line">Apertura: {data.notes}</p> : null}
          {data.closingNotes ? <p className="whitespace-pre-line">Cierre: {data.closingNotes}</p> : null}
        </section>
      ) : null}

      <footer className="hidden grid-cols-2 gap-12 pt-10 text-center text-xs print:grid">
        <div className="border-t pt-2">Entrega: {data.closedByName ?? data.openedByName}</div>
        <div className="border-t pt-2">Recibe / supervisa</div>
      </footer>
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function Row({ label, values, strong }: { label: string; values: Array<[string, string | null]>; strong?: boolean }) {
  return (
    <tr className="border-t">
      <td className={strong ? "p-2 font-medium" : "p-2"}>{label}</td>
      {values.map(([code, v]) => (
        <td key={code} className={strong ? "p-2 text-right font-medium tabular-nums" : "p-2 text-right tabular-nums"}>
          {v === null ? "—" : formatMoney(v, code)}
        </td>
      ))}
    </tr>
  );
}
