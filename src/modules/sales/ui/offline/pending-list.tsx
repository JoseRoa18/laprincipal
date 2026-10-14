"use client";

import { CircleCheck, CloudOff, Printer, RefreshCw, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { printOfflineReceipt } from "./offline-receipt";
import { useOfflineStore } from "./offline-store";

/** The device's queue: sales and customers made offline, with their state and what to do. */
export function PendingList({ canDiscard }: { canDiscard: boolean }) {
  const loaded = useOfflineStore((s) => s.loaded);
  const online = useOfflineStore((s) => s.online);
  const syncing = useOfflineStore((s) => s.syncing);
  const sales = useOfflineStore((s) => s.sales);
  const customers = useOfflineStore((s) => s.customers);
  const company = useOfflineStore((s) => s.snapshot?.company ?? null);
  const snapshotAt = useOfflineStore((s) => s.snapshot?.generatedAt ?? null);
  const store = useOfflineStore.getState;

  if (!loaded) return null;

  const retryAll = () => {
    for (const s of store().sales.filter((x) => x.status === "error")) void store().updateSale(s.id, { status: "pending", error: null });
    for (const c of store().customers.filter((x) => x.status === "error")) void store().updateCustomer(c.id, { status: "pending", error: null });
    store().requestSync();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <p className="flex items-center gap-2">
          {online ? <CircleCheck className="size-4 text-emerald-600" aria-hidden="true" /> : <CloudOff className="size-4 text-amber-600" aria-hidden="true" />}
          {online ? "Con conexión" : "Sin conexión"}
          {snapshotAt ? <span className="text-muted-foreground">· precios guardados el {new Date(snapshotAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}</span> : null}
        </p>
        {sales.length + customers.length > 0 ? (
          <Button type="button" size="sm" onClick={retryAll} disabled={!online || syncing}>
            <RefreshCw className={syncing ? "animate-spin" : undefined} /> {syncing ? "Enviando…" : "Enviar ahora"}
          </Button>
        ) : null}
      </div>

      {sales.length + customers.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nada por enviar" description="Todas las ventas de este equipo están registradas en el sistema." />
      ) : (
        <ul className="divide-y rounded-xl border">
          {customers.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <UserRound className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Cliente nuevo: {c.name}</p>
                <p className="text-muted-foreground text-xs">Registrado sin conexión · {new Date(c.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}</p>
                {c.error ? <p className="text-destructive text-xs">{c.error}</p> : null}
              </div>
              <Badge variant={c.status === "error" ? "destructive" : "secondary"}>{c.status === "error" ? "Revisar" : "Por enviar"}</Badge>
            </li>
          ))}
          {sales.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.number} · {s.receipt.customer.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(s.soldAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })} · {s.receipt.sellerName} · {s.receipt.lines.length}{" "}
                    {s.receipt.lines.length === 1 ? "producto" : "productos"}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatMoney(s.receipt.totals.totalUsd, "USD")}</span>
                <Badge variant={s.status === "error" ? "destructive" : "secondary"}>{s.status === "error" ? "Revisar" : "Por enviar"}</Badge>
              </div>
              {s.error ? (
                <p className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {s.error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => printOfflineReceipt(s.receipt, company)}>
                  <Printer /> Comprobante
                </Button>
                {s.status === "error" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!online}
                    onClick={() => {
                      void store()
                        .updateSale(s.id, { status: "pending", error: null })
                        .then(() => store().requestSync());
                    }}
                  >
                    <RefreshCw /> Reintentar
                  </Button>
                ) : null}
                {canDiscard ? (
                  <ConfirmButton
                    title={`Descartar la venta ${s.number}`}
                    description="Se borra de este equipo y nunca llegará al sistema: no descuenta existencia ni entra en la caja. Hazlo solo si la venta no ocurrió o ya se registró a mano."
                    confirmLabel="Descartar"
                    destructive
                    variant="ghost"
                    size="sm"
                    successMessage={`Venta ${s.number} descartada`}
                    action={async () => {
                      await store().removeSale(s.id);
                      return { ok: true as const, data: null };
                    }}
                  >
                    <Trash2 /> Descartar
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
