import { FileText, Receipt, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, parsePage } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { businessDate, formatDateTime, formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import { listActivePaymentMethods } from "@/modules/sales/infrastructure/payment-methods";
import { listSales, listSellers, type SaleStatus } from "@/modules/sales/infrastructure/sales-queries";
import { SalesFilters } from "@/modules/sales/ui/sales/sales-filters";
import { SaleStatusBadge } from "@/modules/sales/ui/status-badge";

export const metadata = { title: "Ventas" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES: SaleStatus[] = ["completed", "partially_refunded", "refunded", "voided"];

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin", "seller");
  const params = await searchParams;
  const today = businessDate();
  const from = DATE.test(str(params.desde)) ? str(params.desde) : today;
  const to = DATE.test(str(params.hasta)) ? str(params.hasta) : today;
  const statusRaw = str(params.estado);
  const status = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as SaleStatus) : "all";
  const sellerId = UUID.test(str(params.vendedor)) ? str(params.vendedor) : "";
  const paymentMethodId = UUID.test(str(params.metodo)) ? str(params.metodo) : "";
  const page = parsePage(params.page);

  const [{ rows, total, sumUsd }, sellers, methods] = await Promise.all([
    listSales({ from: from <= to ? from : to, to: from <= to ? to : from, status, sellerId: sellerId || null, paymentMethodId: paymentMethodId || null, page, pageSize: DEFAULT_PAGE_SIZE }),
    listSellers(),
    listActivePaymentMethods(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ventas"
        description={`${total} ${total === 1 ? "venta" : "ventas"} en el período · vendido ${formatMoney(sumUsd, "USD")}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/cotizaciones" />}>
              <FileText /> Cotizaciones
            </Button>
            <Button render={<Link href="/vender" />}>
              <ShoppingCart /> Nueva venta
            </Button>
          </>
        }
      />
      <SalesFilters values={{ from, to, status, sellerId, paymentMethodId }} sellers={sellers} methods={methods} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No hay ventas en este período"
          description="Cambia el rango de fechas o registra una venta desde el punto de venta."
          action={
            <Button render={<Link href="/vender" />}>
              <ShoppingCart /> Ir a vender
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pagos</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/ventas/${r.id}`} className="font-medium hover:underline">
                      {r.number ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(r.saleDate)}</TableCell>
                  <TableCell className="max-w-48 truncate">{r.customerName ?? "Consumidor final"}</TableCell>
                  <TableCell className="max-w-40 truncate">{r.sellerName}</TableCell>
                  <TableCell className="text-right">
                    <Money value={r.totalUsd} currency="USD" className="font-medium" />
                    {D(r.rateVes).gt(0) ? (
                      <span className="text-muted-foreground block text-xs">
                        <Money value={D(r.totalUsd).mul(r.rateVes)} currency="VES" />
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-56 truncate text-xs">{r.paymentMethods.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <SaleStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="text-muted-foreground flex justify-between border-t px-3 py-2 text-sm">
            <span>Total del período (ventas completadas)</span>
            <Money value={sumUsd} currency="USD" className="text-foreground font-semibold" />
          </div>
        </div>
      )}
      <Pagination page={page} total={total} basePath="/ventas" params={params} />
    </div>
  );
}
