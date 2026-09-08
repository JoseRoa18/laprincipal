import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireRole } from "@/lib/auth-guards";
import { formatDateTime, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { getAdjustment, listAdjustmentReasons } from "@/modules/inventory/infrastructure/adjustments";
import { AdjustmentForm } from "@/modules/inventory/ui/adjustment-form";
import { AdjustmentStatusBadge } from "@/modules/inventory/ui/status-badges";
import { cn } from "cn";

export const metadata = { title: "Ajuste de inventario" };

export default async function AdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "warehouse");
  const { id } = await params;
  const adj = await getAdjustment(id);
  if (!adj) notFound();
  const showCosts = can(user.role, "view_costs");

  if (adj.status === "draft") {
    const reasons = await listAdjustmentReasons();
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ajuste en borrador"
          description={`Creado por ${adj.createdByName} el ${formatDateTime(adj.createdAt)}. Revisa y aplica cuando esté listo.`}
          actions={<AdjustmentStatusBadge status={adj.status} />}
        />
        <AdjustmentForm
          reasons={reasons}
          showCosts={showCosts}
          initial={{
            id: adj.id,
            reasonId: adj.reasonId,
            notes: adj.notes ?? "",
            lines: adj.items.map((it) => {
              const delta = D(it.quantityDelta);
              return {
                key: it.id,
                productId: it.productId,
                name: it.productName,
                sku: it.sku,
                partNumber: it.partNumber,
                unitSymbol: it.unitSymbol,
                unitDecimals: it.unitDecimals,
                currentStock: it.currentStock,
                costAvgUsd: it.costAvgUsd,
                quantity: delta.abs().toFixed(it.unitDecimals),
                direction: delta.gte(0) ? "in" : "out",
                unitCostUsd: D(it.unitCostUsd).toFixed(4),
                notes: it.notes ?? "",
              };
            }),
          }}
        />
      </div>
    );
  }

  const totalValue = adj.items.reduce((acc, it) => acc.plus(D(it.quantityDelta).mul(D(it.unitCostUsd))), D(0));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ajuste ${adj.number ?? ""}`.trim()}
        description={`${adj.reasonName} · ${adj.status === "applied" ? `Aplicado por ${adj.appliedByName ?? adj.createdByName} el ${formatDateTime(adj.appliedAt)}` : `Cancelado · creado el ${formatDateTime(adj.createdAt)}`}`}
        actions={
          <>
            <AdjustmentStatusBadge status={adj.status} />
            <Button variant="outline" render={<Link href="/inventario/ajustes" />}>
              Volver a ajustes
            </Button>
          </>
        }
      />
      {adj.notes ? <p className="text-muted-foreground text-sm">{adj.notes}</p> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            {showCosts ? <TableHead className="hidden text-right md:table-cell">Costo unit.</TableHead> : null}
            {showCosts ? <TableHead className="text-right">Total</TableHead> : null}
            <TableHead className="hidden md:table-cell">Nota</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {adj.items.map((it) => {
            const delta = Number(it.quantityDelta);
            return (
              <TableRow key={it.id}>
                <TableCell>
                  <Link href={`/productos/${it.productId}`} className="font-medium hover:underline">
                    {it.productName}
                  </Link>
                  <span className="text-muted-foreground block text-xs">{[it.partNumber, it.sku].filter(Boolean).join(" · ")}</span>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", delta < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                  {delta > 0 ? "+" : ""}
                  {formatQty(it.quantityDelta, it.unitDecimals)} {it.unitSymbol}
                </TableCell>
                {showCosts ? (
                  <TableCell className="hidden text-right md:table-cell">
                    <Money value={it.unitCostUsd} currency="USD" />
                  </TableCell>
                ) : null}
                {showCosts ? (
                  <TableCell className="text-right">
                    <Money value={D(it.quantityDelta).mul(D(it.unitCostUsd))} currency="USD" colored />
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground hidden md:table-cell">{it.notes ?? ""}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/inventario/movimientos?product=${it.productId}`} className="text-primary text-xs underline-offset-4 hover:underline">
                    Kardex
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {showCosts ? (
          <TableFooter>
            <TableRow>
              {/* Same column count as the rows on phones (unit cost and notes hidden) and on wider screens. */}
              <TableCell colSpan={2}>Valor del ajuste a costo</TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell className="text-right">
                <Money value={totalValue} currency="USD" colored />
              </TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
