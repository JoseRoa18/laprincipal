import { Package } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/app/money";
import { StockStatusBadge } from "@/components/app/stock-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import type { StockRow } from "@/modules/inventory/infrastructure/stock-query";
import { STOCK_MODE_LABEL } from "@/modules/inventory/infrastructure/labels";
import { cn } from "cn";
import { StockSettingsDialog } from "./stock-settings-dialog";

function Thumb({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={40} height={40} className={cn("size-10 shrink-0 rounded-md object-cover", className)} />
  ) : (
    <span className={cn("bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md", className)}>
      <Package className="size-4" />
    </span>
  );
}

function qty(value: string, decimals: number) {
  return formatQty(value, decimals);
}

function daysLabel(row: StockRow) {
  if (!row.hasStats || row.daysOfCover === null) return "—";
  const d = Number(row.daysOfCover);
  return d >= 999 ? "+999" : formatQty(d, 0);
}

/** Existencias: table on desktop, cards on phones. */
export function StockTable({ rows, showCosts, canEdit }: { rows: StockRow[]; showCosts: boolean; canEdit: boolean }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Físico</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead className="text-right">Mín / Máx / Reorden</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Ubicación</TableHead>
              {showCosts ? <TableHead className="text-right">Valor a costo</TableHead> : null}
              {canEdit ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const available = Number(r.available);
              return (
                <TableRow key={r.productId}>
                  <TableCell className="max-w-[28rem]">
                    <Link href={`/productos/${r.productId}`} className="flex items-center gap-3 hover:underline">
                      <Thumb url={r.thumbUrl} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[r.partNumber, r.sku, r.categoryName].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(r.quantity, r.unitDecimals)} <span className="text-muted-foreground text-xs">{r.unitSymbol}</span>
                  </TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", available <= 0 && "text-destructive")}>{qty(r.available, r.unitDecimals)}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {r.hasSettings ? (
                      <>
                        {qty(r.minStock, r.unitDecimals)} / {qty(r.maxStock, r.unitDecimals)} / {qty(r.reorderPoint, r.unitDecimals)}
                        {r.mode === "auto" ? <span className="ml-1 text-xs">({STOCK_MODE_LABEL.auto})</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{daysLabel(r)}{r.hasStats && r.daysOfCover !== null ? <span className="text-muted-foreground text-xs"> d</span> : null}</TableCell>
                  <TableCell>
                    <StockStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.locationCode ?? "—"}</TableCell>
                  {showCosts ? (
                    <TableCell className="text-right">
                      <Money value={r.valueUsd} currency="USD" />
                    </TableCell>
                  ) : null}
                  {canEdit ? (
                    <TableCell>
                      <StockSettingsDialog product={r} iconOnly />
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => {
          const available = Number(r.available);
          return (
            <li key={r.productId} className="bg-card ring-foreground/10 rounded-xl p-3 ring-1">
              <div className="flex items-start gap-3">
                <Link href={`/productos/${r.productId}`}>
                  <Thumb url={r.thumbUrl} className="size-12" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/productos/${r.productId}`} className="tap-target flex min-w-0 items-center font-medium">
                    <span className="truncate">{r.name}</span>
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">{[r.partNumber, r.sku, r.locationCode].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground text-xs">Disponible </span>
                      <span className={cn("font-semibold tabular-nums", available <= 0 && "text-destructive")}>
                        {qty(r.available, r.unitDecimals)} {r.unitSymbol}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      Físico {qty(r.quantity, r.unitDecimals)}
                      {r.hasSettings ? ` · Mín ${qty(r.minStock, r.unitDecimals)} · Máx ${qty(r.maxStock, r.unitDecimals)}` : ""}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StockStatusBadge status={r.status} />
                    <div className="flex items-center gap-2">
                      {showCosts ? <Money value={r.valueUsd} currency="USD" className="text-muted-foreground text-xs" /> : null}
                      {canEdit ? <StockSettingsDialog product={r} iconOnly /> : null}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
