"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveQuoteAction } from "@/app/(app)/vender/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { businessDate } from "@/lib/format";
import { useCart, useCartStore } from "../cart-store";
import type { PosConfig } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PosConfig;
}

function plusDays(days: number): string {
  return businessDate(new Date(Date.now() + days * 86_400_000));
}

/** "Guardar como cotización" from the POS or the quote screen. */
export function QuoteDialog({ open, onOpenChange, config }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <QuoteForm config={config} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function QuoteForm({ config, onDone }: { config: PosConfig; onDone: () => void }) {
  const router = useRouter();
  const store = useCartStore();
  const lines = useCart((s) => s.lines);
  const customer = useCart((s) => s.customer);
  const globalDiscount = useCart((s) => s.globalDiscount);
  const cartNotes = useCart((s) => s.notes);
  const [validUntil, setValidUntil] = useState(() => plusDays(config.policies.quoteValidityDays));
  const [notes, setNotes] = useState(cartNotes);
  const [reserve, setReserve] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveQuoteAction({
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, discountType: l.discountType, discountValue: l.discountValue })),
        customerId: customer?.id ?? null,
        globalDiscount,
        validUntil: validUntil || null,
        notes: notes.trim() || null,
        reserveStock: reserve,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      store.getState().clear();
      toast.success(`Cotización ${result.data.number} guardada`);
      onDone();
      router.push(`/cotizaciones/${result.data.quoteId}`);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Guardar cotización</DialogTitle>
        <DialogDescription>
          {lines.length} {lines.length === 1 ? "producto" : "productos"} para {customer ? customer.name : "consumidor final"}.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="quote-valid">Válida hasta</Label>
          <Input id="quote-valid" type="date" value={validUntil} min={businessDate()} onChange={(e) => setValidUntil(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quote-notes">Notas para el cliente</Label>
          <Textarea id="quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, tiempo de entrega…" rows={3} />
        </div>
        <Label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
          <Checkbox checked={reserve} onCheckedChange={(checked) => setReserve(Boolean(checked))} />
          <span>
            <span className="block font-medium">Reservar stock</span>
            <span className="text-muted-foreground block text-xs font-normal">Aparta las cantidades hasta que la cotización venza, se cancele o se convierta en venta.</span>
          </span>
        </Label>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending || lines.length === 0}>
          {pending ? "Guardando..." : "Guardar cotización"}
        </Button>
      </DialogFooter>
    </>
  );
}
