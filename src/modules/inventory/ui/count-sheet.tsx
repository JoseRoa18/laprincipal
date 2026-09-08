"use client";

import { Check, CircleAlert, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { findProductByBarcodeAction } from "@/app/(app)/inventario/actions";
import { addCountItemAction, applyCountAction, cancelCountAction, recordCountItemAction } from "@/app/(app)/inventario/conteos/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Money } from "@/components/app/money";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatQty } from "@/lib/format";
import { normalizeSearch } from "@/modules/catalog/infrastructure/product-lookup";
import type { CountItemRow, CountStatus } from "@/modules/inventory/infrastructure/counts";
import { cn } from "cn";
import { ScanButton } from "./barcode-scanner";

type SaveState = "idle" | "saving" | "saved" | "error";

interface LocalItem extends CountItemRow {
  /** Text in the input (may differ from the saved countedQty while editing). */
  draft: string;
  save: SaveState;
}

function stepFor(decimals: number) {
  return decimals > 0 ? `0.${"0".repeat(decimals - 1)}1` : "1";
}

function toDraft(v: string | null, decimals: number) {
  if (v === null) return "";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

/** Mobile-first counting screen with search, camera scan and a differences tab. */
export function CountSheet({
  countId,
  status,
  blind,
  items: initialItems,
  canApply,
  showCosts,
}: {
  countId: string;
  status: CountStatus;
  blind: boolean;
  items: CountItemRow[];
  canApply: boolean;
  showCosts: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LocalItem[]>(() => initialItems.map((it) => ({ ...it, draft: toDraft(it.countedQty, it.unitDecimals), save: "idle" })));
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"count" | "diff">(status === "open" ? "count" : "diff");
  const [highlight, setHighlight] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const open = status === "open";

  const counted = items.filter((i) => i.countedQty !== null).length;
  const pct = items.length === 0 ? 0 : Math.round((counted / items.length) * 100);
  const diffs = items.filter((i) => i.countedQty !== null && Number(i.difference ?? 0) !== 0);
  const diffValue = diffs.reduce((acc, i) => acc + Number(i.difference ?? 0) * Number(i.costAvgUsd), 0);

  const visible = useMemo(() => {
    const term = normalizeSearch(filter);
    if (!term) return items;
    return items.filter((i) => normalizeSearch(`${i.productName} ${i.sku} ${i.partNumber ?? ""} ${i.locationCode ?? ""}`).includes(term));
  }, [items, filter]);

  const patch = useCallback((itemId: string, changes: Partial<LocalItem>) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...changes } : i)));
  }, []);

  async function commit(item: LocalItem) {
    const value = item.draft.trim();
    const current = item.countedQty === null ? "" : toDraft(item.countedQty, item.unitDecimals);
    if (value === current && item.save !== "error") return;
    patch(item.id, { save: "saving" });
    const result = await recordCountItemAction({ countId, itemId: item.id, countedQty: value === "" ? null : value });
    if (!result.ok) {
      patch(item.id, { save: "error" });
      toast.error(result.error.message);
      return;
    }
    patch(item.id, { countedQty: result.data.countedQty, difference: result.data.difference, save: "saved" });
  }

  function focusItem(itemId: string) {
    setFilter("");
    setTab("count");
    setHighlight(itemId);
    requestAnimationFrame(() => {
      const el = inputRefs.current.get(itemId);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
      el?.select();
    });
    setTimeout(() => setHighlight((h) => (h === itemId ? null : h)), 2500);
  }

  function focusNext(itemId: string) {
    const idx = visible.findIndex((i) => i.id === itemId);
    const next = visible[idx + 1];
    if (next) inputRefs.current.get(next.id)?.focus();
  }

  const onCode = useCallback(
    async (code: string) => {
      const product = await findProductByBarcodeAction(code);
      if (!product) {
        toast.error(`No se encontró ningún producto con el código ${code}.`);
        return;
      }
      const existing = items.find((i) => i.productId === product.id);
      if (existing) {
        focusItem(existing.id);
        return;
      }
      toast(`"${product.name}" no está en este conteo.`, {
        action: {
          label: "Agregar al conteo",
          onClick: async () => {
            const result = await addCountItemAction({ countId, productId: product.id });
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            const item: LocalItem = {
              id: result.data.itemId,
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              partNumber: product.partNumber,
              locationCode: product.locationCode,
              unitSymbol: product.unitSymbol,
              unitDecimals: product.unitDecimals,
              expectedQty: result.data.expectedQty,
              countedQty: null,
              difference: null,
              costAvgUsd: product.costAvgUsd,
              countedAt: null,
              currentStock: product.stockPhysical,
              draft: "",
              save: "idle",
            };
            setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
            focusItem(item.id);
          },
        },
      });
    },
    [items, countId],
  );

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <Progress value={pct} className="gap-1">
        <ProgressLabel>{open ? "Progreso" : "Contados"}</ProgressLabel>
        <ProgressValue>{() => `${counted} de ${items.length} contados`}</ProgressValue>
      </Progress>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "count" | "diff")}>
        <TabsList className="h-10 w-full sm:w-auto">
          <TabsTrigger value="count" className="h-full px-4">
            Contar
          </TabsTrigger>
          <TabsTrigger value="diff" className="h-full px-4">
            Diferencias {diffs.length > 0 ? <span className="bg-foreground/10 rounded-full px-1.5 text-xs tabular-nums">{diffs.length}</span> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="count" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filter.trim()) {
                    e.preventDefault();
                    void onCode(filter.trim());
                  }
                }}
                placeholder="Buscar o escribir código y Enter"
                aria-label="Buscar producto en el conteo"
                className="h-11 pl-9 text-base"
              />
            </div>
            {open ? <ScanButton onDetected={onCode} className="h-11" /> : null}
          </div>

          {visible.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              {items.length === 0 ? "Este conteo no tiene productos." : "Ningún producto coincide con la búsqueda."}
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-3 ring-1 transition-colors",
                    highlight === item.id && "ring-primary bg-primary/5 ring-2",
                    item.countedQty !== null && "bg-emerald-50/60 dark:bg-emerald-950/20",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.productName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[item.partNumber, item.sku].filter(Boolean).join(" · ")}
                      {item.locationCode ? ` · ${item.locationCode}` : ""}
                    </p>
                    {!blind || !open ? (
                      <p className="text-muted-foreground text-xs tabular-nums">
                        Esperado {formatQty(item.expectedQty, item.unitDecimals)} {item.unitSymbol}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex w-32 shrink-0 items-center gap-1">
                    <Input
                      ref={(el) => {
                        if (el) inputRefs.current.set(item.id, el);
                        else inputRefs.current.delete(item.id);
                      }}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={stepFor(item.unitDecimals)}
                      value={item.draft}
                      disabled={!open}
                      aria-label={`Cantidad contada de ${item.productName}`}
                      placeholder="0"
                      onChange={(e) => patch(item.id, { draft: e.target.value, save: "idle" })}
                      onBlur={() => void commit(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commit(item);
                          focusNext(item.id);
                        }
                      }}
                      className="h-12 text-center text-lg font-semibold tabular-nums"
                    />
                    <span className="flex w-5 justify-center">
                      {item.save === "saving" ? <Spinner className="text-muted-foreground" /> : null}
                      {item.save === "error" ? <CircleAlert className="text-destructive size-4" /> : null}
                      {item.save !== "saving" && item.save !== "error" && item.countedQty !== null ? <Check className="size-4 text-emerald-600" /> : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="diff" className="space-y-3">
          {counted === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">Todavía no hay productos contados.</p>
          ) : diffs.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              Sin diferencias: lo contado coincide con el sistema. {items.length - counted > 0 ? `Faltan ${items.length - counted} por contar.` : ""}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  {showCosts ? <TableHead className="text-right">Valor</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...diffs]
                  .sort((a, b) => Math.abs(Number(b.difference)) - Math.abs(Number(a.difference)))
                  .map((i) => {
                    const d = Number(i.difference);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <button type="button" className="text-left font-medium hover:underline" onClick={() => open && focusItem(i.id)}>
                            {i.productName}
                          </button>
                          <span className="text-muted-foreground block text-xs">{[i.partNumber, i.sku, i.locationCode].filter(Boolean).join(" · ")}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(i.expectedQty, i.unitDecimals)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(i.countedQty ?? 0, i.unitDecimals)}</TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", d < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                          {d > 0 ? "+" : ""}
                          {formatQty(d, i.unitDecimals)} {i.unitSymbol}
                        </TableCell>
                        {showCosts ? (
                          <TableCell className="text-right">
                            <Money value={d * Number(i.costAvgUsd)} currency="USD" colored />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>
                    {diffs.length} {diffs.length === 1 ? "producto con diferencia" : "productos con diferencia"}
                    {items.length - counted > 0 ? ` · ${items.length - counted} sin contar (no se ajustan)` : ""}
                  </TableCell>
                  <TableCell />
                  {showCosts ? (
                    <TableCell className="text-right">
                      <Money value={diffValue} currency="USD" colored />
                    </TableCell>
                  ) : null}
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {open && canApply ? (
        <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-14 z-30 flex items-center justify-end gap-2 border-t p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
          <ConfirmButton
            title="¿Cancelar este conteo?"
            description="Se perderán las cantidades contadas y no se moverá ninguna existencia."
            confirmLabel="Cancelar conteo"
            destructive
            variant="ghost"
            size="lg"
            className="mr-auto"
            action={() => cancelCountAction(countId)}
            successMessage="Conteo cancelado"
            onSuccess={() => router.refresh()}
          >
            Cancelar conteo
          </ConfirmButton>
          <ConfirmButton
            title="¿Aplicar los ajustes del conteo?"
            description={
              diffs.length === 0
                ? "No hay diferencias: el conteo se cerrará sin mover existencias."
                : `Se crearán ${diffs.length} ${diffs.length === 1 ? "ajuste" : "ajustes"} por conteo con el motivo "Error de conteo". Los productos sin contar no cambian.`
            }
            confirmLabel="Aplicar ajustes"
            size="lg"
            className="h-11"
            disabled={counted === 0}
            action={() => applyCountAction(countId)}
            successMessage="Conteo aplicado"
            onSuccess={() => router.refresh()}
          >
            Aplicar ajustes
          </ConfirmButton>
        </div>
      ) : null}
    </div>
  );
}
