import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { businessDate, formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { RECEIPT_STATUS_LABEL } from "@/modules/purchasing/infrastructure/labels";
import { getReceipt } from "@/modules/purchasing/infrastructure/receipts";
import { listActiveSuppliers } from "@/modules/purchasing/infrastructure/suppliers";
import { VoidReceiptDialog } from "@/modules/purchasing/ui/receipt-actions";
import { ReceiptForm } from "@/modules/purchasing/ui/receipt-form";
import { ReceiptStatusBadge } from "@/modules/purchasing/ui/status-badge";

export const metadata = { title: "Entrada por compra" };

function trimZeros(v: string) {
  return v.includes(".") ? v.replace(/\.?0+$/, "") : v;
}

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "warehouse");
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();

  if (receipt.status === "draft") {
    const [suppliers, rates] = await Promise.all([listActiveSuppliers(), getRatesSnapshot(receipt.receiptDate)]);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Entrada en borrador"
          description={`Creada por ${receipt.createdByName} el ${formatDateTime(receipt.createdAt)}. Revisa y aplica cuando la mercancía esté contada.`}
          actions={<ReceiptStatusBadge status={receipt.status} />}
        />
        <ReceiptForm
          suppliers={suppliers}
          currencies={rates.currencies.map((c) => c.code)}
          today={businessDate()}
          rates={rates.rateSet}
          initial={{
            id: receipt.id,
            supplierId: receipt.supplierId,
            supplierDocument: receipt.supplierDocument ?? "",
            receiptDate: receipt.receiptDate,
            currencyCode: receipt.currencyCode,
            exchangeRate: trimZeros(receipt.exchangeRate),
            extraCostsUsd: trimZeros(receipt.extraCostsUsd),
            notes: receipt.notes ?? "",
            lines: receipt.items.map((it) => ({
              key: it.id,
              productId: it.productId,
              name: it.productName,
              sku: it.sku,
              partNumber: it.partNumber,
              unitSymbol: it.unitSymbol,
              unitDecimals: it.unitDecimals,
              currentStock: "0",
              costAvgUsd: "0",
              quantity: trimZeros(it.quantity),
              unitCostAmount: trimZeros(it.unitCostAmount),
            })),
          }}
        />
      </div>
    );
  }

  const isVes = receipt.currencyCode !== "USD";
  const description = [
    receipt.supplierName,
    `Fecha ${formatDate(receipt.receiptDate)}`,
    receipt.supplierDocument ? `Documento ${receipt.supplierDocument}` : null,
    isVes ? `${receipt.currencyCode} a ${formatMoney(receipt.exchangeRate, receipt.currencyCode, { symbol: "" }).trim()} por 1 $` : "USD",
    receipt.status === "applied" ? `Aplicada el ${formatDateTime(receipt.appliedAt)}` : `Anulada por ${receipt.voidedByName ?? ""} el ${formatDateTime(receipt.voidedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Entrada ${receipt.number ?? ""}`.trim()}
        description={description}
        actions={
          <>
            <ReceiptStatusBadge status={receipt.status} />
            {receipt.status === "applied" && user.role === "admin" ? <VoidReceiptDialog receiptId={receipt.id} number={receipt.number} /> : null}
            <Button variant="outline" render={<Link href="/compras/entradas" />}>
              Volver a entradas
            </Button>
          </>
        }
      />
      {receipt.status === "voided" && receipt.voidReason ? (
        <p className="bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
          {RECEIPT_STATUS_LABEL.voided}: {receipt.voidReason}
        </p>
      ) : null}
      {receipt.notes ? <p className="text-muted-foreground text-sm">{receipt.notes}</p> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Costo unit. ({receipt.currencyCode})</TableHead>
            <TableHead className="text-right">Costo unit. USD</TableHead>
            <TableHead className="text-right">Gastos</TableHead>
            <TableHead className="text-right">Costo final USD</TableHead>
            <TableHead className="text-right">Total USD</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipt.items.map((it) => (
            <TableRow key={it.id}>
              <TableCell>
                <Link href={`/productos/${it.productId}`} className="font-medium hover:underline">
                  {it.productName}
                </Link>
                <span className="text-muted-foreground block text-xs">{[it.partNumber, it.sku].filter(Boolean).join(" · ")}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQty(it.quantity, it.unitDecimals)} {it.unitSymbol}
              </TableCell>
              <TableCell className="text-right">
                <Money value={it.unitCostAmount} currency={receipt.currencyCode} decimals={isVes ? 2 : 4} />
              </TableCell>
              <TableCell className="text-right">
                <Money value={it.unitCostUsd} currency="USD" decimals={4} />
              </TableCell>
              <TableCell className="text-right">
                <Money value={it.extraCostShareUsd} currency="USD" />
              </TableCell>
              <TableCell className="text-right">
                <Money value={it.unitCostFinalUsd} currency="USD" decimals={4} />
              </TableCell>
              <TableCell className="text-right font-medium">
                <Money value={it.lineTotalUsd} currency="USD" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={6}>Subtotal</TableCell>
            <TableCell className="text-right">
              <Money value={receipt.subtotalUsd} currency="USD" />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={6}>Gastos adicionales (flete, aduana)</TableCell>
            <TableCell className="text-right">
              <Money value={receipt.extraCostsUsd} currency="USD" />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={6} className="text-base">
              Total
            </TableCell>
            <TableCell className="text-right text-base">
              <Money value={receipt.totalUsd} currency="USD" />
            </TableCell>
          </TableRow>
          {isVes ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground font-normal">
                Equivalente en {receipt.currencyCode} (sin gastos)
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-normal">
                <Money value={D(receipt.subtotalUsd).mul(D(receipt.exchangeRate))} currency={receipt.currencyCode} />
              </TableCell>
            </TableRow>
          ) : null}
        </TableFooter>
      </Table>
    </div>
  );
}
