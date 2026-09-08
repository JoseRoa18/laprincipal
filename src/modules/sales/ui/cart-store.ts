"use client";

import { createContext, useContext, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { D, roundTo } from "@/lib/money";
import { computeTotals, effectiveDiscountPct, type SaleTotals } from "../domain/pricing";
import type { CartCustomer, CartLineData, CartPayload, PosProduct } from "../application/schemas";

export interface GlobalDiscount {
  type: "pct" | "amount";
  value: string;
}

export interface SupervisorAuth {
  token: string;
  expiresAt: number;
  name: string;
}

export interface CartState {
  lines: CartLineData[];
  customer: CartCustomer | null;
  globalDiscount: GlobalDiscount | null;
  notes: string;
  heldSaleId: string | null;
  holdLabel: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  supervisor: SupervisorAuth | null;
  /** A quote or held sale waiting for the user to confirm replacing the cart (not persisted). */
  pendingCart: CartPayload | null;
  hydrated: boolean;

  addProduct: (product: PosProduct, quantity?: string) => void;
  setQuantity: (productId: string, quantity: string) => void;
  incrementQuantity: (productId: string, delta: number) => void;
  removeLine: (productId: string) => void;
  setLineDiscount: (productId: string, type: "pct" | "amount", value: string) => void;
  setGlobalDiscount: (discount: GlobalDiscount | null) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setNotes: (notes: string) => void;
  setSupervisor: (auth: SupervisorAuth | null) => void;
  setPendingCart: (payload: CartPayload | null) => void;
  /** Refresh prices and stock of the lines with fresh product data. */
  applyProducts: (products: PosProduct[]) => void;
  load: (payload: CartPayload) => void;
  clear: () => void;
  setHydrated: () => void;
}

function lineFromProduct(p: PosProduct, quantity: string): CartLineData {
  return {
    productId: p.id,
    sku: p.sku,
    name: p.name,
    partNumber: p.partNumber,
    unitSymbol: p.unitSymbol,
    unitDecimals: p.unitDecimals,
    taxRate: p.taxRate,
    quantity,
    unitPriceUsd: p.priceUsd ?? "0",
    discountType: "pct",
    discountValue: "0",
    stockAvailable: p.stockAvailable,
    thumbUrl: p.thumbUrl,
  };
}

const EMPTY = {
  lines: [] as CartLineData[],
  customer: null,
  globalDiscount: null,
  notes: "",
  heldSaleId: null,
  holdLabel: null,
  quoteId: null,
  quoteNumber: null,
  supervisor: null,
};

/** Persisted cart. The POS and the quote screen use separate storage keys. */
export function createCartStore(storageKey: string) {
  return create<CartState>()(
    persist(
      (set) => ({
        ...EMPTY,
        pendingCart: null,
        hydrated: false,

        addProduct: (product, quantity) =>
          set((s) => {
            const step = D(quantity ?? 1);
            const existing = s.lines.find((l) => l.productId === product.id);
            if (existing) {
              return {
                lines: s.lines.map((l) =>
                  l.productId === product.id
                    ? {
                        ...l,
                        quantity: roundTo(D(l.quantity).plus(step), l.unitDecimals).toString(),
                        unitPriceUsd: product.priceUsd ?? l.unitPriceUsd,
                        stockAvailable: product.stockAvailable,
                      }
                    : l,
                ),
              };
            }
            return { lines: [...s.lines, lineFromProduct(product, roundTo(step, product.unitDecimals).toString())] };
          }),

        setQuantity: (productId, quantity) =>
          set((s) => ({
            lines: s.lines.map((l) => (l.productId === productId ? { ...l, quantity: roundTo(quantity, l.unitDecimals).toString() } : l)),
          })),

        incrementQuantity: (productId, delta) =>
          set((s) => ({
            lines: s.lines.flatMap((l) => {
              if (l.productId !== productId) return [l];
              const next = roundTo(D(l.quantity).plus(delta), l.unitDecimals);
              return next.lte(0) ? [] : [{ ...l, quantity: next.toString() }];
            }),
          })),

        removeLine: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),

        setLineDiscount: (productId, type, value) =>
          set((s) => ({
            lines: s.lines.map((l) => (l.productId === productId ? { ...l, discountType: type, discountValue: value } : l)),
          })),

        setGlobalDiscount: (globalDiscount) => set({ globalDiscount }),
        setCustomer: (customer) => set({ customer }),
        setNotes: (notes) => set({ notes }),
        setSupervisor: (supervisor) => set({ supervisor }),
        setPendingCart: (pendingCart) => set({ pendingCart }),

        applyProducts: (products) =>
          set((s) => ({
            lines: s.lines.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              return p ? { ...l, name: p.name, unitPriceUsd: p.priceUsd ?? l.unitPriceUsd, stockAvailable: p.stockAvailable } : l;
            }),
          })),

        load: (payload) =>
          set({
            lines: payload.lines,
            customer: payload.customer,
            globalDiscount: null,
            notes: payload.notes ?? "",
            heldSaleId: payload.heldSaleId ?? null,
            holdLabel: payload.holdLabel ?? null,
            quoteId: payload.quoteId ?? null,
            quoteNumber: payload.quoteNumber ?? null,
            pendingCart: null,
          }),

        clear: () => set({ ...EMPTY, pendingCart: null }),
        setHydrated: () => set({ hydrated: true }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        skipHydration: true,
        partialize: (s) => ({
          lines: s.lines,
          customer: s.customer,
          globalDiscount: s.globalDiscount,
          notes: s.notes,
          heldSaleId: s.heldSaleId,
          holdLabel: s.holdLabel,
          quoteId: s.quoteId,
          quoteNumber: s.quoteNumber,
          supervisor: s.supervisor,
        }),
      },
    ),
  );
}

export type CartStore = ReturnType<typeof createCartStore>;

export const posCartStore = createCartStore("lp2050-pos-cart");
export const quoteCartStore = createCartStore("lp2050-quote-cart");

const CartStoreContext = createContext<CartStore | null>(null);
export const CartStoreProvider = CartStoreContext.Provider;

export function useCartStore(): CartStore {
  const store = useContext(CartStoreContext);
  if (!store) throw new Error("useCartStore must be used inside CartStoreProvider");
  return store;
}

/** Select a slice of the cart. Select primitives or stored references only. */
export function useCart<T>(selector: (s: CartState) => T): T {
  const useStore = useCartStore();
  return useStore(selector);
}

const ZERO_TOTALS: SaleTotals = { lines: [], subtotalUsd: D(0), discountUsd: D(0), baseUsd: D(0), taxUsd: D(0), totalUsd: D(0) };

export function cartTotals(lines: CartLineData[], globalDiscount: GlobalDiscount | null): SaleTotals {
  const valid = lines.filter((l) => D(l.quantity).gt(0));
  if (valid.length === 0) return ZERO_TOTALS;
  try {
    return computeTotals(
      valid.map((l) => ({
        key: l.productId,
        quantity: l.quantity,
        unitPriceUsd: l.unitPriceUsd,
        taxRate: l.taxRate,
        discountType: l.discountType,
        discountValue: l.discountValue,
      })),
      globalDiscount && D(globalDiscount.value).gt(0) ? globalDiscount : null,
    );
  } catch {
    return ZERO_TOTALS;
  }
}

export function useCartTotals(): SaleTotals {
  const lines = useCart((s) => s.lines);
  const globalDiscount = useCart((s) => s.globalDiscount);
  return useMemo(() => cartTotals(lines, globalDiscount), [lines, globalDiscount]);
}

/** Same rule as the server: any line or the whole sale above the role limit. */
export function exceedsDiscountLimit(totals: SaleTotals, maxPct: number): boolean {
  const max = D(maxPct);
  if (totals.lines.some((l) => effectiveDiscountPct(l.grossUsd, l.discountUsd).gt(max))) return true;
  return effectiveDiscountPct(totals.subtotalUsd, totals.discountUsd).gt(max);
}

export function supervisorIsValid(auth: SupervisorAuth | null): boolean {
  return Boolean(auth && auth.expiresAt > Date.now() + 5_000);
}
