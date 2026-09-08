"use client";

import { Camera, PackageSearch, ScanBarcode, Search, X } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { cn } from "cn";
import type { PosProduct } from "../../application/schemas";
import { BarcodeScanner } from "./barcode-scanner";

export interface ProductSearchHandle {
  focus: () => void;
}

interface Props {
  priceListId: string | null;
  rateVes: string | null;
  onAdd: (product: PosProduct) => void;
  handle?: Ref<ProductSearchHandle>;
}

async function fetchProducts(params: Record<string, string>, signal?: AbortSignal): Promise<PosProduct[]> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api/sales/products?${qs.toString()}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo buscar productos.");
  const data = (await res.json()) as { products: PosProduct[] };
  return data.products;
}

/**
 * Search box for the POS. A USB scanner types the code and presses Enter:
 * the exact barcode is resolved first, then a single search hit, otherwise
 * the results are listed. Camera scanning uses html5-qrcode on demand.
 */
export function ProductSearch({ priceListId, rateVes, onAdd, handle }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useImperativeHandle(handle, () => ({ focus: () => inputRef.current?.focus() }), []);

  const listParams = useCallback((extra: Record<string, string>) => ({ ...extra, ...(priceListId ? { priceListId } : {}) }), [priceListId]);

  const runSearch = useCallback(
    async (q: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const products = await fetchProducts(listParams({ q }), controller.signal);
        if (!controller.signal.aborted) {
          setResults(products);
          setHighlight(0);
          setSearched(true);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") toast.error("No se pudo buscar productos.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [listParams],
  );

  useEffect(() => () => abort.current?.abort(), []);

  function reset() {
    setTerm("");
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }

  function add(product: PosProduct) {
    onAdd(product);
    reset();
  }

  function onChange(value: string) {
    setTerm(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runSearch(value), 250);
  }

  /** Enter or a scanned code: barcode → single hit → list. */
  const resolveCode = useCallback(
    async (code: string) => {
      const q = code.trim();
      if (!q) return;
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
      setLoading(true);
      try {
        const [byCode] = await fetchProducts(listParams({ barcode: q }));
        if (byCode) {
          add(byCode);
          return;
        }
        const found = await fetchProducts(listParams({ q }));
        if (found.length === 1) {
          add(found[0]);
          return;
        }
        setResults(found);
        setSearched(true);
        setHighlight(0);
        if (found.length === 0) toast.warning(`No se encontró "${q}".`);
      } catch {
        toast.error("No se pudo buscar el producto.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listParams, onAdd],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0 && searched && term.trim() && results[highlight] && !looksLikeCode(term)) add(results[highlight]);
      else void resolveCode(term);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape" && term) {
      reset();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" />
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar o escanear: nombre, número de parte, código…"
            aria-label="Buscar producto"
            autoFocus
            autoComplete="off"
            className="h-12 pr-16 pl-10 text-base"
            data-pos-search
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {loading ? <Spinner /> : null}
            {term ? (
              <button type="button" aria-label="Limpiar" onClick={reset} className="text-muted-foreground hover:text-foreground rounded p-1">
                <X className="size-4" />
              </button>
            ) : (
              <Kbd className="hidden md:inline-flex">F2</Kbd>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" size="icon-lg" className="size-12 shrink-0" aria-label="Escanear con la cámara" onClick={() => setScannerOpen(true)}>
          <Camera className="size-5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        {results.length === 0 ? (
          <div className="text-muted-foreground flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            {searched && term ? (
              <>
                <PackageSearch className="size-8" />
                <p>Sin resultados para “{term}”.</p>
              </>
            ) : (
              <>
                <ScanBarcode className="size-8" />
                <p>Escanea un código o escribe para buscar. El producto entra al carrito al instante.</p>
              </>
            )}
          </div>
        ) : (
          <ul role="listbox" aria-label="Resultados" className="divide-y">
            {results.map((p, i) => {
              const stock = D(p.stockAvailable);
              const out = stock.lte(0);
              const bs = p.priceUsd && rateVes ? D(p.priceUsd).mul(rateVes) : null;
              return (
                <li key={p.id} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted",
                      i === highlight && "bg-muted/60",
                    )}
                  >
                    <span className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
                      {p.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbUrl} alt="" width={48} height={48} className="size-full object-cover" />
                      ) : (
                        <PackageSearch className="text-muted-foreground size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {[p.partNumber, p.sku, p.locationCode].filter(Boolean).join(" · ")}
                      </span>
                      <span className={cn("block text-xs", out ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {out ? "Agotado" : `Disponible: ${formatQty(stock, p.unitDecimals)} ${p.unitSymbol}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-semibold tabular-nums">{p.priceUsd ? formatMoney(p.priceUsd, "USD") : "Sin precio"}</span>
                      {bs ? <span className="text-muted-foreground block text-xs tabular-nums">{formatMoney(bs, "VES")}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(code) => {
          setScannerOpen(false);
          void resolveCode(code);
        }}
      />
    </div>
  );
}

/** Scanner output: digits/uppercase with no spaces. Used to prefer the exact lookup. */
function looksLikeCode(term: string): boolean {
  return /^[A-Za-z0-9-]{6,}$/.test(term.trim()) && !/\s/.test(term.trim());
}
