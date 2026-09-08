"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel: string | null;
  onSubmit: (label: string) => Promise<boolean>;
}

/** "Poner en espera": asks for a label to recognise the customer later. */
export function HoldDialog({ open, onOpenChange, initialLabel, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-sm">
        <HoldForm initialLabel={initialLabel} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function HoldForm({ initialLabel, onSubmit, onDone }: { initialLabel: string | null; onSubmit: Props["onSubmit"]; onDone: () => void }) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!label.trim()) return;
    startTransition(async () => {
      const ok = await onSubmit(label.trim());
      if (ok) onDone();
    });
  }

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Poner en espera</DialogTitle>
        <DialogDescription>Escribe algo que te ayude a reconocer al cliente cuando vuelva.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="hold-label">Etiqueta</Label>
        <Input id="hold-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cliente de la gorra azul" autoFocus maxLength={80} className="h-11" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !label.trim()}>
          {pending ? "Guardando..." : "Guardar en espera"}
        </Button>
      </DialogFooter>
    </div>
  );
}
