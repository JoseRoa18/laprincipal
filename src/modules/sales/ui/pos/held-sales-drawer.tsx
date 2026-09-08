"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, PauseCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { discardHeldSaleAction } from "@/app/(app)/vender/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Money } from "@/components/app/money";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import type { CartPayload } from "../../application/schemas";
import type { HeldSaleRow } from "../../infrastructure/sales-queries";

export const HELD_SALES_KEY = ["held-sales"];

export async function fetchHeldSales(): Promise<HeldSaleRow[]> {
  const res = await fetch("/api/sales/held", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudieron cargar las ventas en espera.");
  return ((await res.json()) as { sales: HeldSaleRow[] }).sales;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartHasLines: boolean;
  onResume: (payload: CartPayload) => void;
}

/** "Ventas en espera": any user can resume or discard a parked cart. */
export function HeldSalesDrawer({ open, onOpenChange, cartHasLines, onResume }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: HELD_SALES_KEY, queryFn: fetchHeldSales, enabled: open });
  const [pendingResume, setPendingResume] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function resume(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/sales/held/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const payload = (await res.json()) as CartPayload;
      onResume(payload);
      onOpenChange(false);
      toast.success(`Venta “${payload.holdLabel ?? ""}” retomada`);
    } catch {
      toast.error("No se pudo retomar la venta. Puede que otro usuario ya la haya cobrado.");
      void queryClient.invalidateQueries({ queryKey: HELD_SALES_KEY });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PauseCircle className="size-5" /> Ventas en espera
            </SheetTitle>
            <SheetDescription>Carritos guardados para atender a otro cliente. Cualquier vendedor puede retomarlos.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : isError ? (
              <p className="text-destructive text-sm">No se pudieron cargar las ventas en espera.</p>
            ) : !data || data.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No hay ventas en espera.</p>
            ) : (
              data.map((row) => (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.lineCount} {row.lineCount === 1 ? "línea" : "líneas"} · {row.sellerName}
                        {row.customerName ? ` · ${row.customerName}` : ""}
                      </p>
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Clock className="size-3" /> {formatDateTime(row.createdAt)}
                      </p>
                    </div>
                    <Money value={row.totalUsd} currency="USD" className="text-lg font-semibold" />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      size="lg"
                      disabled={loadingId === row.id}
                      onClick={() => (cartHasLines ? setPendingResume(row.id) : void resume(row.id))}
                    >
                      {loadingId === row.id ? "Cargando..." : "Retomar"}
                    </Button>
                    <ConfirmButton
                      title="¿Descartar esta venta en espera?"
                      description="Se borrará el carrito guardado. Esta acción no se puede deshacer."
                      confirmLabel="Descartar"
                      destructive
                      size="lg"
                      variant="outline"
                      action={() => discardHeldSaleAction(row.id)}
                      successMessage="Venta descartada"
                      onSuccess={() => void queryClient.invalidateQueries({ queryKey: HELD_SALES_KEY })}
                    >
                      Descartar
                    </ConfirmButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingResume !== null} onOpenChange={(o) => !o && setPendingResume(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El carrito actual se reemplazará</AlertDialogTitle>
            <AlertDialogDescription>Tienes productos en el carrito. Ponlos en espera primero si quieres conservarlos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingResume;
                setPendingResume(null);
                if (id) void resume(id);
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
