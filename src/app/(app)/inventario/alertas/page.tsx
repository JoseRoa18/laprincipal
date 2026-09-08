import { CircleCheck, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StockStatusBadge } from "@/components/app/stock-status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can, requireUser } from "@/lib/auth-guards";
import { formatDate, formatQty } from "@/lib/format";
import { getAlerts } from "@/modules/inventory/infrastructure/alerts";
import type { StockRow } from "@/modules/inventory/infrastructure/stock-query";
import { cn } from "cn";

export const metadata = { title: "Alertas de inventario" };

function AlertTable({ rows, canBuy, emptyText, showLastSale }: { rows: StockRow[]; canBuy: boolean; emptyText: string; showLastSale?: boolean }) {
  if (rows.length === 0) return <EmptyState icon={CircleCheck} title="Nada por aquí" description={emptyText} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Existencia</TableHead>
          <TableHead className="text-right">Mín / Reorden / Máx</TableHead>
          <TableHead className="text-right">Cobertura</TableHead>
          {showLastSale ? <TableHead>Última venta</TableHead> : null}
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const stock = Number(r.quantity);
          return (
            <TableRow key={r.productId}>
              <TableCell className="max-w-[24rem]">
                <Link href={`/productos/${r.productId}`} className="block truncate font-medium hover:underline">
                  {r.name}
                </Link>
                <span className="text-muted-foreground block truncate text-xs">{[r.partNumber, r.sku, r.locationCode].filter(Boolean).join(" · ")}</span>
              </TableCell>
              <TableCell className={cn("text-right font-medium tabular-nums", stock <= 0 && "text-destructive")}>
                {formatQty(r.quantity, r.unitDecimals)} {r.unitSymbol}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {r.hasSettings ? `${formatQty(r.minStock, r.unitDecimals)} / ${formatQty(r.reorderPoint, r.unitDecimals)} / ${formatQty(r.maxStock, r.unitDecimals)}` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.hasStats && r.daysOfCover !== null ? `${formatQty(Math.min(Number(r.daysOfCover), 999), 0)} d` : "—"}</TableCell>
              {showLastSale ? <TableCell className="text-muted-foreground">{r.lastSaleAt ? formatDate(r.lastSaleAt) : "Nunca"}</TableCell> : null}
              <TableCell>
                <StockStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right">
                {canBuy ? (
                  <Link href="/compras/que-comprar" className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
                    <ShoppingCart className="size-3.5" /> Qué comprar
                  </Link>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function AlertsPage() {
  const user = await requireUser();
  const alerts = await getAlerts();
  const canBuy = can(user.role, "purchases");
  const tabs = [
    { value: "buy_now", label: "Comprar ya", rows: alerts.buyNow, empty: "Ningún producto está por debajo de su punto de reorden." },
    { value: "soon", label: "Pronto", rows: alerts.soon, empty: "Ningún producto se agota en los próximos días según su velocidad de venta." },
    { value: "excess", label: "Exceso", rows: alerts.excess, empty: "Ningún producto supera su máximo." },
    { value: "no_movement", label: "Sin movimiento", rows: alerts.noMovement, empty: `Todos los productos con existencia se vendieron en los últimos ${alerts.noMovementDays} días.` },
    { value: "out", label: "Agotados", rows: alerts.outOfStock, empty: "Ningún producto con mínimos configurados está en cero." },
  ];
  const first = tabs.find((t) => t.rows.length > 0)?.value ?? "buy_now";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alertas"
        description={`Stock bajo, agotado, sin movimiento en ${alerts.noMovementDays} días y exceso`}
        actions={canBuy ? <Button render={<Link href="/compras/que-comprar" />}>Ver qué comprar</Button> : undefined}
      />
      <Tabs defaultValue={first}>
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="h-9 flex-none px-3">
              {t.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t.rows.length > 0 ? "bg-foreground/10" : "text-muted-foreground")}>{t.rows.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <AlertTable rows={t.rows} canBuy={canBuy} emptyText={t.empty} showLastSale={t.value === "no_movement"} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
