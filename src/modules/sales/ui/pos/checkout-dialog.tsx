"use client";

import { Banknote, CircleAlert, Printer, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { completeSaleAction } from "@/app/(app)/vender/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/errors";
import { formatMoney, parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { cn } from "cn";
import { displayAmounts } from "@/modules/currency/domain/conversion";
import type { CompleteSaleResult } from "../../application/complete-sale";
import { computePaymentState, remainingIn, type PaymentInput } from "../../domain/payments";
import type { SaleTotals } from "../../domain/pricing";
import { useCart, useCartStore, type SupervisorAuth } from "../cart-store";
import type { PosPaymentMethod } from "../../infrastructure/payment-methods";
import { SupervisorDialog } from "./supervisor-dialog";
import type { PosConfig } from "./types";

interface PaymentRow {
  key: string;
  paymentMethodId: string;
  amount: string;
  reference: string;
}

type ActionError = Extract<ActionResult<unknown>, { ok: false }>["error"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PosConfig;
  totals: SaleTotals;
  onSuccess: (result: CompleteSaleResult, opts: { print: boolean; whatsapp: boolean }) => void;
}

const CURRENCY_LABEL: Record<string, string> = { USD: "$", VES: "Bs", COP: "COP" };

/** "Cobrar": mixed payments in three currencies, remaining and change. */
export function CheckoutDialog({ open, onOpenChange, config, totals, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <CheckoutForm config={config} totals={totals} onSuccess={onSuccess} onCancel={() => onOpenChange(false)} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );
}

function CheckoutForm({
  config,
  totals,
  onSuccess,
  onCancel,
  onBusyChange,
}: {
  config: PosConfig;
  totals: SaleTotals;
  onSuccess: Props["onSuccess"];
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const store = useCartStore();
  const lines = useCart((s) => s.lines);
  const customer = useCart((s) => s.customer);
  const globalDiscount = useCart((s) => s.globalDiscount);
  const supervisor = useCart((s) => s.supervisor);
  const heldSaleId = useCart((s) => s.heldSaleId);
  const quoteId = useCart((s) => s.quoteId);
  const notes = useCart((s) => s.notes);

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [changeCurrency, setChangeCurrency] = useState("USD");
  const [print, setPrint] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const keyCounter = useRef(0);
  const focusKey = useRef<string | null>(null);
  const amountRefs = useRef(new Map<string, HTMLInputElement>());

  const rateSet = config.rates.rateSet;
  const currencies = config.rates.currencies;
  const methods = config.paymentMethods;
  const cashCurrencies = useMemo(
    () => currencies.filter((c) => methods.some((m) => m.allowsChange && m.currencyCode === c.code)),
    [currencies, methods],
  );
  const hasRate = (code: string) => code === "USD" || D(rateSet[code] ?? 0).gt(0);

  // Focus the amount of a payment that was just added.
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    const el = amountRefs.current.get(key);
    el?.focus();
    el?.select();
    focusKey.current = null;
  }, [rows]);

  const parsed = useMemo(
    () =>
      rows.map((row) => {
        const method = methods.find((m) => m.id === row.paymentMethodId);
        const amount = row.amount.trim() ? parseLocalizedNumber(row.amount) : null;
        const rateOk = method ? method.currencyCode === "USD" || D(rateSet[method.currencyCode] ?? 0).gt(0) : false;
        const valid = Boolean(method && amount && D(amount).gt(0) && rateOk);
        return { row, method, amount, valid };
      }),
    [rows, methods, rateSet],
  );

  const state = useMemo(() => {
    const inputs: PaymentInput[] = parsed
      .filter((p) => p.valid)
      .map((p) => ({ key: p.row.key, paymentMethodId: p.method!.id, currencyCode: p.method!.currencyCode, amount: p.amount!, reference: p.row.reference || null }));
    try {
      return computePaymentState(totals.totalUsd, inputs, rateSet, cashCurrencies);
    } catch {
      return null;
    }
  }, [parsed, totals.totalUsd, rateSet, cashCurrencies]);

  const missingReference = parsed.some((p) => p.valid && p.method?.requiresReference && !p.row.reference.trim());
  const invalidAmount = parsed.some((p) => p.row.amount.trim() && !p.valid);
  const canConfirm = Boolean(state?.isPaid) && !missingReference && !invalidAmount && !submitting && lines.length > 0;
  const totalsDisplay = displayAmounts(totals.totalUsd, rateSet, currencies);

  function addPayment(method: PosPaymentMethod) {
    const remaining = state?.remainingUsd ?? totals.totalUsd;
    let amount = "";
    if (remaining.gt(0)) {
      const currency = currencies.find((c) => c.code === method.currencyCode);
      const decimals = currency?.decimals ?? 2;
      let value = remainingIn(remaining, method.currencyCode, rateSet, decimals);
      if (method.kind === "cash" && currency && D(currency.cashRounding).gt(0)) {
        const step = D(currency.cashRounding);
        value = value.div(step).ceil().mul(step);
      }
      amount = value.toFixed(decimals);
    }
    keyCounter.current += 1;
    const key = `p${keyCounter.current}`;
    focusKey.current = key;
    setRows((r) => [...r, { key, paymentMethodId: method.id, amount, reference: "" }]);
  }

  function updateRow(key: string, patch: Partial<PaymentRow>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function submit(extra: { allowNegativeStock?: boolean; supervisorToken?: string } = {}) {
    if (!state?.isPaid || submitting) return;
    setSubmitting(true);
    onBusyChange(true);
    setError(null);
    const result = await completeSaleAction({
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, discountType: l.discountType, discountValue: l.discountValue })),
      customerId: customer?.id ?? null,
      globalDiscount,
      payments: parsed
        .filter((p) => p.valid)
        .map((p) => ({ paymentMethodId: p.method!.id, amount: p.amount!, reference: p.row.reference.trim() || null })),
      changeCurrencyCode: state.changeUsd.gt(0) ? changeCurrency : null,
      supervisorToken: extra.supervisorToken ?? supervisor?.token ?? null,
      heldSaleId,
      quoteId,
      notes: notes.trim() || null,
      allowNegativeStock: extra.allowNegativeStock ?? false,
    });
    setSubmitting(false);
    onBusyChange(false);
    if (!result.ok) {
      setError(result.error);
      if (result.error.code === "FORBIDDEN" && result.error.details?.reason === "discount_limit") setSupervisorOpen(true);
      return;
    }
    onSuccess(result.data, { print, whatsapp });
  }

  function onAuthorized(auth: SupervisorAuth) {
    store.getState().setSupervisor(auth);
    void submit({ supervisorToken: auth.token });
  }

  const canForceNegative = error?.code === "INSUFFICIENT_STOCK" && config.seller.role === "admin" && config.policies.allowNegativeStock;

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if ((e.key === "F9" || (e.key === "Enter" && tag !== "TEXTAREA" && tag !== "BUTTON")) && canConfirm) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Banknote className="size-5" /> Cobrar
        </DialogTitle>
        <DialogDescription>
          {lines.length} {lines.length === 1 ? "producto" : "productos"}
          {customer ? ` · ${customer.name}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-xl border p-3 text-center">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Total a pagar</p>
        <p className="text-4xl font-bold tabular-nums">{formatMoney(totals.totalUsd, "USD")}</p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {["VES", "COP"]
            .filter((c) => totalsDisplay[c])
            .map((c) => formatMoney(totalsDisplay[c], c))
            .join("  ·  ")}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Agregar pago</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {methods.map((m) => {
            const ok = hasRate(m.currencyCode);
            return (
              <Button
                key={m.id}
                type="button"
                variant="outline"
                className="h-12 flex-col gap-0 px-2"
                disabled={!ok || submitting}
                onClick={() => addPayment(m)}
                title={ok ? undefined : `Sin tasa para ${m.currencyCode}`}
              >
                <span className="text-sm font-semibold">{m.name}</span>
                <span className="text-muted-foreground text-xs">{ok ? (CURRENCY_LABEL[m.currencyCode] ?? m.currencyCode) : "Sin tasa"}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-2">
          {parsed.map(({ row, method, valid }) => {
            if (!method) return null;
            const currency = currencies.find((c) => c.code === method.currencyCode);
            const usd = valid ? state?.payments.find((p) => p.key === row.key)?.amountUsd : null;
            return (
              <div key={row.key} className="rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{method.name}</span>
                  <div className="relative w-36">
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm">
                      {CURRENCY_LABEL[method.currencyCode] ?? method.currencyCode}
                    </span>
                    <Input
                      ref={(el) => {
                        if (el) amountRefs.current.set(row.key, el);
                        else amountRefs.current.delete(row.key);
                      }}
                      value={row.amount}
                      onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                      inputMode="decimal"
                      aria-label={`Monto en ${method.currencyCode}`}
                      aria-invalid={row.amount.trim() !== "" && !valid}
                      className={cn("h-11 text-right text-base font-semibold", method.currencyCode === "USD" ? "pl-6" : "pl-10")}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label="Quitar pago" onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}>
                    <X />
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {method.requiresReference ? (
                    <Input
                      value={row.reference}
                      onChange={(e) => updateRow(row.key, { reference: e.target.value })}
                      placeholder="Referencia (obligatoria)"
                      aria-label="Referencia"
                      aria-invalid={valid && !row.reference.trim()}
                      className="h-9 flex-1"
                    />
                  ) : (
                    <span className="flex-1" />
                  )}
                  {usd && method.currencyCode !== "USD" ? (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      = {formatMoney(usd, "USD")} · tasa {D(rateSet[method.currencyCode]).toFixed(currency?.decimals ?? 2)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {state ? (
        state.remainingUsd.gt(0) ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p className="text-xs font-medium tracking-wide uppercase">Faltan</p>
            <p className="text-xl font-bold tabular-nums">{formatMoney(state.remainingUsd, "USD")}</p>
            <p className="text-sm tabular-nums">
              {currencies
                .filter((c) => !c.isBase && hasRate(c.code))
                .map((c) => formatMoney(remainingIn(state.remainingUsd, c.code, rateSet, c.decimals), c.code))
                .join("  ·  ")}
            </p>
          </div>
        ) : state.changeUsd.gt(0) ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            <p className="text-xs font-medium tracking-wide uppercase">Cambio · {formatMoney(state.changeUsd, "USD")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {state.changeOptions.map((o) => (
                <button
                  key={o.currency.code}
                  type="button"
                  onClick={() => setChangeCurrency(o.currency.code)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    changeCurrency === o.currency.code
                      ? "border-emerald-600 bg-white ring-2 ring-emerald-500 dark:bg-emerald-900"
                      : "border-emerald-200 bg-white/60 dark:bg-emerald-900/40",
                  )}
                >
                  <span className="block text-xs">Efectivo {o.currency.code}</span>
                  <span className="block text-lg font-bold tabular-nums">{formatMoney(o.amount, o.currency.code)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : rows.length > 0 ? (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            Pago completo
          </p>
        ) : null
      ) : (
        <p className="text-destructive text-sm">Falta una tasa de cambio para uno de los pagos.</p>
      )}
      {missingReference ? <p className="text-destructive text-sm">Escribe la referencia del pago electrónico.</p> : null}

      {error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{error.code === "INSUFFICIENT_STOCK" ? "Sin existencia suficiente" : "No se pudo cobrar"}</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error.code === "CASH_SESSION_REQUIRED" ? (
              <Link href="/caja" className="font-medium">
                Ir a Caja
              </Link>
            ) : null}
            {error.code === "RATES_REQUIRED" ? (
              <Link href="/configuracion/tasas" className="font-medium">
                Cargar tasa del día
              </Link>
            ) : null}
            {canForceNegative ? (
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void submit({ allowNegativeStock: true })} disabled={submitting}>
                Vender de todos modos (stock negativo)
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <Label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={print} onCheckedChange={(c) => setPrint(Boolean(c))} />
          <Printer className="size-4" /> Imprimir ticket
        </Label>
        <Label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={whatsapp} onCheckedChange={(c) => setWhatsapp(Boolean(c))} />
          <Send className="size-4" /> Enviar por WhatsApp
        </Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="button" size="lg" className="h-11 px-6 text-base" disabled={!canConfirm} onClick={() => void submit()}>
          {submitting ? "Registrando..." : "Confirmar venta"}
          {!submitting ? <Kbd className="bg-primary-foreground/20 text-primary-foreground ml-1 hidden md:inline-flex">F9</Kbd> : null}
        </Button>
      </DialogFooter>

      <SupervisorDialog
        open={supervisorOpen}
        onOpenChange={setSupervisorOpen}
        reason={`El descuento supera el máximo permitido para tu rol (${config.policies.maxDiscountPct} %). Un administrador debe autorizarlo con su PIN.`}
        onAuthorized={onAuthorized}
      />
    </div>
  );
}
