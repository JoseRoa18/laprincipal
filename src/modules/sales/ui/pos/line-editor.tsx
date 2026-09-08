"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatQty, parseLocalizedNumber } from "@/lib/format";
import { D, roundTo } from "@/lib/money";
import type { CartLineData } from "../../application/schemas";
import { DiscountTypeToggle } from "./discount-dialog";

interface Props {
  line: CartLineData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (quantity: string, discountType: "pct" | "amount", discountValue: string) => void;
  onRemove: () => void;
  maxDiscountPct: number;
}

/** Edit quantity (with unit decimals) and the line discount. */
export function LineEditor({ line, open, onOpenChange, onSave, onRemove, maxDiscountPct }: Props) {
  return (
    <Dialog open={open && line !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {line ? (
          <LineForm
            key={line.productId}
            line={line}
            maxDiscountPct={maxDiscountPct}
            onSave={(q, t, v) => {
              onSave(q, t, v);
              onOpenChange(false);
            }}
            onRemove={() => {
              onRemove();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LineForm({
  line,
  maxDiscountPct,
  onSave,
  onRemove,
  onCancel,
}: {
  line: CartLineData;
  maxDiscountPct: number;
  onSave: Props["onSave"];
  onRemove: () => void;
  onCancel: () => void;
}) {
  const decimals = line.unitDecimals;
  const [quantity, setQuantity] = useState(() => formatQty(line.quantity, decimals));
  const [type, setType] = useState<"pct" | "amount">(line.discountType);
  const [value, setValue] = useState(() => (D(line.discountValue).gt(0) ? D(line.discountValue).toString() : ""));
  const [error, setError] = useState<string | null>(null);

  function step(delta: number) {
    const parsed = parseLocalizedNumber(quantity) ?? "0";
    const next = roundTo(D(parsed).plus(delta), decimals);
    const min = decimals > 0 ? D(1).div(10 ** decimals) : D(1);
    setQuantity(formatQty(next.lte(0) ? min : next, decimals));
  }

  function save() {
    const parsedQty = parseLocalizedNumber(quantity);
    if (!parsedQty || D(parsedQty).lte(0)) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    const parsedDiscount = value.trim() ? parseLocalizedNumber(value) : "0";
    if (parsedDiscount === null || D(parsedDiscount).lt(0)) {
      setError("El descuento no es válido.");
      return;
    }
    if (type === "pct" && D(parsedDiscount).gt(100)) {
      setError("El porcentaje no puede superar 100.");
      return;
    }
    onSave(roundTo(parsedQty, decimals).toString(), type, D(parsedDiscount).toString());
  }

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
        <DialogTitle className="truncate">{line.name}</DialogTitle>
        <DialogDescription>
          {formatMoney(line.unitPriceUsd, "USD")} por {line.unitSymbol} · Disponible: {formatQty(line.stockAvailable, decimals)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="line-qty">Cantidad</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon-lg" className="size-11" aria-label="Menos" onClick={() => step(-1)}>
              <Minus />
            </Button>
            <Input
              id="line-qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 text-center text-lg font-semibold"
            />
            <Button type="button" variant="outline" size="icon-lg" className="size-11" aria-label="Más" onClick={() => step(1)}>
              <Plus />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="line-discount">Descuento de la línea</Label>
          <div className="flex items-center gap-2">
            <DiscountTypeToggle value={type} onChange={setType} />
            <Input id="line-discount" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className="h-11 text-right text-base" />
          </div>
          <p className="text-muted-foreground text-xs">Tu límite es {maxDiscountPct} %. Por encima se pide el PIN de un administrador al cobrar.</p>
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="destructive" className="sm:mr-auto" onClick={onRemove}>
          <Trash2 /> Quitar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={save}>
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}
