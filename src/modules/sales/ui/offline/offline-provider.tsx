"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { completeSaleAction, quickCreateCustomerAction } from "@/app/(app)/vender/actions";
import type { OfflineSnapshot } from "../../domain/offline";
import { isNetworkError, useOfflineStore } from "./offline-store";

/** How often the saved catalog is refreshed while online. */
const SNAPSHOT_EVERY_MS = 5 * 60_000;
/** How often waiting sales are retried while online. */
const SYNC_EVERY_MS = 20_000;

/**
 * Keeps the counter ready to work without a connection: saves the catalog
 * and customers on the device, follows the connection state and sends the
 * customers and sales made offline as soon as it is back. Mounted once in
 * the app layout for the roles that sell.
 */
export function OfflineProvider() {
  const load = useOfflineStore((s) => s.load);
  const setOnline = useOfflineStore((s) => s.setOnline);
  const syncing = useRef(false);

  const refreshSnapshot = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await fetch("/api/sales/offline-snapshot", { cache: "no-store" });
      if (!res.ok) return;
      await useOfflineStore.getState().setSnapshot((await res.json()) as OfflineSnapshot);
      setOnline(true);
    } catch (err) {
      if (isNetworkError(err)) setOnline(false);
    }
  }, [setOnline]);

  const sync = useCallback(async () => {
    const store = useOfflineStore.getState();
    if (syncing.current || !navigator.onLine || (store.sales.length === 0 && store.customers.length === 0)) return;
    syncing.current = true;
    store.setSyncing(true);
    try {
      // Customers first: the sales made to them need them on the server.
      for (const c of useOfflineStore.getState().customers.filter((c) => c.status === "pending")) {
        const result = await quickCreateCustomerAction(c.input, c.id);
        if (result.ok) await useOfflineStore.getState().removeCustomer(c.id);
        else await useOfflineStore.getState().updateCustomer(c.id, { status: "error", error: result.error.message });
      }
      for (const sale of useOfflineStore.getState().sales.filter((s) => s.status === "pending")) {
        if (useOfflineStore.getState().customers.some((c) => c.id === sale.customerId)) continue;
        const result = await completeSaleAction(sale.input);
        if (result.ok) {
          await useOfflineStore.getState().removeSale(sale.id);
          toast.success(`Venta ${sale.number} enviada: ahora es la ${result.data.number}`);
          continue;
        }
        // A closed cash register only delays it: it goes when the register opens.
        if (result.error.code === "CASH_SESSION_REQUIRED") {
          await useOfflineStore.getState().updateSale(sale.id, { error: result.error.message, attempts: sale.attempts + 1 });
          break;
        }
        await useOfflineStore.getState().updateSale(sale.id, { status: "error", error: result.error.message, attempts: sale.attempts + 1 });
        toast.error(`La venta ${sale.number} no se pudo enviar: ${result.error.message}`);
      }
      setOnline(true);
    } catch (err) {
      // The connection dropped again halfway: what was not sent stays queued.
      if (isNetworkError(err)) setOnline(false);
    } finally {
      syncing.current = false;
      useOfflineStore.getState().setSyncing(false);
    }
  }, [setOnline]);

  useEffect(() => {
    void load().then(() => {
      void refreshSnapshot();
      void sync();
    });
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void refreshSnapshot();
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const snapshotTimer = window.setInterval(() => void refreshSnapshot(), SNAPSHOT_EVERY_MS);
    const syncTimer = window.setInterval(() => void sync(), SYNC_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(snapshotTimer);
      window.clearInterval(syncTimer);
    };
  }, [load, refreshSnapshot, setOnline, sync]);

  // "Enviar ahora" on the waiting list.
  const syncRequests = useOfflineStore((s) => s.syncRequests);
  useEffect(() => {
    if (syncRequests > 0) void sync();
  }, [syncRequests, sync]);

  // The app shell (Vender, Consultar precio) opens without a connection. Only in
  // production builds: in development a cached page would hide code changes.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}

/** Run by the sign-out buttons: cached pages and the saved catalog go; unsent sales stay. */
export async function forgetOfflineData() {
  await useOfflineStore.getState().forgetCatalog();
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("lp-")).map((k) => caches.delete(k)));
  }
}
