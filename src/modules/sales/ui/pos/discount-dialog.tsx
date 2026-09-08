"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { cn } from "cn";
import type { GlobalDiscount } from "../cart-store";

export function DiscountTypeToggle({ value, onChange }: { value: "pct" | "amount"; onChange: (v: "pct" | "amount") => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo de descuento" className="bg-muted flex shrink-0 rounded-lg p-0.5">
      {(["pct", "amount"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cn(
            "h-10 min-w-11 rounded-md px-3 text-sm font-semibold transition-colors",
            value === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t === "pct" ? "%" : "$"}
        </button>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: GlobalDiscount | null;
  subtotalUsd: string;
  maxDiscountPct: number;
  onSave: (discount: GlobalDiscount | null) => void;
}

/** Discount applied to the whole sale, prorated across lines by the domain. */
export function DiscountDialog({ open, onOpenChange, value, subtotalUsd, maxDiscountPct, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-sm">
        <DiscountForm
          value={value}
          subtotalUsd={subtotalUsd}
          maxDiscountPct={maxDiscountPct}
          onSave={(d) => {
            onSave(d);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DiscountForm({
  value,
  subtotalUsd,
  maxDiscountPct,
  onSave,
  onCancel,
}: Omit<Props, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [type, setType] = useState<"pct" | "amount">(value?.type ?? "pct");
  const [amount, setAmount] = useState(() => (value && D(value.value).gt(0) ? D(value.value).toString() : ""));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = amount.trim() ? parseLocalizedNumber(amount) : "0";
    if (parsed === null || D(parsed).lt(0)) {
      setError("El descuento no es válido.");
      return;
    }
    if (type === "pct" && D(parsed).gt(100)) {
      setError("El porcentaje no puede superar 100.");
      return;
    }
    onSave(D(parsed).gt(0) ? { type, value: D(parsed).toString() } : null);
  }

  const parsedPreview = amount.trim() ? parseLocalizedNumber(amount) : null;
  const preview = parsedPreview
    ? (() => {
        const sub = D(subtotalUsd);
        const d = type === "pct" ? sub.mul(parsedPreview).div(100) : D(parsedPreview);
        return formatMoney(d.gt(sub) ? sub : d, "USD");
      })()
    : null;

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          save();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Descuento a toda la venta</DialogTitle>
        <DialogDescription>Se reparte entre las líneas. Subtotal: {formatMoney(subtotalUsd, "USD")}.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="global-discount">Descuento</Label>
        <div className="flex items-center gap-2">
          <DiscountTypeToggle value={type} onChange={setType} />
          <Input id="global-discount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus placeholder="0" className="h-11 text-right text-lg" />
        </div>
        {preview ? <p className="text-muted-foreground text-sm">Descuento: {preview}</p> : null}
        <p className="text-muted-foreground text-xs">Tu límite es {maxDiscountPct} %. Por encima se pide el PIN de un administrador al cobrar.</p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        {value ? (
          <Button type="button" variant="ghost" className="sm:mr-auto" onClick={() => onSave(null)}>
            Quitar descuento
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={save}>
          Aplicar
        </Button>
      </DialogFooter>
    </div>
  );
}
