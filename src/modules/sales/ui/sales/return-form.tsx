"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createReturnAction } from "@/app/(app)/ventas/actions";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQty, parseLocalizedNumber } from "@/lib/format";
import { D, roundTo, sum } from "@/lib/money";
import { toCash, type CurrencyInfo } from "@/modules/currency/domain/conversion";
import type { PosPaymentMethod } from "../../infrastructure/payment-methods";

export interface ReturnableItem {
  id: string;
  description: string;
  quantity: string;
  returnedQty: string;
  unitPriceUsd: string;
  lineTotalUsd: string;
  unitDecimals: number;
  unitSymbol: string;
}

interface Props {
  saleId: string;
  saleNumber: string | null;
  items: ReturnableItem[];
  reasons: { id: string; name: string }[];
  methods: PosPaymentMethod[];
  /** Methods used to pay the sale, offered first as refund options. */
  originalMethodIds: string[];
  rates: { VES: string; COP: string };
  currencies: CurrencyInfo[];
}

export function ReturnForm({ saleId, saleNumber, items, reasons, methods, originalMethodIds, rates, currencies }: Props) {
  const router = useRouter();
  const pendingItems = items.filter((i) => D(i.quantity).minus(D(i.returnedQty)).gt(0));
  const refundOptions = useMemo(() => {
    const original = methods.filter((m) => originalMethodIds.includes(m.id));
    const cash = methods.filter((m) => m.kind === "cash" && !originalMethodIds.includes(m.id));
    return [...original, ...cash];
  }, [methods, originalMethodIds]);

  const [qty, setQty] = useState<Record<string, string>>({});
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
  const [reasonText, setReasonText] = useState("");
  const [restock, setRestock] = useState(true);
  const [refundMethodId, setRefundMethodId] = useState(refundOptions[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lines = useMemo(
    () =>
      pendingItems
        .map((item) => {
          const raw = qty[item.id];
          const parsed = raw?.trim() ? parseLocalizedNumber(raw) : null;
          const q = parsed ? D(parsed) : D(0);
          const max = D(item.quantity).minus(D(item.returnedQty));
          const invalid = Boolean(raw?.trim()) && (parsed === null || q.lte(0) || q.gt(max));
          const lineTotal = q.gt(0) && !invalid ? roundTo(D(item.lineTotalUsd).mul(q).div(D(item.quantity)), 2) : D(0);
          return { item, q, max, invalid, lineTotal };
        })
        .filter((l) => l.q.gt(0) || l.invalid),
    [pendingItems, qty],
  );
  const total = sum(lines.filter((l) => !l.invalid).map((l) => l.lineTotal));
  const hasInvalid = lines.some((l) => l.invalid);
  const method = refundOptions.find((m) => m.id === refundMethodId) ?? null;

  const refund = useMemo(() => {
    if (!method || total.lte(0)) return null;
    const rate = method.currencyCode === "USD" ? D(1) : method.currencyCode === "VES" ? D(rates.VES) : method.currencyCode === "COP" ? D(rates.COP) : D(0);
    if (rate.lte(0)) return null;
    const currency = currencies.find((c) => c.code === method.currencyCode);
    const raw = total.mul(rate);
    const amount = method.kind === "cash" && currency ? toCash(raw, currency) : roundTo(raw, currency?.decimals ?? 2);
    return { amount, currencyCode: method.currencyCode };
  }, [method, total, rates, currencies]);

  function toggle(item: ReturnableItem, checked: boolean) {
    setQty((q) => ({ ...q, [item.id]: checked ? formatQty(D(item.quantity).minus(D(item.returnedQty)), item.unitDecimals) : "" }));
  }

  function submit() {
    const valid = lines.filter((l) => !l.invalid && l.q.gt(0));
    if (valid.length === 0) {
      setError("Elige al menos una línea y la cantidad a devolver.");
      return;
    }
    if (hasInvalid) {
      setError("Revisa las cantidades marcadas en rojo.");
      return;
    }
    startTransition(async () => {
      const result = await createReturnAction({
        saleId,
        items: valid.map((l) => ({ saleItemId: l.item.id, quantity: l.q.toString() })),
        reasonId: reasonId || null,
        reasonText: reasonText.trim() || null,
        restock,
        refundMethodId: total.gt(0) ? refundMethodId || null : null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Devolución ${result.data.number} registrada`);
      router.push(`/ventas/${saleId}`);
      router.refresh();
    });
  }

  if (pendingItems.length === 0) {
    return <p className="text-muted-foreground text-sm">Todos los productos de esta venta ya fueron devueltos.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Vendido</TableHead>
              <TableHead className="text-right">Ya devuelto</TableHead>
              <TableHead className="w-36 text-right">Devolver</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingItems.map((item) => {
              const line = lines.find((l) => l.item.id === item.id);
              const max = D(item.quantity).minus(D(item.returnedQty));
              const checked = Boolean(qty[item.id]?.trim());
              return (
                <TableRow key={item.id} className={line?.invalid ? "bg-destructive/5" : undefined}>
                  <TableCell>
                    <Checkbox checked={checked} onCheckedChange={(c) => toggle(item, Boolean(c))} aria-label={`Devolver ${item.description}`} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-muted-foreground text-xs">{formatMoney(item.unitPriceUsd, "USD")} por {item.unitSymbol}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(item.quantity, item.unitDecimals)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(item.returnedQty, item.unitDecimals)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      value={qty[item.id] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [item.id]: e.target.value }))}
                      inputMode="decimal"
                      placeholder={`máx. ${formatQty(max, item.unitDecimals)}`}
                      aria-invalid={line?.invalid}
                      className="h-10 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line && !line.invalid ? formatMoney(line.lineTotal, "USD") : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="return-reason">Motivo</Label>
            <NativeSelect id="return-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="w-full [&>select]:h-10">
              <NativeSelectOption value="">Sin motivo predefinido</NativeSelectOption>
              {reasons.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {r.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="return-reason-text">Detalle del motivo</Label>
            <Textarea id="return-reason-text" value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Pieza equivocada, no le sirvió al cliente…" rows={2} />
          </div>
          <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block font-medium">Reingresar al inventario</span>
              <span className="text-muted-foreground block text-xs font-normal">Desactívalo si el repuesto vuelve dañado.</span>
            </span>
            <Switch checked={restock} onCheckedChange={(c) => setRestock(Boolean(c))} />
          </Label>
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Total a devolver</span>
            <Money value={total} currency="USD" className="text-2xl font-bold" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-method">Reembolsar con</Label>
            <NativeSelect id="refund-method" value={refundMethodId} onChange={(e) => setRefundMethodId(e.target.value)} className="w-full [&>select]:h-10">
              <NativeSelectOption value="">Sin reembolso (solo cambio de producto)</NativeSelectOption>
              {refundOptions.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.name}
                  {originalMethodIds.includes(m.id) ? " (usado en la venta)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {refund ? (
            <p className="text-sm">
              Entregar <span className="text-lg font-semibold tabular-nums">{formatMoney(refund.amount, refund.currencyCode)}</span>
              {refund.currencyCode !== "USD" ? <span className="text-muted-foreground"> a la tasa de la venta</span> : null}
            </p>
          ) : method && total.gt(0) ? (
            <p className="text-destructive text-sm">La venta no tiene tasa para {method.currencyCode}.</p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="return-notes">Notas</Label>
            <Input id="return-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10" />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => router.push(`/ventas/${saleId}`)} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" size="lg" onClick={submit} disabled={pending || lines.length === 0}>
          {pending ? "Registrando..." : `Registrar devolución de ${saleNumber ?? "la venta"}`}
        </Button>
      </div>
    </div>
  );
}
