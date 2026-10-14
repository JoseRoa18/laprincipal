"use client";

import { create } from "zustand";
import type { CustomerInput } from "@/modules/customers/domain/schema";
import type { ChangeGiven } from "../../domain/payments";
import { findByBarcodeOffline, priceOffline, provisionalNumber, searchOffline, type OfflineCustomer, type OfflinePricedProduct, type OfflineSnapshot } from "../../domain/offline";
import { idbDelete, idbGet, idbSet } from "./idb";

/** What the ticket of a sale saved offline shows until the server numbers it. */
export interface OfflineReceipt {
  number: string;
  soldAt: string;
  sellerName: string;
  customer: { name: string; doc: string | null };
  lines: Array<{ name: string; sku: string; quantity: string; unitSymbol: string; unitDecimals: number; unitPriceUsd: string; totalUsd: string }>;
  totals: { subtotalUsd: string; discountUsd: string; taxUsd: string; totalUsd: string };
  payments: Array<{ name: string; currencyCode: string; amount: string; reference: string | null }>;
  changeParts: ChangeGiven[];
  rates: Record<string, string>;
}

/** A sale made without a connection, waiting to be sent. */
export interface PendingSale {
  /** Also the clientRequestId: sending it twice creates one sale. */
  id: string;
  number: string;
  soldAt: string;
  customerId: string;
  /** Exactly what completeSaleAction receives, with `offline` set. */
  input: Record<string, unknown>;
  receipt: OfflineReceipt;
  /** "error": the server refused it and a person must look at it. */
  status: "pending" | "error";
  error: string | null;
  attempts: number;
}

/** A customer registered without a connection (the device chose the id). */
export interface PendingCustomer {
  id: string;
  name: string;
  input: CustomerInput;
  createdAt: string;
  status: "pending" | "error";
  error: string | null;
}

interface OfflineState {
  loaded: boolean;
  /** Last known connection state (navigator.onLine plus failed requests). */
  online: boolean;
  snapshot: OfflineSnapshot | null;
  sales: PendingSale[];
  customers: PendingCustomer[];
  seq: number;
  syncing: boolean;
  /** Bumped by "Enviar ahora": the provider sends the queue right away. */
  syncRequests: number;
  requestSync: () => void;
  load: () => Promise<void>;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setSnapshot: (snapshot: OfflineSnapshot) => Promise<void>;
  addSale: (sale: Omit<PendingSale, "number" | "status" | "error" | "attempts">) => Promise<PendingSale>;
  updateSale: (id: string, patch: Partial<PendingSale>) => Promise<void>;
  removeSale: (id: string) => Promise<void>;
  addCustomer: (customer: Omit<PendingCustomer, "status" | "error">, saved: OfflineCustomer) => Promise<void>;
  updateCustomer: (id: string, patch: Partial<PendingCustomer>) => Promise<void>;
  removeCustomer: (id: string) => Promise<void>;
  /** Signing out: the catalog and customers go; sales still to send stay. */
  forgetCatalog: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>()((set, get) => ({
  loaded: false,
  online: true,
  snapshot: null,
  sales: [],
  customers: [],
  seq: 0,
  syncing: false,
  syncRequests: 0,
  requestSync: () => set((s) => ({ syncRequests: s.syncRequests + 1 })),

  async load() {
    if (get().loaded) return;
    try {
      const [snapshot, sales, customers, seq] = await Promise.all([
        idbGet<OfflineSnapshot>("snapshot"),
        idbGet<PendingSale[]>("sales"),
        idbGet<PendingCustomer[]>("customers"),
        idbGet<number>("seq"),
      ]);
      set({ loaded: true, snapshot: snapshot ?? null, sales: sales ?? [], customers: customers ?? [], seq: seq ?? 0 });
    } catch {
      // Private window or storage blocked: works online only.
      set({ loaded: true });
    }
  },
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  async setSnapshot(snapshot) {
    // Customers registered offline and not sent yet stay findable.
    const extra = get().snapshot?.customers.filter((c) => get().customers.some((p) => p.id === c.id) && !snapshot.customers.some((s) => s.id === c.id)) ?? [];
    const merged = { ...snapshot, customers: [...snapshot.customers, ...extra] };
    set({ snapshot: merged });
    await idbSet("snapshot", merged).catch(() => undefined);
  },
  async addSale(sale) {
    const seq = get().seq + 1;
    const pending: PendingSale = { ...sale, number: provisionalNumber(seq), status: "pending", error: null, attempts: 0 };
    pending.receipt = { ...pending.receipt, number: pending.number };
    const sales = [...get().sales, pending];
    set({ seq, sales });
    await Promise.all([idbSet("seq", seq), idbSet("sales", sales)]);
    return pending;
  },
  async updateSale(id, patch) {
    const sales = get().sales.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sales });
    await idbSet("sales", sales);
  },
  async removeSale(id) {
    const sales = get().sales.filter((s) => s.id !== id);
    set({ sales });
    await idbSet("sales", sales);
  },
  async addCustomer(customer, saved) {
    const customers = [...get().customers, { ...customer, status: "pending" as const, error: null }];
    const snapshot = get().snapshot;
    const nextSnapshot = snapshot ? { ...snapshot, customers: [...snapshot.customers, saved] } : null;
    set({ customers, snapshot: nextSnapshot });
    await Promise.all([idbSet("customers", customers), nextSnapshot ? idbSet("snapshot", nextSnapshot) : Promise.resolve()]);
  },
  async updateCustomer(id, patch) {
    const customers = get().customers.map((c) => (c.id === id ? { ...c, ...patch } : c));
    set({ customers });
    await idbSet("customers", customers);
  },
  async removeCustomer(id) {
    const customers = get().customers.filter((c) => c.id !== id);
    set({ customers });
    await idbSet("customers", customers);
  },
  async forgetCatalog() {
    set({ snapshot: null });
    await idbDelete("snapshot").catch(() => undefined);
  },
}));

/** True when the last request failed or the browser says there is no network. */
export function isOffline(): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || !useOfflineStore.getState().online;
}

/** A request that failed for lack of connection (not an HTTP error). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch|network|Failed to fetch|Load failed/i.test(err.message));
}

/** The POS product endpoint answered from the saved catalog: same params, same result shape. */
export function productsFromSnapshot(params: Record<string, string>): OfflinePricedProduct[] | null {
  const snapshot = useOfflineStore.getState().snapshot;
  if (!snapshot) return null;
  const customerType = params.priceListId && params.priceListId === snapshot.techListId ? "technician" : "public";
  const price = (list: typeof snapshot.products) => list.map((p) => priceOffline(p, customerType));
  if (params.barcode) {
    const hit = findByBarcodeOffline(snapshot.products, params.barcode);
    return hit ? price([hit]) : [];
  }
  if (params.ids) {
    const ids = new Set(params.ids.split(","));
    return price(snapshot.products.filter((p) => ids.has(p.id)));
  }
  return price(searchOffline(snapshot.products, params.q ?? ""));
}
