"use client";

import { FileSpreadsheet, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/app/money";
import { StockStatusBadge } from "@/components/app/stock-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty, parseLocalizedNumber } from "@/lib/format";
import type { SuggestionGroup } from "@/modules/purchasing/infrastructure/suggestions";
import { cn } from "cn";

function stepFor(decimals: number) {
  return decimals > 0 ? `0.${"0".repeat(decimals - 1)}1` : "1";
}

function trimZeros(v: string) {
  return v.includes(".") ? v.replace(/\.?0+$/, "") : v;
}

/** "Qué comprar": one card per supplier with editable quantities, Excel export and "Crear entrada". */
export function SuggestionsTable({ groups }: { groups: SuggestionGroup[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.productId, trimZeros(i.suggestedQty)]))),
  );
  const [exporting, setExporting] = useState<string | null>(null);

  const quantity = (productId: string) => Number(parseLocalizedNumber(qty[productId] ?? "") ?? 0);
  const selected = (g: SuggestionGroup) => g.items.map((i) => ({ productId: i.productId, quantity: quantity(i.productId) })).filter((i) => i.quantity > 0);
  const total = (g: SuggestionGroup) => g.items.reduce((acc, i) => acc + quantity(i.productId) * Number(i.unitCostUsd), 0);

  async function exportExcel(g: SuggestionGroup) {
    const items = selected(g);
    if (items.length === 0) {
      toast.error("Escribe al menos una cantidad mayor que cero.");
      return;
    }
    const key = g.supplierId ?? "none";
    setExporting(key);
    try {
      const res = await fetch("/api/purchasing/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierId: g.supplierId, items }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido-${g.supplierName.replace(/[^\w\-]+/g, "-").toLowerCase()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(null);
    }
  }

  function createReceipt(g: SuggestionGroup) {
    const items = selected(g);
    if (!g.supplierId) return;
    const params = new URLSearchParams({ supplier: g.supplierId, items: JSON.stringify(items.map((i) => ({ p: i.productId, q: i.quantity }))) });
    router.push(`/compras/entradas/nueva?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const key = g.supplierId ?? "none";
        return (
          <section key={key} className="bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">
                  {g.supplierId ? (
                    <Link href={`/compras/proveedores/${g.supplierId}`} className="hover:underline">
                      {g.supplierName}
                    </Link>
                  ) : (
                    g.supplierName
                  )}
                </h2>
                <p className="text-muted-foreground text-xs">
                  {g.items.length} {g.items.length === 1 ? "producto" : "productos"}
                  {g.currencyCode ? ` · cotiza en ${g.currencyCode}` : ""}
                  {g.leadTimeDays !== null ? ` · entrega en ${g.leadTimeDays} días` : ""}
                  {!g.supplierId ? " · asigna un proveedor desde la ficha del producto o con una entrada por compra" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => exportExcel(g)} disabled={exporting === key}>
                  <FileSpreadsheet data-icon="inline-start" /> {exporting === key ? "Generando..." : "Exportar a Excel"}
                </Button>
                {g.supplierId ? (
                  <Button onClick={() => createReceipt(g)}>
                    <PackagePlus data-icon="inline-start" /> Crear entrada
                  </Button>
                ) : null}
              </div>
            </header>
            {/* Phones: one card per product with the editable quantity */}
            <ul className="divide-y md:hidden">
              {g.items.map((i) => {
                const q = quantity(i.productId);
                return (
                  <li key={i.productId} className={cn("space-y-2 p-3", q <= 0 && "opacity-60")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/productos/${i.productId}`} className="tap-target flex min-w-0 items-center font-medium">
                          <span className="truncate">{i.name}</span>
                        </Link>
                        <p className="text-muted-foreground truncate text-xs">
                          {[i.partNumber, i.sku, i.supplierCode ? `Cód. prov. ${i.supplierCode}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <StockStatusBadge status={i.status} className="shrink-0" />
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      Existencia <span className={cn("text-foreground font-medium", Number(i.stock) <= 0 && "text-destructive")}>{formatQty(i.stock, i.unitDecimals)} {i.unitSymbol}</span>
                      {" · "}Reorden {formatQty(i.reorderPoint, i.unitDecimals)} / Máx {formatQty(i.maxStock, i.unitDecimals)}
                      {" · "}Cobertura {i.daysOfCover !== null ? `${formatQty(Math.min(Number(i.daysOfCover), 999), 0)} d` : "—"}
                      {" · "}Sugerido {formatQty(i.suggestedQty, i.unitDecimals)}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Pedir</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={stepFor(i.unitDecimals)}
                          value={qty[i.productId] ?? ""}
                          aria-label={`Cantidad a pedir de ${i.name}`}
                          onChange={(e) => setQty((prev) => ({ ...prev, [i.productId]: e.target.value }))}
                          className="h-11 w-24 text-right text-base"
                        />
                      </label>
                      <span className="text-right text-sm">
                        <Money value={q * Number(i.unitCostUsd)} currency="USD" className="font-semibold" />
                        <span className="text-muted-foreground block text-xs">
                          <Money value={i.unitCostUsd} currency="USD" /> c/u
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
              <li className="flex items-center justify-between border-t p-3 text-sm font-medium">
                <span>Total estimado del pedido</span>
                <Money value={total(g)} currency="USD" />
              </li>
            </ul>

            {/* Wider screens: table */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
                  <TableHead className="text-right">Reorden / Máx</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead className="w-32 text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo est.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map((i) => {
                  const q = quantity(i.productId);
                  return (
                    <TableRow key={i.productId} className={cn(q <= 0 && "opacity-60")}>
                      <TableCell className="max-w-[22rem]">
                        <Link href={`/productos/${i.productId}`} className="block truncate font-medium hover:underline">
                          {i.name}
                        </Link>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[i.partNumber, i.sku, i.supplierCode ? `Cód. prov. ${i.supplierCode}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={i.status} />
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", Number(i.stock) <= 0 && "text-destructive")}>
                        {formatQty(i.stock, i.unitDecimals)} {i.unitSymbol}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {formatQty(i.reorderPoint, i.unitDecimals)} / {formatQty(i.maxStock, i.unitDecimals)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{i.daysOfCover !== null ? `${formatQty(Math.min(Number(i.daysOfCover), 999), 0)} d` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(i.suggestedQty, i.unitDecimals)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={stepFor(i.unitDecimals)}
                          value={qty[i.productId] ?? ""}
                          aria-label={`Cantidad a pedir de ${i.name}`}
                          onChange={(e) => setQty((prev) => ({ ...prev, [i.productId]: e.target.value }))}
                          className="h-10 w-28 text-right text-base"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={i.unitCostUsd} currency="USD" />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money value={q * Number(i.unitCostUsd)} currency="USD" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={8}>Total estimado del pedido</TableCell>
                  <TableCell className="text-right">
                    <Money value={total(g)} currency="USD" />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
