"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteReceiptDraftAction, ratesForDateAction, saveAndApplyReceiptAction, saveReceiptAction } from "@/app/(app)/compras/entradas/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/errors";
import { formatMoney, formatQty, parseLocalizedNumber } from "@/lib/format";
import type { ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";
import type { RateSet } from "@/modules/currency/domain/conversion";
import { ProductPicker } from "@/modules/inventory/ui/product-picker";
import { receiptSchema } from "@/modules/purchasing/application/schemas";
import { computeReceipt } from "@/modules/purchasing/domain/receipt-math";
import { currencyLabel } from "@/modules/purchasing/infrastructure/labels";
import type { SupplierOption } from "@/modules/purchasing/infrastructure/suppliers";
import { cn } from "cn";

export interface ReceiptLineState {
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
  /** In the receipt currency. */
  unitCostAmount: string;
}

export interface ReceiptFormInitial {
  id: string;
  supplierId: string;
  supplierDocument: string;
  receiptDate: string;
  currencyCode: string;
  exchangeRate: string;
  extraCostsUsd: string;
  notes: string;
  lines: ReceiptLineState[];
}

export interface ReceiptFormPrefill {
  supplierId?: string;
  lines?: ReceiptLineState[];
}

function stepFor(decimals: number) {
  return decimals > 0 ? `0.${"0".repeat(decimals - 1)}1` : "1";
}

/** "Entrada por compra": supplier document, currency and rate, lines, extra costs. */
export function ReceiptForm({
  suppliers,
  currencies,
  today,
  rates: initialRates,
  initial,
  prefill,
}: {
  suppliers: SupplierOption[];
  currencies: string[];
  today: string;
  rates: RateSet;
  initial?: ReceiptFormInitial;
  prefill?: ReceiptFormPrefill;
}) {
  const router = useRouter();
  const [rates, setRates] = useState<RateSet>(initialRates);
  const firstSupplier = suppliers.find((s) => s.id === (initial?.supplierId ?? prefill?.supplierId)) ?? null;
  const [supplierId, setSupplierId] = useState(firstSupplier?.id ?? "");
  const [supplierDocument, setSupplierDocument] = useState(initial?.supplierDocument ?? "");
  const [receiptDate, setReceiptDate] = useState(initial?.receiptDate ?? today);
  const [currencyCode, setCurrencyCode] = useState(initial?.currencyCode ?? firstSupplier?.currencyCode ?? "USD");
  const [exchangeRate, setExchangeRate] = useState(() => initial?.exchangeRate ?? rateFor(initial?.currencyCode ?? firstSupplier?.currencyCode ?? "USD", initialRates));
  const [extraCostsUsd, setExtraCostsUsd] = useState(initial?.extraCostsUsd ?? "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<ReceiptLineState[]>(initial?.lines ?? prefill?.lines ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  function rateFor(code: string, set: RateSet): string {
    if (code === "USD") return "1";
    const r = set[code];
    return r === undefined || r === null ? "" : String(r);
  }

  const totals = useMemo(() => {
    try {
      const rate = parseLocalizedNumber(exchangeRate);
      if (!rate || Number(rate) <= 0) return null;
      return computeReceipt(
        lines.map((l) => ({
          key: l.key,
          productId: l.productId,
          quantity: parseLocalizedNumber(l.quantity) ?? "0",
          unitCostAmount: parseLocalizedNumber(l.unitCostAmount) ?? "0",
        })),
        rate,
        parseLocalizedNumber(extraCostsUsd) ?? "0",
      );
    } catch {
      return null;
    }
  }, [lines, exchangeRate, extraCostsUsd]);
  const lineTotals = useMemo(() => new Map(totals?.lines.map((l) => [l.key, l]) ?? []), [totals]);

  function onSupplierChange(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s && !initial) {
      setCurrencyCode(s.currencyCode);
      setExchangeRate(rateFor(s.currencyCode, rates));
    }
  }

  function onCurrencyChange(code: string) {
    setCurrencyCode(code);
    setExchangeRate(rateFor(code, rates));
  }

  async function onDateChange(date: string) {
    setReceiptDate(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const snap = await ratesForDateAction(date);
    setRates(snap.rateSet);
    if (currencyCode !== "USD") setExchangeRate(rateFor(currencyCode, snap.rateSet));
  }

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
        unitCostAmount: "",
      },
    ]);
    requestAnimationFrame(() => qtyRefs.current.get(key)?.focus());
  }

  function update(key: string, patch: Partial<ReceiptLineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function payload() {
    return {
      id: initial?.id,
      supplierId,
      supplierDocument,
      receiptDate,
      currencyCode,
      exchangeRate,
      extraCostsUsd: extraCostsUsd || "0",
      notes,
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCostAmount: l.unitCostAmount })),
    };
  }

  function submit(mode: "draft" | "apply") {
    const data = payload();
    const parsed = receiptSchema.safeParse(data);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!map[path]) map[path] = issue.message;
      }
      setErrors(map);
      toast.error(Object.values(map)[0] ?? "Revisa los datos de la entrada.");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result: ActionResult<{ id: string; number?: string }> = mode === "apply" ? await saveAndApplyReceiptAction(data) : await saveReceiptAction(data);
      if (!result.ok) {
        setErrors((result.error.details?.fields ?? {}) as Record<string, string>);
        toast.error(result.error.message);
        return;
      }
      toast.success(mode === "apply" ? `Entrada ${result.data.number ?? ""} aplicada`.trim() : "Borrador guardado");
      router.push(`/compras/entradas/${result.data.id}`);
      router.refresh();
    });
  }

  const lineError = (i: number, field: string) => errors[`lines.${i}.${field}`];
  const rateMissing = currencyCode !== "USD" && !exchangeRate;

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="supplier">
            Proveedor <span className="text-destructive">*</span>
          </Label>
          <NativeSelect id="supplier" value={supplierId} onChange={(e) => onSupplierChange(e.target.value)} aria-invalid={errors.supplierId ? true : undefined} className="w-full [&>select]:h-11 [&>select]:text-base">
            <NativeSelectOption value="">Elige un proveedor...</NativeSelectOption>
            {suppliers.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.supplierId ? <p className="text-destructive text-xs">{errors.supplierId}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="document">Documento del proveedor</Label>
          <Input id="document" value={supplierDocument} onChange={(e) => setSupplierDocument(e.target.value)} placeholder="Factura o nota" className="h-11 text-base" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" type="date" value={receiptDate} onChange={(e) => void onDateChange(e.target.value)} className="h-11 text-base" aria-invalid={errors.receiptDate ? true : undefined} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="currency">Moneda</Label>
            <NativeSelect id="currency" value={currencyCode} onChange={(e) => onCurrencyChange(e.target.value)} className="w-full [&>select]:h-11 [&>select]:text-base">
              {currencies.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate">Tasa por 1 $</Label>
            <Input
              id="rate"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.000001"
              value={exchangeRate}
              disabled={currencyCode === "USD"}
              onChange={(e) => setExchangeRate(e.target.value)}
              aria-invalid={errors.exchangeRate || rateMissing ? true : undefined}
              className="h-11 text-base"
            />
          </div>
        </div>
      </section>
      {rateMissing ? (
        <p className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4" /> No hay tasa registrada para {currencyLabel(currencyCode)} en esa fecha. Escríbela aquí o cárgala en Configuración.
        </p>
      ) : null}
      {errors.exchangeRate ? <p className="text-destructive text-sm">{errors.exchangeRate}</p> : null}

      <section className="space-y-3">
        <Label className="text-base">Productos</Label>
        <ProductPicker onSelect={addProduct} showCost placeholder="Buscar o escanear producto para agregarlo" />
        {errors.lines && lines.length === 0 ? <p className="text-destructive text-sm">{errors.lines}</p> : null}
        {lines.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">Busca un producto para agregarlo a la entrada.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line, i) => {
              const computed = lineTotals.get(line.key);
              return (
                <li key={line.key} className="bg-card ring-foreground/10 rounded-xl p-3 ring-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[line.partNumber, line.sku].filter(Boolean).join(" · ")} · Existencia {formatQty(line.currentStock, line.unitDecimals)} {line.unitSymbol} · Costo prom. {formatMoney(line.costAvgUsd, "USD")}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar producto" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                    <div className="space-y-1">
                      <Label htmlFor={`cost-${line.key}`} className="text-xs">
                        Costo unitario ({currencyCode})
                      </Label>
                      <Input
                        id={`cost-${line.key}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.0001"
                        value={line.unitCostAmount}
                        onChange={(e) => update(line.key, { unitCostAmount: e.target.value })}
                        aria-invalid={lineError(i, "unitCostAmount") ? true : undefined}
                        className="h-11 text-base"
                      />
                      {lineError(i, "unitCostAmount") ? <p className="text-destructive text-xs">{lineError(i, "unitCostAmount")}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">Costo unit. USD</p>
                      <p className="h-11 leading-11 tabular-nums">{computed ? formatMoney(computed.unitCostUsd, "USD", { decimals: 4 }) : "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">Total línea USD</p>
                      <p className="h-11 leading-11 font-medium tabular-nums">{computed ? formatMoney(computed.lineTotalUsd, "USD") : "—"}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="bg-muted/50 space-y-2 rounded-xl border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <Money value={totals?.subtotalUsd ?? 0} currency="USD" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="extra" className="text-muted-foreground font-normal">
              Gastos adicionales USD (flete, aduana)
            </Label>
            <Input
              id="extra"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={extraCostsUsd}
              onChange={(e) => setExtraCostsUsd(e.target.value)}
              aria-invalid={errors.extraCostsUsd ? true : undefined}
              className="h-10 w-32 text-right text-base"
            />
          </div>
          {errors.extraCostsUsd ? <p className="text-destructive text-xs">{errors.extraCostsUsd}</p> : null}
          <p className="text-muted-foreground text-xs">Se reparten entre las líneas según su valor y entran al costo promedio.</p>
          <div className={cn("flex items-center justify-between border-t pt-2 text-base font-semibold")}>
            <span>Total USD</span>
            <Money value={totals?.totalUsd ?? 0} currency="USD" />
          </div>
          {currencyCode !== "USD" && totals && exchangeRate ? (
            <p className="text-muted-foreground text-right text-xs">
              ≈ {formatMoney(totals.subtotalUsd.mul(Number(exchangeRate)), currencyCode)} en {currencyCode} (sin gastos)
            </p>
          ) : null}
        </div>
      </section>

      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-14 z-30 flex items-center justify-end gap-2 border-t p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        {initial ? (
          <ConfirmButton
            title="¿Eliminar este borrador?"
            description="La entrada en borrador se eliminará. No afecta las existencias."
            confirmLabel="Eliminar"
            destructive
            variant="ghost"
            size="lg"
            className="mr-auto"
            action={() => deleteReceiptDraftAction(initial.id)}
            successMessage="Borrador eliminado"
            onSuccess={() => {
              router.push("/compras/entradas");
              router.refresh();
            }}
          >
            Eliminar borrador
          </ConfirmButton>
        ) : null}
        <Button type="button" variant="outline" size="lg" className="h-11" disabled={pending} onClick={() => submit("draft")}>
          Guardar borrador
        </Button>
        <Button type="button" size="lg" className="h-11" disabled={pending || lines.length === 0} onClick={() => submit("apply")}>
          {pending ? "Guardando..." : "Aplicar entrada"}
        </Button>
      </div>
    </div>
  );
}
