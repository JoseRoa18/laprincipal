"use client";

import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelAdjustmentAction, saveAdjustmentAction, saveAndApplyAdjustmentAction } from "@/app/(app)/inventario/ajustes/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQty, parseLocalizedNumber } from "@/lib/format";
import type { ActionResult } from "@/lib/errors";
import type { ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { adjustmentSchema } from "@/modules/inventory/application/schemas";
import { REASON_KIND_LABEL } from "@/modules/inventory/infrastructure/labels";
import type { ReasonOption } from "@/modules/inventory/infrastructure/adjustments";
import { cn } from "cn";
import { ProductPicker } from "./product-picker";

export interface AdjustmentLineState {
  key: string;
  productId: string;
  name: string;
  sku: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  currentStock: string;
  costAvgUsd: string;
  quantity: string;
  direction: "in" | "out";
  unitCostUsd: string;
  notes: string;
}

export interface AdjustmentFormInitial {
  id: string;
  reasonId: string;
  notes: string;
  lines: AdjustmentLineState[];
}

function stepFor(decimals: number) {
  return decimals > 0 ? `0.${"0".repeat(decimals - 1)}1` : "1";
}

function resultingStock(line: AdjustmentLineState): number | null {
  const q = parseLocalizedNumber(line.quantity);
  if (q === null) return null;
  const n = Number(q);
  return Number(line.currentStock) + (line.direction === "in" ? n : -n);
}

/** Create or edit a draft adjustment. One screen: reason, products, quantities. */
export function AdjustmentForm({ reasons, initial, showCosts }: { reasons: ReasonOption[]; initial?: AdjustmentFormInitial; showCosts: boolean }) {
  const router = useRouter();
  const [reasonId, setReasonId] = useState(initial?.reasonId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<AdjustmentLineState[]>(initial?.lines ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const reason = reasons.find((r) => r.id === reasonId) ?? null;
  const kind = reason?.kind ?? "both";
  const forcedDirection: "in" | "out" | null = kind === "increase" ? "in" : kind === "decrease" ? "out" : null;

  function addProduct(p: ProductForSale) {
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) {
      qtyRefs.current.get(existing.key)?.focus();
      return;
    }
    const key = `${p.id}-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        partNumber: p.partNumber,
        unitSymbol: p.unitSymbol,
        unitDecimals: p.unitDecimals,
        currentStock: p.stockPhysical,
        costAvgUsd: p.costAvgUsd,
        quantity: "",
        direction: forcedDirection ?? "in",
        unitCostUsd: p.costAvgUsd,
        notes: "",
      },
    ]);
    requestAnimationFrame(() => qtyRefs.current.get(key)?.focus());
  }

  function update(key: string, patch: Partial<AdjustmentLineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function payload() {
    return {
      id: initial?.id,
      reasonId,
      notes,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        direction: forcedDirection ?? l.direction,
        unitCostUsd: showCosts && (forcedDirection ?? l.direction) === "in" ? l.unitCostUsd : undefined,
        notes: l.notes || undefined,
      })),
    };
  }

  function submit(mode: "draft" | "apply") {
    const data = payload();
    const parsed = adjustmentSchema.safeParse(data);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!map[path]) map[path] = issue.message;
      }
      setErrors(map);
      toast.error(Object.values(map)[0] ?? "Revisa los datos del ajuste.");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result: ActionResult<{ id: string; number?: string }> = mode === "apply" ? await saveAndApplyAdjustmentAction(data) : await saveAdjustmentAction(data);
      if (!result.ok) {
        const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
        setErrors(fields);
        toast.error(result.error.message);
        return;
      }
      toast.success(mode === "apply" ? `Ajuste ${result.data.number ?? ""} aplicado`.trim() : "Borrador guardado");
      router.push(`/inventario/ajustes/${result.data.id}`);
      router.refresh();
    });
  }

  const lineError = (i: number, field: string) => errors[`lines.${i}.${field}`];

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <section className="space-y-2">
        <Label htmlFor="reason" className="text-base">
          Motivo <span className="text-destructive">*</span>
        </Label>
        <NativeSelect
          id="reason"
          value={reasonId}
          onChange={(e) => {
            setReasonId(e.target.value);
            const r = reasons.find((x) => x.id === e.target.value);
            if (r && r.kind !== "both") {
              const dir = r.kind === "increase" ? "in" : "out";
              setLines((prev) => prev.map((l) => ({ ...l, direction: dir })));
            }
          }}
          aria-invalid={errors.reasonId ? true : undefined}
          className="w-full sm:max-w-md [&>select]:h-11 [&>select]:text-base"
        >
          <NativeSelectOption value="">Elige un motivo...</NativeSelectOption>
          {reasons.map((r) => (
            <NativeSelectOption key={r.id} value={r.id}>
              {r.name} — {REASON_KIND_LABEL[r.kind]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {errors.reasonId ? <p className="text-destructive text-sm">{errors.reasonId}</p> : null}
        {reason ? (
          <p className="text-muted-foreground text-sm">
            {kind === "increase" ? "Este motivo suma existencia." : kind === "decrease" ? "Este motivo resta existencia." : "Elige en cada producto si entra o sale."}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <Label className="text-base">Productos</Label>
        <ProductPicker onSelect={addProduct} showCost={showCosts} placeholder="Buscar o escanear producto para agregarlo" />
        {errors.lines && lines.length === 0 ? <p className="text-destructive text-sm">{errors.lines}</p> : null}

        {lines.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">Busca un producto para agregarlo al ajuste.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line, i) => {
              const direction = forcedDirection ?? line.direction;
              const after = resultingStock(line);
              return (
                <li key={line.key} className="bg-card ring-foreground/10 rounded-xl p-3 ring-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[line.partNumber, line.sku].filter(Boolean).join(" · ")} · Existencia actual {formatQty(line.currentStock, line.unitDecimals)} {line.unitSymbol}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar producto" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {forcedDirection === null ? (
                      <div className="col-span-2 flex gap-1 sm:col-span-1">
                        <Button
                          type="button"
                          variant={direction === "in" ? "default" : "outline"}
                          size="lg"
                          className="h-11 flex-1"
                          onClick={() => update(line.key, { direction: "in" })}
                        >
                          <ArrowDownToLine data-icon="inline-start" /> Entra
                        </Button>
                        <Button
                          type="button"
                          variant={direction === "out" ? "default" : "outline"}
                          size="lg"
                          className="h-11 flex-1"
                          onClick={() => update(line.key, { direction: "out" })}
                        >
                          <ArrowUpFromLine data-icon="inline-start" /> Sale
                        </Button>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label htmlFor={`qty-${line.key}`} className="text-xs">
                        Cantidad ({line.unitSymbol})
                      </Label>
                      <Input
                        id={`qty-${line.key}`}
                        ref={(el) => {
                          if (el) qtyRefs.current.set(line.key, el);
                          else qtyRefs.current.delete(line.key);
                        }}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={stepFor(line.unitDecimals)}
                        value={line.quantity}
                        onChange={(e) => update(line.key, { quantity: e.target.value })}
                        aria-invalid={lineError(i, "quantity") ? true : undefined}
                        className="h-11 text-base"
                      />
                      {lineError(i, "quantity") ? <p className="text-destructive text-xs">{lineError(i, "quantity")}</p> : null}
                    </div>
                    {showCosts ? (
                      <div className="space-y-1">
                        <Label htmlFor={`cost-${line.key}`} className="text-xs">
                          Costo unitario USD
                        </Label>
                        <Input
                          id={`cost-${line.key}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.0001"
                          value={direction === "in" ? line.unitCostUsd : line.costAvgUsd}
                          disabled={direction !== "in"}
                          onChange={(e) => update(line.key, { unitCostUsd: e.target.value })}
                          className="h-11 text-base"
                        />
                        {lineError(i, "unitCostUsd") ? <p className="text-destructive text-xs">{lineError(i, "unitCostUsd")}</p> : null}
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label htmlFor={`notes-${line.key}`} className="text-xs">
                        Nota
                      </Label>
                      <Input id={`notes-${line.key}`} value={line.notes} onChange={(e) => update(line.key, { notes: e.target.value })} className="h-11" placeholder="Opcional" />
                    </div>
                  </div>
                  {after !== null ? (
                    <p className={cn("mt-2 text-sm", after < 0 ? "text-destructive" : "text-muted-foreground")}>
                      Quedará en {formatQty(after, line.unitDecimals)} {line.unitSymbol}
                      {after < 0 ? " (negativo)" : ""}
                      {showCosts && direction === "in" && parseLocalizedNumber(line.quantity) ? ` · ${formatMoney(Number(parseLocalizedNumber(line.quantity)) * Number(line.unitCostUsd || 0), "USD")} a costo` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <Label htmlFor="notes" className="text-base">
          Notas
        </Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional: por qué se hace el ajuste" className="max-w-2xl" />
      </section>

      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-14 z-30 flex items-center justify-end gap-2 border-t p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        {initial ? (
          <ConfirmButton
            title="¿Cancelar este borrador?"
            description="El ajuste quedará cancelado y no moverá existencias."
            confirmLabel="Cancelar borrador"
            destructive
            variant="ghost"
            size="lg"
            className="mr-auto"
            action={() => cancelAdjustmentAction(initial.id)}
            successMessage="Borrador cancelado"
            onSuccess={() => router.refresh()}
          >
            Cancelar borrador
          </ConfirmButton>
        ) : null}
        <Button type="button" variant="outline" size="lg" className="h-11" disabled={pending} onClick={() => submit("draft")}>
          Guardar borrador
        </Button>
        <Button type="button" size="lg" className="h-11" disabled={pending || lines.length === 0} onClick={() => submit("apply")}>
          {pending ? "Guardando..." : "Guardar y aplicar"}
        </Button>
      </div>
    </div>
  );
}
