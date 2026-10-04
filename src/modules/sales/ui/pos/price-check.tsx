"use client";

import { MapPin, Package, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { codeLabel } from "@/modules/catalog/domain/sku";
import { ProductThumb } from "@/modules/catalog/ui/product-thumb";
import { displayAmounts, type CurrencyInfo } from "@/modules/currency/domain/conversion";
import type { PosProduct } from "../../application/schemas";
import { ProductSearch } from "./product-search";

/**
 * Price check without a customer: scan or search, see the public and
 * technician prices in $, Bs and COP, the stock and the shelf. There is no
 * cart, so nothing here can be sold.
 */
export function PriceCheck({
  publicListId,
  techListId,
  rateSet,
  currencies,
}: {
  publicListId: string;
  techListId: string | null;
  rateSet: Record<string, string>;
  currencies: CurrencyInfo[];
}) {
  const [product, setProduct] = useState<PosProduct | null>(null);
  // Keyed by product so a new pick never shows the previous product's price.
  const [tech, setTech] = useState<{ productId: string; price: string } | null>(null);
  const techPrice = tech && tech.productId === product?.id ? tech.price : null;

  // The technician price comes from its own list (the search uses the public one).
  useEffect(() => {
    if (!product || !techListId) return;
    const controller = new AbortController();
    fetch(`/api/sales/products?ids=${product.id}&priceListId=${techListId}`, { signal: controller.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ products: PosProduct[] }>) : null))
      .then((data) => {
        const p = data?.products[0];
        if (p && p.priceListCode === "TECH" && p.priceUsd) setTech({ productId: p.id, price: p.priceUsd });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [product, techListId]);

  const priced = Boolean(product?.priceUsd && D(product.priceUsd).gt(0));
  const amounts = product && priced ? displayAmounts(product.priceUsd!, rateSet, currencies) : null;

  return (
    <div className="space-y-4">
      <ProductSearch priceListId={publicListId} rateVes={rateSet.VES ?? null} onAdd={setProduct} allowUnpriced compact placeholder="Escanea o busca: nombre, número de parte, código…" />

      {product ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              <ProductThumb url={product.thumbUrl} alt="" size={72} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg leading-tight font-semibold">{product.name}</h2>
                <p className="text-muted-foreground text-sm">
                  {codeLabel(product.sku)} <span className="text-foreground font-medium">{product.sku}</span>
                </p>
                {!product.isActive ? <Badge variant="secondary">Inactivo: no se vende</Badge> : null}
              </div>
            </div>

            {priced ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Precio público</p>
                  <p className="text-3xl font-bold tabular-nums">{formatMoney(product.priceUsd!, "USD")}</p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {amounts
                      ? Object.entries(amounts)
                          .filter(([code]) => code !== "USD")
                          .map(([code, value]) => formatMoney(value, code))
                          .join(" · ")
                      : null}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Precio técnico</p>
                  <p className="text-2xl font-semibold tabular-nums">{techPrice ? formatMoney(techPrice, "USD") : "—"}</p>
                  <p className="text-muted-foreground text-sm">Para clientes registrados como técnicos</p>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <span className="font-medium">Falta precio:</span> este producto todavía no tiene precio de venta.
              </p>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Package className="text-muted-foreground size-4" aria-hidden="true" />
                {D(product.stockAvailable).gt(0) ? (
                  <>
                    <span className="font-semibold tabular-nums">{formatQty(product.stockAvailable, product.unitDecimals)}</span> {product.unitSymbol} disponibles
                  </>
                ) : (
                  <span className="text-destructive font-medium">Agotado</span>
                )}
              </span>
              {product.locationCode ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="text-muted-foreground size-4" aria-hidden="true" /> Estante <span className="font-medium">{product.locationCode}</span>
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm">
          <SearchCheck className="size-8" aria-hidden="true" />
          Escanea un código o escribe para buscar. El precio aparece aquí.
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="outline" size="lg" render={<Link href="/vender" />}>
          Vender a un cliente
        </Button>
      </div>
    </div>
  );
}
