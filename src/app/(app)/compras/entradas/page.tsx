import { PackagePlus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatMoney } from "@/lib/format";
import { UrlSelect } from "@/modules/inventory/ui/filters";
import { RECEIPT_STATUS_LABEL, type ReceiptStatus } from "@/modules/purchasing/infrastructure/labels";
import { listReceipts } from "@/modules/purchasing/infrastructure/receipts";
import { listActiveSuppliers } from "@/modules/purchasing/infrastructure/suppliers";
import { ReceiptStatusBadge } from "@/modules/purchasing/ui/status-badge";

export const metadata = { title: "Entradas por compra" };

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const STATUSES: ReceiptStatus[] = ["draft", "applied", "voided"];

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const status = STATUSES.includes(params.status as ReceiptStatus) ? (params.status as ReceiptStatus) : "";
  const supplierId = str(params.supplier);
  const [{ rows, total }, suppliers] = await Promise.all([listReceipts({ status, supplierId: supplierId || undefined, page }), listActiveSuppliers()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entradas por compra"
        description="Mercancía recibida con el documento del proveedor"
        actions={
          <Button render={<Link href="/compras/entradas/nueva" />}>
            <PackagePlus data-icon="inline-start" /> Nueva entrada
          </Button>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <UrlSelect param="status" placeholder="Todos los estados" options={STATUSES.map((s) => ({ value: s, label: RECEIPT_STATUS_LABEL[s] }))} />
        <UrlSelect param="supplier" placeholder="Todos los proveedores" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title={status || supplierId ? "Sin entradas con esos filtros" : "Todavía no hay entradas"}
          description="Cuando llegue mercancía, regístrala con el documento del proveedor: el stock y el costo promedio se actualizan al aplicarla."
          action={<Button render={<Link href="/compras/entradas/nueva" />}>Nueva entrada</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Moneda / tasa</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead className="text-right">Total USD</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/compras/entradas/${r.id}`} className="font-medium hover:underline">
                    {r.number ?? "Borrador"}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{formatDate(r.receiptDate)}</TableCell>
                <TableCell>{r.supplierName}</TableCell>
                <TableCell className="text-muted-foreground">{r.supplierDocument ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {r.currencyCode}
                  {r.currencyCode !== "USD" ? ` · ${formatMoney(r.exchangeRate, r.currencyCode, { symbol: "" }).trim()}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.itemCount}</TableCell>
                <TableCell className="text-right">
                  <Money value={r.totalUsd} currency="USD" />
                </TableCell>
                <TableCell>
                  <ReceiptStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/compras/entradas" params={params} />
    </div>
  );
}
