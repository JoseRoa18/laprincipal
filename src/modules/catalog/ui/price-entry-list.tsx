"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setProductCostAction, setProductPricesAction } from "@/app/(app)/productos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { suggestTechPrice } from "../domain/pricing";

export interface PriceEntryItem {
  id: string;
  name: string;
  sku: string;
  brandName: string | null;
  /** Null: "Falta costo". */
  costUsd: string | null;
  /** Null: "Falta precio". */
  publicPriceUsd: string | null;
}

type Mode = "price" | "cost";

/**
 * One row per product with what is missing: the cost and/or the public price
 * (suggested from the cost plus the default margin) and the optional
 * technician price. Enter saves and jumps to the next row.
 */
export function PriceEntryList({ items, mode, marginPct, techMarkdownPct }: { items: PriceEntryItem[]; mode: Mode; marginPct: number; techMarkdownPct: number }) {
  return (
    <ul className="divide-y rounded-xl border">
      {items.map((item, i) => (
        <EntryRow key={item.id} item={item} index={i} mode={mode} marginPct={marginPct} techMarkdownPct={techMarkdownPct} />
      ))}
    </ul>
  );
}

function EntryRow({ item, index, mode, marginPct, techMarkdownPct }: { item: PriceEntryItem; index: number; mode: Mode; marginPct: number; techMarkdownPct: number }) {
  const [cost, setCost] = useState("");
  const [publicPrice, setPublicPrice] = useState("");
  const [techPrice, setTechPrice] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const askCost = !item.costUsd;
  const askPrice = !item.publicPriceUsd;
  const typedCost = parseLocalizedNumber(cost);
  const knownCost = typedCost && D(typedCost).gt(0) ? typedCost : item.costUsd;
  // Suggested public price: cost plus the default margin of Configuración → Políticas.
  const suggested = askPrice && knownCost ? D(knownCost).mul(D(1).plus(D(marginPct).div(100))).toDecimalPlaces(2).toFixed(2) : null;
  const parsedPublic = parseLocalizedNumber(publicPrice);
  const techSuggestion = parsedPublic ? suggestTechPrice(parsedPublic, techMarkdownPct) : null;

  function save() {
    const wantsCost = askCost && cost.trim() !== "";
    const wantsPrice = askPrice && publicPrice.trim() !== "";
    // What this tab is for must be filled; the other field is optional.
    if (mode === "price" && !wantsPrice) return toast.error("Escribe el precio público.");
    if (mode === "cost" && !wantsCost) return toast.error("Escribe el costo.");
    startTransition(async () => {
      if (wantsCost) {
        const result = await setProductCostAction({ productId: item.id, costUsd: cost });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
      }
      if (wantsPrice) {
        const result = await setProductPricesAction({ productId: item.id, publicPriceUsd: publicPrice, techPriceUsd: techPrice || undefined });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
      }
      const parts = [
        wantsCost ? `costo ${formatMoney(parseLocalizedNumber(cost) ?? 0, "USD")}` : null,
        wantsPrice ? `precio ${formatMoney(parseLocalizedNumber(publicPrice) ?? 0, "USD")}` : null,
      ].filter(Boolean);
      setSaved(parts.join(" · "));
      toast.success(wantsPrice ? `${item.name}: ya se puede vender` : `${item.name}: costo guardado`);
      document.getElementById(`entry-${index + 1}`)?.focus();
    });
  }

  return (
    <li className="grid gap-3 p-3 md:grid-cols-[1fr_auto] md:items-end">
      <div className="min-w-0">
        <Link href={`/productos/${item.id}`} className="font-medium hover:underline">
          {item.name}
        </Link>
        <p className="text-muted-foreground text-xs">
          {[item.sku, item.brandName].filter(Boolean).join(" · ")}
          {item.costUsd ? ` · Costo ${formatMoney(item.costUsd, "USD")}` : " · Falta costo"}
          {item.publicPriceUsd ? ` · Público ${formatMoney(item.publicPriceUsd, "USD")}` : " · Falta precio"}
          {suggested ? ` · sugerido ${formatMoney(suggested, "USD")} (${marginPct} % sobre costo)` : ""}
        </p>
      </div>
      {saved ? (
        <p className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-4" /> Guardado: {saved}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {askCost ? (
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Costo USD</span>
              <Input
                id={mode === "cost" ? `entry-${index}` : undefined}
                inputMode="decimal"
                className="h-10 w-28 text-right"
                placeholder="0,00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                disabled={pending}
              />
            </label>
          ) : null}
          {askPrice ? (
            <>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Público USD</span>
                <Input
                  id={mode === "price" ? `entry-${index}` : undefined}
                  inputMode="decimal"
                  className="h-10 w-28 text-right"
                  placeholder={suggested ? suggested.replace(".", ",") : "0,00"}
                  value={publicPrice}
                  onChange={(e) => setPublicPrice(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Técnico USD</span>
                <Input
                  inputMode="decimal"
                  className="h-10 w-28 text-right"
                  placeholder={techSuggestion ? techSuggestion.toFixed(2).replace(".", ",") : "auto"}
                  value={techPrice}
                  onChange={(e) => setTechPrice(e.target.value)}
                  disabled={pending}
                />
              </label>
              {suggested && !publicPrice ? (
                <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => setPublicPrice(suggested.replace(".", ","))}>
                  Usar sugerido
                </Button>
              ) : null}
            </>
          ) : null}
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      )}
    </li>
  );
}
