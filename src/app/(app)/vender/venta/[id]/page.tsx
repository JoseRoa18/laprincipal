import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { userCanOpenSale } from "@/modules/sales/application/sale-access";
import { getSaleDetail } from "@/modules/sales/infrastructure/sales-queries";
import { SaleSuccessBanner } from "@/modules/sales/ui/sales/sale-success-banner";

export const metadata = { title: "Venta registrada" };

/**
 * Receipt screen right after charging: change to hand over, ticket, delivery
 * note and WhatsApp. Sellers reach only today's sales they made; the sales
 * history (/ventas) is for the admin.
 */
export default async function SaleDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("admin", "seller");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sale = await getSaleDetail(id);
  if (!sale || sale.status === "held" || !userCanOpenSale(user, sale)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        back={{ href: "/vender", label: "Volver a vender" }}
        title={`Venta ${sale.number ?? ""}`}
        description={`${formatDateTime(sale.saleDate)} · ${sale.seller.name} · ${sale.customer ? sale.customer.name : "Consumidor final"}`}
        actions={
          user.role === "admin" ? (
            <Button variant="outline" render={<Link href={`/ventas/${sale.id}`} />}>
              Ver detalle completo
            </Button>
          ) : null
        }
      />

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

      <Card>
        <CardContent className="space-y-4 px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 whitespace-normal">
                    <div className="font-medium">{item.description}</div>
                    <div className="text-muted-foreground text-xs">{[item.partNumber, item.sku].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(item.quantity, item.unitDecimals)} {item.unitSymbol}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-medium tabular-nums">{formatMoney(item.lineTotalUsd, "USD")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid gap-4 px-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium">Pagos</p>
              {sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {p.methodName}
                    {p.reference ? ` · ref. ${p.reference}` : ""}
                  </span>
                  <Money value={p.amount} currency={p.currencyCode} />
                </div>
              ))}
              {D(sale.changeUsd).gt(0) && sale.changeCurrencyCode ? (
                <div className="flex justify-between gap-2 font-medium">
                  <span>Cambio entregado</span>
                  <Money value={sale.changeAmount} currency={sale.changeCurrencyCode} />
                </div>
              ) : null}
            </div>
            <div className="space-y-1 sm:text-right">
              <div className="flex justify-between gap-2 text-base font-semibold sm:justify-end sm:gap-6">
                <span>Total</span>
                <Money value={sale.totalUsd} />
              </div>
              {D(sale.rateVes).gt(0) ? (
                <div className="text-muted-foreground flex justify-between gap-2 sm:justify-end sm:gap-6">
                  <span>En bolívares</span>
                  <Money value={D(sale.totalUsd).mul(sale.rateVes)} currency="VES" />
                </div>
              ) : null}
              <p className="text-muted-foreground text-xs">IVA incluido: {formatMoney(sale.taxUsd, "USD")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
