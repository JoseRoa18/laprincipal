"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PauseCircle, TriangleAlert, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { holdSaleAction } from "@/app/(app)/vender/actions";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { displayAmounts } from "@/modules/currency/domain/conversion";
import type { CartCustomer, PosProduct } from "../../application/schemas";
import { CartStoreProvider, cartTotals, exceedsDiscountLimit, posCartStore, quoteCartStore, supervisorIsValid, useCart, useCartStore } from "../cart-store";
import { CartPanel } from "./cart-panel";
import { CheckoutDialog } from "./checkout-dialog";
import { fetchHeldSales, HELD_SALES_KEY, HeldSalesDrawer } from "./held-sales-drawer";
import { HoldDialog } from "./hold-dialog";
import { ProductSearch, type ProductSearchHandle } from "./product-search";
import { QuoteDialog } from "./quote-dialog";
import { SellerSwitchDialog } from "./seller-switch-dialog";
import { SupervisorDialog } from "./supervisor-dialog";
import type { PosConfig } from "./types";

export function PosScreen({ config }: { config: PosConfig }) {
  const store = config.mode === "quote" ? quoteCartStore : posCartStore;
  return (
    <CartStoreProvider value={store}>
      <PosInner config={config} />
    </CartStoreProvider>
  );
}

function priceListFor(customer: CartCustomer | null, config: PosConfig): string | null {
  if (!customer) return config.priceLists.publicId;
  return customer.priceListId ?? (customer.customerType === "technician" ? config.priceLists.techId : config.priceLists.publicId);
}

function PosInner({ config }: { config: PosConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const store = useCartStore();
  const hydrated = useCart((s) => s.hydrated);
  const lines = useCart((s) => s.lines);
  const customer = useCart((s) => s.customer);
  const globalDiscount = useCart((s) => s.globalDiscount);
  const supervisor = useCart((s) => s.supervisor);
  const holdLabel = useCart((s) => s.holdLabel);
  const pendingCart = useCart((s) => s.pendingCart);
  const totals = useMemo(() => cartTotals(lines, globalDiscount), [lines, globalDiscount]);

  const searchRef = useRef<ProductSearchHandle>(null);
  const appliedInitial = useRef<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);

  const isSale = config.mode === "sale";
  const ratesBlocked = config.policies.requireRatesToSell && config.rates.missing.length > 0;
  const cashBlocked = isSale && config.policies.requireOpenCashSession && !config.cashSessionOpen;
  const priceListId = priceListFor(customer, config);
  const rateVes = config.rates.rateSet.VES ?? null;

  const heldQuery = useQuery({ queryKey: HELD_SALES_KEY, queryFn: fetchHeldSales, enabled: isSale, staleTime: 15_000 });
  const heldCount = heldQuery.data?.length ?? 0;

  // Rehydrate the persisted cart after mount (avoids SSR mismatches). If the
  // browser blocks storage the POS still works with an empty cart.
  useEffect(() => {
    let pending: unknown;
    try {
      pending = store.persist.rehydrate();
    } catch {
      pending = undefined;
    }
    void Promise.resolve(pending)
      .catch(() => undefined)
      .finally(() => store.getState().setHydrated());
  }, [store]);

  const refreshProducts = useCallback(
    async (listId: string | null) => {
      const ids = store.getState().lines.map((l) => l.productId);
      if (ids.length === 0) return;
      try {
        const qs = new URLSearchParams({ ids: ids.join(",") });
        if (listId) qs.set("priceListId", listId);
        const res = await fetch(`/api/sales/products?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { products: PosProduct[] };
        store.getState().applyProducts(data.products);
      } catch {
        /* keep the cached prices; the server re-prices anyway */
      }
    },
    [store],
  );

  // Load a quote or a held sale passed by the page once the cart is hydrated.
  // With products already in the cart the store keeps it as `pendingCart` and
  // the confirmation dialog below is derived from that.
  useEffect(() => {
    if (!hydrated || !config.initialCart) return;
    const key = config.initialCart.quoteId ?? config.initialCart.heldSaleId ?? "initial";
    if (appliedInitial.current === key) return;
    appliedInitial.current = key;
    const s = store.getState();
    if (s.lines.length > 0 && !s.quoteId) {
      s.setPendingCart(config.initialCart);
    } else {
      s.load(config.initialCart);
      router.replace(pathname);
    }
  }, [hydrated, config.initialCart, store, router, pathname]);

  // Refresh prices and stock of a cart restored from a previous session.
  useEffect(() => {
    if (hydrated && !store.getState().quoteId) void refreshProducts(priceListFor(store.getState().customer, config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const openCheckout = useCallback(() => {
    if (store.getState().lines.length === 0) {
      toast.info("Agrega productos al carrito.");
      searchRef.current?.focus();
      return;
    }
    if (ratesBlocked) {
      toast.error("Falta la tasa del día. Cárgala en Configuración → Tasas.");
      return;
    }
    if (cashBlocked) {
      toast.error("La caja está cerrada. Ábrela en Caja antes de cobrar.");
      return;
    }
    const current = cartTotals(store.getState().lines, store.getState().globalDiscount);
    if (exceedsDiscountLimit(current, config.policies.maxDiscountPct) && !supervisorIsValid(store.getState().supervisor)) {
      setSupervisorOpen(true);
      return;
    }
    setCheckoutOpen(true);
  }, [store, ratesBlocked, cashBlocked, config.policies.maxDiscountPct]);

  const primaryAction = useCallback(() => {
    if (isSale) openCheckout();
    else if (store.getState().lines.length > 0) setQuoteOpen(true);
  }, [isSale, openCheckout, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        primaryAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primaryAction]);

  function onCustomerChange(next: CartCustomer | null) {
    store.getState().setCustomer(next);
    void refreshProducts(priceListFor(next, config));
  }

  async function hold(label: string): Promise<boolean> {
    const s = store.getState();
    const result = await holdSaleAction({
      label,
      lines: s.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, discountType: l.discountType, discountValue: l.discountValue })),
      customerId: s.customer?.id ?? null,
      globalDiscount: s.globalDiscount,
      notes: s.notes || null,
      heldSaleId: s.heldSaleId,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    s.clear();
    void queryClient.invalidateQueries({ queryKey: HELD_SALES_KEY });
    toast.success(`Venta en espera: ${label}`);
    searchRef.current?.focus();
    return true;
  }

  function resolvePending(replace: boolean) {
    const s = store.getState();
    if (replace && s.pendingCart) s.load(s.pendingCart);
    else s.setPendingCart(null);
    router.replace(pathname);
  }

  if (!hydrated) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const amounts = displayAmounts(totals.totalUsd, config.rates.rateSet, config.rates.currencies);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100svh-3.5rem-3rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {isSale ? (
            <>
              <UserRound className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">
                Vende <span className="font-semibold">{config.seller.name}</span>
              </span>
              {config.seller.isActing ? <Badge variant="secondary">por PIN</Badge> : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => setSellerOpen(true)}>
                Cambiar vendedor
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" render={<Link href="/cotizaciones" />}>
                <ArrowLeft /> Cotizaciones
              </Button>
              <span className="font-semibold">Nueva cotización</span>
            </>
          )}
        </div>
        {isSale ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
            <PauseCircle /> En espera {heldCount > 0 ? <Badge>{heldCount}</Badge> : null}
          </Button>
        ) : null}
      </div>

      {ratesBlocked ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Falta la tasa del día ({config.rates.missing.join(" y ")})</AlertTitle>
          <AlertDescription>
            No se puede {isSale ? "cobrar" : "cotizar en bolívares"} sin tasa.{" "}
            {config.user.role === "admin" ? <Link href="/configuracion/tasas">Cargar la tasa</Link> : "Pídele al administrador que la cargue."}
          </AlertDescription>
        </Alert>
      ) : config.rates.stale.length > 0 ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>La tasa de {config.rates.stale.join(" y ")} no es de hoy</AlertTitle>
          <AlertDescription>
            Se usará la última tasa cargada. {config.user.role === "admin" ? <Link href="/configuracion/tasas">Actualizar tasa</Link> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {cashBlocked ? (
        <Alert variant="destructive">
          <Wallet />
          <AlertTitle>La caja está cerrada</AlertTitle>
          <AlertDescription>
            Puedes armar el carrito, pero para cobrar hay que abrir la caja. <Link href="/caja">Ir a Caja</Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section className="flex min-h-[40vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <ProductSearch priceListId={priceListId} rateVes={rateVes} onAdd={(p) => store.getState().addProduct(p)} handle={searchRef} />
        </section>
        <aside className="flex min-h-0 w-full flex-col lg:w-[420px] xl:w-[460px]">
          <CartPanel
            config={config}
            totals={totals}
            onCustomerChange={onCustomerChange}
            onCheckout={openCheckout}
            onHold={() => setHoldOpen(true)}
            onQuote={() => (store.getState().lines.length > 0 ? setQuoteOpen(true) : toast.info("Agrega productos primero."))}
          />
        </aside>
      </div>

      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky bottom-14 z-30 -mx-3 border-t px-3 py-2 backdrop-blur md:bottom-0 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(totals.totalUsd, "USD")}</p>
            {amounts.VES ? <p className="text-muted-foreground text-xs tabular-nums">{formatMoney(amounts.VES, "VES")}</p> : null}
          </div>
          {isSale ? (
            <>
              <Button type="button" variant="outline" size="lg" className="h-12" disabled={lines.length === 0} onClick={() => setHoldOpen(true)} aria-label="Poner en espera">
                <PauseCircle />
              </Button>
              <Button type="button" size="lg" className="h-12 px-6 text-base" disabled={lines.length === 0} onClick={openCheckout}>
                Cobrar
              </Button>
            </>
          ) : (
            <Button type="button" size="lg" className="h-12 px-6 text-base" disabled={lines.length === 0} onClick={() => setQuoteOpen(true)}>
              Guardar cotización
            </Button>
          )}
        </div>
      </div>

      {isSale ? (
        <>
          <CheckoutDialog
            open={checkoutOpen}
            onOpenChange={setCheckoutOpen}
            config={config}
            totals={totals}
            onSuccess={(result, opts) => {
              setCheckoutOpen(false);
              store.getState().clear();
              void queryClient.invalidateQueries({ queryKey: HELD_SALES_KEY });
              toast.success(`Venta ${result.number} registrada`);
              router.push(`/ventas/${result.saleId}?nueva=1&imprimir=${opts.print ? 1 : 0}&whatsapp=${opts.whatsapp ? 1 : 0}`);
            }}
          />
          <HoldDialog open={holdOpen} onOpenChange={setHoldOpen} initialLabel={holdLabel} onSubmit={hold} />
          <HeldSalesDrawer
            open={heldOpen}
            onOpenChange={setHeldOpen}
            cartHasLines={lines.length > 0}
            onResume={(payload) => {
              store.getState().load(payload);
              searchRef.current?.focus();
            }}
          />
          <SellerSwitchDialog open={sellerOpen} onOpenChange={setSellerOpen} config={config} />
          <SupervisorDialog
            open={supervisorOpen}
            onOpenChange={setSupervisorOpen}
            reason={`El descuento supera el máximo permitido para tu rol (${config.policies.maxDiscountPct} %). Un administrador debe autorizarlo con su PIN.`}
            onAuthorized={(auth) => {
              store.getState().setSupervisor(auth);
              setCheckoutOpen(true);
            }}
          />
        </>
      ) : null}
      <QuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} config={config} />

      <AlertDialog open={pendingCart !== null} onOpenChange={(o) => !o && resolvePending(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ya tienes productos en el carrito</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Reemplazarlos con {pendingCart?.quoteNumber ? `la cotización ${pendingCart.quoteNumber}` : "la venta en espera"}? Ponlos en espera antes si quieres conservarlos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolvePending(false)}>Conservar mi carrito</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolvePending(true)}>Reemplazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {supervisor && supervisorIsValid(supervisor) ? (
        <p className="text-muted-foreground text-xs">Descuento autorizado por {supervisor.name} (válido 10 minutos).</p>
      ) : null}
    </div>
  );
}
