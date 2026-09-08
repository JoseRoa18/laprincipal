import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireRole } from "@/lib/auth-guards";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { hoursSince } from "@/modules/sales/application/labels";
import { getSaleDetail } from "@/modules/sales/infrastructure/sales-queries";
import { SaleActions } from "@/modules/sales/ui/sales/sale-actions";
import { SaleSuccessBanner } from "@/modules/sales/ui/sales/sale-success-banner";
import { SaleStatusBadge } from "@/modules/sales/ui/status-badge";
import { getPolicies } from "@/modules/settings/infrastructure/settings";

export const metadata = { title: "Detalle de venta" };

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("admin", "seller");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [sale, policies] = await Promise.all([getSaleDetail(id), getPolicies()]);
  if (!sale || sale.status === "held") notFound();

  const isNew = sp.nueva === "1";
  const ageHours = hoursSince(sale.saleDate);
  const canReturn = can(user.role, "return_sale") && (sale.status === "completed" || sale.status === "partially_refunded");
  const canVoid = can(user.role, "void_sale") && sale.status === "completed";
  const returnedUsd = sale.returns.reduce((acc, r) => acc.plus(D(r.totalUsd)), D(0));

  return (
    <div className="space-y-4">
      {isNew ? (
        <SaleSuccessBanner
          saleId={sale.id}
          number={sale.number}
          totalUsd={sale.totalUsd}
          changeUsd={sale.changeUsd}
          changeCurrencyCode={sale.changeCurrencyCode}
          changeAmount={sale.changeAmount}
          autoPrint={sp.imprimir === "1"}
          wantsWhatsapp={sp.whatsapp === "1"}
        />
      ) : null}

      <PageHeader
        title={`Venta ${sale.number ?? ""}`}
        description={`${formatDateTime(sale.saleDate)} · ${sale.seller.name} · ${sale.customer ? sale.customer.name : "Consumidor final"}`}
        actions={
          <Button variant="ghost" render={<Link href="/ventas" />}>
            <ArrowLeft /> Ventas
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SaleStatusBadge status={sale.status} />
        {sale.quoteNumber && sale.quoteId ? (
          <Link href={`/cotizaciones/${sale.quoteId}`} className="text-muted-foreground text-sm hover:underline">
            Desde la cotización {sale.quoteNumber}
          </Link>
        ) : null}
        {sale.status === "voided" ? (
          <span className="text-destructive text-sm">
            Anulada el {formatDateTime(sale.voidedAt)} por {sale.voidedBy?.name ?? "—"}: {sale.voidReason}
          </span>
        ) : null}
      </div>

      <SaleActions
        saleId={sale.id}
        number={sale.number}
        canReturn={canReturn}
        canVoid={canVoid}
        outsideVoidWindow={ageHours > policies.voidWindowHours}
        voidWindowHours={policies.voidWindowHours}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Líneas</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Desc.</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="pr-4 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-4 whitespace-normal">
                      <Link href={`/productos/${item.productId}`} className="font-medium hover:underline">
                        {item.description}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {[item.partNumber, item.sku].filter(Boolean).join(" · ")}
                        {D(item.returnedQty).gt(0) ? ` · devuelto ${formatQty(item.returnedQty, item.unitDecimals)}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(item.quantity, item.unitDecimals)} {item.unitSymbol}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(item.unitPriceUsd, "USD")}</TableCell>
                    <TableCell className="text-right tabular-nums">{D(item.discountUsd).gt(0) ? `-${formatMoney(item.discountUsd, "USD")}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(item.taxUsd, "USD")}</TableCell>
                    <TableCell className="pr-4 text-right font-medium tabular-nums">{formatMoney(item.lineTotalUsd, "USD")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="ml-auto max-w-xs space-y-1 px-4 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <Money value={sale.subtotalUsd} />
              </div>
              {D(sale.discountUsd).gt(0) ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuento</span>
                  <Money value={D(sale.discountUsd).neg()} />
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA incluido</span>
                <Money value={sale.taxUsd} />
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <Money value={sale.totalUsd} />
              </div>
              {D(sale.rateVes).gt(0) ? (
                <div className="text-muted-foreground flex justify-between">
                  <span>En bolívares</span>
                  <Money value={D(sale.totalUsd).mul(sale.rateVes)} currency="VES" />
                </div>
              ) : null}
              {D(sale.rateCop).gt(0) ? (
                <div className="text-muted-foreground flex justify-between">
                  <span>En pesos</span>
                  <Money value={D(sale.totalUsd).mul(sale.rateCop)} currency="COP" />
                </div>
              ) : null}
              {returnedUsd.gt(0) ? (
                <div className="flex justify-between text-sky-700 dark:text-sky-400">
                  <span>Devuelto</span>
                  <Money value={returnedUsd.neg()} />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sale.payments.length === 0 ? <p className="text-muted-foreground">Sin pagos (total cero).</p> : null}
              {sale.payments.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.methodName}</p>
                    <p className="text-muted-foreground text-xs">
                      {p.reference ? `Ref. ${p.reference} · ` : ""}
                      {p.currencyCode !== "USD" ? `tasa ${D(p.exchangeRate).toFixed(p.currencyCode === "COP" ? 0 : 2)} · = ${formatMoney(p.amountUsd, "USD")}` : ""}
                    </p>
                  </div>
                  <Money value={p.amount} currency={p.currencyCode} className="font-medium" />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Pagado</span>
                <Money value={sale.paidUsd} />
              </div>
              {D(sale.changeUsd).gt(0) && sale.changeCurrencyCode ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cambio ({sale.changeCurrencyCode})</span>
                  <span>
                    <Money value={sale.changeAmount} currency={sale.changeCurrencyCode} className="font-medium" />
                    {sale.changeCurrencyCode !== "USD" ? <span className="text-muted-foreground text-xs"> = {formatMoney(sale.changeUsd, "USD")}</span> : null}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Tasas usadas:</span> 1 $ = {formatMoney(sale.rateVes, "VES")}
                {D(sale.rateCop).gt(0) ? ` · ${formatMoney(sale.rateCop, "COP")}` : ""}
              </p>
              <p>
                <span className="text-muted-foreground">Registrada por:</span> {sale.createdBy.name}
              </p>
              {sale.customer ? (
                <p>
                  <span className="text-muted-foreground">Cliente:</span>{" "}
                  <Link href={`/clientes/${sale.customer.id}`} className="hover:underline">
                    {sale.customer.name}
                  </Link>
                  {sale.customer.docType !== "NONE" && sale.customer.docNumber ? ` (${sale.customer.docType}-${sale.customer.docNumber})` : ""}
                  {sale.customer.phone ? ` · ${sale.customer.phone}` : ""}
                </p>
              ) : null}
              {sale.notes ? (
                <p>
                  <span className="text-muted-foreground">Notas:</span> {sale.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {sale.returns.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Devoluciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {sale.returns.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{r.number}</span>
                      <Money value={r.totalUsd} />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(r.createdAt)} · {r.createdByName} · {r.restock ? "reingresó al inventario" : "sin reingreso"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[r.reasonName, r.reasonText].filter(Boolean).join(": ") || "Sin motivo"}
                      {r.refundCurrencyCode && D(r.refundAmount).gt(0) ? ` · reembolso ${formatMoney(r.refundAmount, r.refundCurrencyCode)} (${r.refundMethodName ?? ""})` : " · sin reembolso"}
                    </p>
                    <ul className="mt-1 text-xs">
                      {r.items.map((i, idx) => (
                        <li key={idx}>
                          {formatQty(i.quantity, 3)} × {i.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
