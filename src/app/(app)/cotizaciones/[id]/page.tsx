import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { formatDateOnly } from "@/modules/sales/application/labels";
import { getQuoteDetail } from "@/modules/sales/infrastructure/quotes-queries";
import { QuoteActions } from "@/modules/sales/ui/quotes/quote-actions";
import { QuoteStatusBadge } from "@/modules/sales/ui/status-badge";

export const metadata = { title: "Cotización" };

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "seller");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const quote = await getQuoteDetail(id);
  if (!quote) notFound();
  const isOpen = quote.status === "open" || quote.status === "accepted";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Cotización ${quote.number ?? ""}`}
        description={`${formatDateTime(quote.createdAt)} · ${quote.seller.name} · ${quote.customer ? quote.customer.name : "Consumidor final"}`}
        actions={
          <Button variant="ghost" render={<Link href="/cotizaciones" />}>
            <ArrowLeft /> Cotizaciones
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <QuoteStatusBadge status={quote.status} />
        <span className="text-muted-foreground">Válida hasta {formatDateOnly(quote.validUntil)}</span>
        {quote.reservesStock && isOpen ? <span className="text-muted-foreground">· reserva stock</span> : null}
      </div>

      <QuoteActions quoteId={quote.id} number={quote.number} isOpen={isOpen} convertedSale={quote.convertedSale} />

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
                  <TableHead className="hidden text-right md:table-cell">Desc.</TableHead>
                  <TableHead className="pr-4 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-4 whitespace-normal">
                      <Link href={`/productos/${item.productId}`} className="font-medium hover:underline">
                        {item.description}
                      </Link>
                      <p className="text-muted-foreground text-xs">{[item.partNumber, item.sku].filter(Boolean).join(" · ")}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(item.quantity, item.unitDecimals)} {item.unitSymbol}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(item.unitPriceUsd, "USD")}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {D(item.discountValue).gt(0) ? (item.discountType === "pct" ? `${D(item.discountValue).toString()} %` : `-${formatMoney(item.discountValue, "USD")}`) : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-medium tabular-nums">{formatMoney(item.lineTotalUsd, "USD")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="ml-auto max-w-xs space-y-1 px-4 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <Money value={quote.subtotalUsd} />
              </div>
              {D(quote.discountUsd).gt(0) ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuento</span>
                  <Money value={D(quote.discountUsd).neg()} />
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA incluido</span>
                <Money value={quote.taxUsd} />
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <Money value={quote.totalUsd} />
              </div>
              {D(quote.rateVes).gt(0) ? (
                <div className="text-muted-foreground flex justify-between">
                  <span>En bolívares (1 $ = {formatMoney(quote.rateVes, "VES")})</span>
                  <Money value={D(quote.totalUsd).mul(quote.rateVes)} currency="VES" />
                </div>
              ) : null}
              {D(quote.rateCop).gt(0) ? (
                <div className="text-muted-foreground flex justify-between">
                  <span>En pesos</span>
                  <Money value={D(quote.totalUsd).mul(quote.rateCop)} currency="COP" />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {quote.customer ? (
              <p>
                <span className="text-muted-foreground">Cliente:</span>{" "}
                <Link href={`/clientes/${quote.customer.id}`} className="hover:underline">
                  {quote.customer.name}
                </Link>
                {quote.customer.docType !== "NONE" && quote.customer.docNumber ? ` (${quote.customer.docType}-${quote.customer.docNumber})` : ""}
                {quote.customer.phone ? ` · ${quote.customer.phone}` : ""}
              </p>
            ) : (
              <p>
                <span className="text-muted-foreground">Cliente:</span> Consumidor final
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Vendedor:</span> {quote.seller.name}
            </p>
            <p>
              <span className="text-muted-foreground">Válida hasta:</span> {formatDateOnly(quote.validUntil)}
            </p>
            {quote.notes ? (
              <p className="whitespace-pre-line">
                <span className="text-muted-foreground">Notas:</span> {quote.notes}
              </p>
            ) : null}
            {quote.convertedSale ? (
              <p>
                <span className="text-muted-foreground">Venta:</span>{" "}
                <Link href={`/ventas/${quote.convertedSale.id}`} className="hover:underline">
                  {quote.convertedSale.number}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
