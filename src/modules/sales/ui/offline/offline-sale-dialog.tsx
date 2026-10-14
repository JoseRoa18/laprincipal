"use client";

import { CloudOff, Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { formatChange } from "../../domain/payments";
import { printOfflineReceipt } from "./offline-receipt";
import { useOfflineStore, type PendingSale } from "./offline-store";

/** Right after a sale made without a connection: what to hand back and that it will be sent later. */
export function OfflineSaleDialog({ sale, autoPrint, onClose }: { sale: PendingSale | null; autoPrint: boolean; onClose: () => void }) {
  const company = useOfflineStore((s) => s.snapshot?.company ?? null);

  useEffect(() => {
    if (sale && autoPrint) printOfflineReceipt(sale.receipt, company);
    // Print once per sale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {sale ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CloudOff className="size-5 text-amber-600" aria-hidden="true" /> Venta {sale.number} guardada sin conexión
              </DialogTitle>
              <DialogDescription>Quedó en este equipo y se envía sola cuando vuelva internet; ahí recibe su número de venta.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{sale.receipt.customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">{formatMoney(sale.receipt.totals.totalUsd, "USD")}</span>
              </div>
              {sale.receipt.changeParts.length > 0 ? (
                <div className="flex justify-between text-base">
                  <span className="text-muted-foreground">Cambio</span>
                  <span className="font-bold tabular-nums">{formatChange(sale.receipt.changeParts)}</span>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => printOfflineReceipt(sale.receipt, company)}>
                <Printer /> Imprimir comprobante
              </Button>
              <Button type="button" onClick={onClose} autoFocus>
                Nueva venta
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
