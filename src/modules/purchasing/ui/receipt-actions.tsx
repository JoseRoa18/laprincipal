"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { voidReceiptAction } from "@/app/(app)/compras/entradas/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "Anular entrada" with a mandatory reason (admin only). */
export function VoidReceiptDialog({ receiptId, number }: { receiptId: string; number: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await voidReceiptAction({ id: receiptId, reason });
      if (!result.ok) {
        const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
        setError(fields.reason ?? result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(`Entrada ${number ?? ""} anulada`.trim());
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Ban data-icon="inline-start" /> Anular
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anular entrada {number}</DialogTitle>
          <DialogDescription>
            Se descontará del inventario lo recibido y se restaurará el costo promedio. Solo es posible si ningún producto tuvo movimientos después de esta entrada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-reason">Motivo</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: factura duplicada" aria-invalid={error ? true : undefined} />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Volver
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? "Anulando..." : "Anular entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
