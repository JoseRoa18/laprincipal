"use client";

import { Package, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchProductsAction } from "@/app/(app)/inventario/actions";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, formatQty } from "@/lib/format";
import type { ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { cn } from "cn";

/**
 * Search box with a result list. Works with a USB scanner too: the scanner
 * types the code and presses Enter, which selects the first (exact) match.
 */
export function ProductPicker({
  onSelect,
  placeholder = "Buscar por nombre, número de parte, código o SKU",
  autoFocus,
  showCost = false,
  className,
  disabled,
}: {
  onSelect: (product: ProductForSale) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showCost?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  /** Results and the term they belong to; "loading" is derived from the mismatch. */
  const [found, setFound] = useState<{ term: string; rows: ProductForSale[] }>({ term: "", rows: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const term = q.trim();
  const results = found.term === term ? found.rows : [];
  const loading = term !== "" && found.term !== term;

  useEffect(() => {
    if (!term) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const rows = await searchProductsAction(term);
      if (id !== requestId.current) return;
      setFound({ term, rows });
      setActive(0);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  function select(p: ProductForSale) {
    onSelect(p);
    setQ("");
    setFound({ term: "", rows: [] });
    setOpen(false);
    requestId.current++;
    inputRef.current?.focus();
  }

  async function onEnter() {
    if (!term) return;
    // If the debounce has not fired yet, search now.
    let rows = results;
    if (loading || rows.length === 0) {
      requestId.current++;
      rows = await searchProductsAction(term);
      setFound({ term, rows });
    }
    if (rows.length > 0) select(rows[Math.min(active, rows.length - 1)]);
    else setOpen(true);
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        value={q}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        role="combobox"
        autoComplete="off"
        className="h-11 pl-9 pr-9 text-base"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
            setOpen(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void onEnter();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading ? <Spinner className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2" /> : null}
      {open && term ? (
        <div
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg p-1 shadow-md ring-1"
        >
          {results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-center text-sm">{loading ? "Buscando..." : "No se encontraron productos."}</p>
          ) : (
            results.map((p, i) => {
              const available = Number(p.stockAvailable);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left", i === active && "bg-muted")}
                >
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt="" width={40} height={40} className="size-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
                      <Package className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[p.partNumber, p.sku, p.locationCode].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    <span className={cn("block font-medium", available <= 0 && "text-destructive")}>
                      {formatQty(p.stockAvailable, p.unitDecimals)} {p.unitSymbol}
                    </span>
                    {showCost ? <span className="text-muted-foreground block">{formatMoney(p.costAvgUsd, "USD")}</span> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
