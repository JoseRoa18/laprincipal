"use client";

import { Ban, FileText, Printer, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shareSaleWhatsAppAction, voidSaleAction } from "@/app/(app)/ventas/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/errors";

/** Opens the WhatsApp share link once the signed PDF exists. */
export function ShareWhatsAppButton({
  action,
  label = "Compartir por WhatsApp",
  variant = "outline",
  size = "default",
}: {
  action: () => Promise<ActionResult<{ url: string; waLink: string }>>;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [pending, startTransition] = useTransition();

  function share() {
    // Open the tab during the click so the browser does not block it after the await.
    const popup = window.open("", "_blank");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        popup?.close();
        toast.error(result.error.message);
        return;
      }
      if (popup) popup.location.href = result.data.waLink;
      else window.open(result.data.waLink, "_blank");
    });
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={share} disabled={pending}>
      <Send /> {pending ? "Preparando PDF..." : label}
    </Button>
  );
}

interface Props {
  saleId: string;
  number: string | null;
  canReturn: boolean;
  canVoid: boolean;
  outsideVoidWindow: boolean;
  voidWindowHours: number;
}

export function SaleActions({ saleId, number, canReturn, canVoid, outsideVoidWindow, voidWindowHours }: Props) {
  const [voidOpen, setVoidOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" render={<a href={`/imprimir/ticket/${saleId}?auto=1`} target="_blank" rel="noopener" />}>
        <Printer /> Imprimir ticket
      </Button>
      <Button variant="outline" render={<a href={`/api/sales/${saleId}/pdf`} target="_blank" rel="noopener" />}>
        <FileText /> Nota de entrega PDF
      </Button>
      <ShareWhatsAppButton action={() => shareSaleWhatsAppAction(saleId)} />
      {canReturn ? (
        <Button variant="outline" render={<Link href={`/ventas/${saleId}/devolver`} />}>
          <RotateCcw /> Devolver
        </Button>
      ) : null}
      {canVoid ? (
        <Button variant="destructive" onClick={() => setVoidOpen(true)}>
          <Ban /> Anular
        </Button>
      ) : null}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <VoidForm saleId={saleId} number={number} outsideVoidWindow={outsideVoidWindow} voidWindowHours={voidWindowHours} onDone={() => setVoidOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoidForm({
  saleId,
  number,
  outsideVoidWindow,
  voidWindowHours,
  onDone,
}: {
  saleId: string;
  number: string | null;
  outsideVoidWindow: boolean;
  voidWindowHours: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < 3) {
      setError("Escribe el motivo de la anulación.");
      return;
    }
    startTransition(async () => {
      const result = await voidSaleAction({ saleId, reason: reason.trim() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Venta ${number ?? ""} anulada. El stock volvió al inventario.`);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Anular la venta {number}</DialogTitle>
        <DialogDescription>
          Los productos vuelven al inventario y la venta queda marcada como anulada. Esta acción no se puede deshacer.
          {outsideVoidWindow ? ` Han pasado más de ${voidWindowHours} horas: solo un administrador puede anularla.` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="void-reason">Motivo</Label>
        <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cliente se arrepintió, error al cobrar…" autoFocus rows={3} />
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
        <Button type="button" variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
          {pending ? "Anulando..." : "Anular venta"}
        </Button>
      </DialogFooter>
    </>
  );
}
