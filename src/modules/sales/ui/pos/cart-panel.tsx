"use client";

import { FileText, Minus, PauseCircle, Percent, Plus, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { cn } from "cn";
import { displayAmounts } from "@/modules/currency/domain/conversion";
import type { CartCustomer, CartLineData } from "../../application/schemas";
import type { SaleTotals } from "../../domain/pricing";
import { exceedsDiscountLimit, supervisorIsValid, useCart, useCartStore } from "../cart-store";
import { CustomerPicker } from "./customer-picker";
import { DiscountDialog } from "./discount-dialog";
import { LineEditor } from "./line-editor";
import type { PosConfig } from "./types";

interface Props {
  config: PosConfig;
  totals: SaleTotals;
  onCustomerChange: (customer: CartCustomer | null) => void;
  onCheckout: () => void;
  onHold: () => void;
  onQuote: () => void;
}

export function CartPanel({ config, totals, onCustomerChange, onCheckout, onHold, onQuote }: Props) {
  const store = useCartStore();
  const lines = useCart((s) => s.lines);
  const customer = useCart((s) => s.customer);
  const globalDiscount = useCart((s) => s.globalDiscount);
  const supervisor = useCart((s) => s.supervisor);
  const holdLabel = useCart((s) => s.holdLabel);
  const heldSaleId = useCart((s) => s.heldSaleId);
  const quoteNumber = useCart((s) => s.quoteNumber);
  const [editing, setEditing] = useState<CartLineData | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);

  const amounts = displayAmounts(totals.totalUsd, config.rates.rateSet, config.rates.currencies);
  const overLimit = exceedsDiscountLimit(totals, config.policies.maxDiscountPct) && !supervisorIsValid(supervisor);
  const isQuote = config.mode === "quote";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShoppingCart className="size-4" /> {isQuote ? "Cotización" : "Carrito"}
          {lines.length > 0 ? <Badge variant="secondary">{lines.length}</Badge> : null}
        </h2>
        {lines.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => store.getState().clear()}>
            <Trash2 /> Vaciar
          </Button>
        ) : null}
      </div>

      <CustomerPicker customer={customer} onSelect={onCustomerChange} />

      {heldSaleId && holdLabel ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <PauseCircle className="size-3.5" /> Retomada de espera: <span className="text-foreground font-medium">{holdLabel}</span>
        </p>
      ) : null}
      {quoteNumber ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <FileText className="size-3.5" /> Desde la cotización <span className="text-foreground font-medium">{quoteNumber}</span> (precios cotizados)
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        {lines.length === 0 ? (
          <div className="text-muted-foreground flex h-full min-h-32 items-center justify-center p-6 text-center text-sm">
            El carrito está vacío. Escanea o busca un producto.
          </div>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => {
              const computed = totals.lines.find((l) => l.key === line.productId);
              const qty = D(line.quantity);
              const available = D(line.stockAvailable);
              const short = qty.gt(available);
              const hasDiscount = D(line.discountValue).gt(0) || (computed && computed.discountUsd.gt(0));
              return (
                <li key={line.productId} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => setEditing(line)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium leading-tight">{line.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatMoney(line.unitPriceUsd, "USD")} × {formatQty(line.quantity, line.unitDecimals)} {line.unitSymbol}
                        {line.partNumber ? ` · ${line.partNumber}` : ""}
                      </span>
                      {hasDiscount && computed ? (
                        <span className="text-emerald-700 block text-xs dark:text-emerald-400">
                          Descuento {line.discountType === "pct" && D(line.discountValue).gt(0) ? `${D(line.discountValue).toString()} % · ` : ""}−{formatMoney(computed.discountUsd, "USD")}
                        </span>
                      ) : null}
                      {short ? (
                        <span className="text-destructive flex items-center gap-1 text-xs font-medium">
                          <TriangleAlert className="size-3" /> Solo hay {formatQty(available, line.unitDecimals)} disponibles
                        </span>
                      ) : null}
                    </button>
                    <span className="shrink-0 text-right text-base font-semibold tabular-nums">{computed ? formatMoney(computed.lineTotalUsd, "USD") : "—"}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-end gap-1">
                    <Button type="button" variant="outline" size="icon" className="size-10" aria-label="Menos" onClick={() => store.getState().incrementQuantity(line.productId, -1)}>
                      <Minus />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditing(line)}
                      className="hover:bg-muted h-10 min-w-14 rounded-lg border px-2 text-center text-base font-semibold tabular-nums"
                      aria-label="Editar cantidad"
                    >
                      {formatQty(line.quantity, line.unitDecimals)}
                    </button>
                    <Button type="button" variant="outline" size="icon" className="size-10" aria-label="Más" onClick={() => store.getState().incrementQuantity(line.productId, 1)}>
                      <Plus />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1 rounded-xl border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatMoney(totals.subtotalUsd, "USD")}</span>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setDiscountOpen(true)} className="text-primary flex items-center gap-1 font-medium hover:underline" disabled={lines.length === 0}>
            <Percent className="size-3.5" /> {globalDiscount ? "Descuento general" : "Agregar descuento"}
          </button>
          <span className={cn("tabular-nums", totals.discountUsd.gt(0) && "text-emerald-700 dark:text-emerald-400")}>
            {totals.discountUsd.gt(0) ? `−${formatMoney(totals.discountUsd, "USD")}` : formatMoney(0, "USD")}
          </span>
        </div>
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>IVA incluido</span>
          <span className="tabular-nums">{formatMoney(totals.taxUsd, "USD")}</span>
        </div>
        {overLimit ? (
          <p className="text-destructive flex items-center gap-1 text-xs">
            <TriangleAlert className="size-3" /> Descuento sobre tu límite ({config.policies.maxDiscountPct} %): se pedirá PIN de administrador.
          </p>
        ) : null}
        <div className="mt-1 flex items-end justify-between border-t pt-2">
          <span className="text-base font-semibold">Total</span>
          <span className="text-3xl font-bold tabular-nums">{formatMoney(totals.totalUsd, "USD")}</span>
        </div>
        <p className="text-muted-foreground text-right text-sm tabular-nums">
          {config.rates.missing.length > 0 && !amounts.VES ? "Sin tasa del día" : null}
          {["VES", "COP"]
            .filter((c) => amounts[c])
            .map((c) => formatMoney(amounts[c], c))
            .join("  ·  ")}
        </p>
      </div>

      <div className="hidden gap-2 lg:flex">
        {isQuote ? (
          <Button type="button" size="lg" className="h-12 flex-1 text-base" disabled={lines.length === 0} onClick={onQuote}>
            <FileText /> Guardar cotización
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size="lg" className="h-12" disabled={lines.length === 0} onClick={onHold}>
              <PauseCircle /> En espera
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12" disabled={lines.length === 0} onClick={onQuote}>
              <FileText /> Cotizar
            </Button>
            <Button type="button" size="lg" className="h-12 flex-1 text-base" disabled={lines.length === 0} onClick={onCheckout}>
              Cobrar <Kbd className="bg-primary-foreground/20 text-primary-foreground">F9</Kbd>
            </Button>
          </>
        )}
      </div>

      <LineEditor
        line={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        maxDiscountPct={config.policies.maxDiscountPct}
        onSave={(quantity, type, value) => {
          if (!editing) return;
          store.getState().setQuantity(editing.productId, quantity);
          store.getState().setLineDiscount(editing.productId, type, value);
        }}
        onRemove={() => editing && store.getState().removeLine(editing.productId)}
      />
      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        value={globalDiscount}
        subtotalUsd={totals.subtotalUsd.toString()}
        maxDiscountPct={config.policies.maxDiscountPct}
        onSave={(d) => store.getState().setGlobalDiscount(d)}
      />
    </div>
  );
}
