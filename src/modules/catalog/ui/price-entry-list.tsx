"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setProductPricesAction } from "@/app/(app)/productos/actions";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parseLocalizedNumber } from "@/lib/format";
import { suggestTechPrice } from "../domain/pricing";

export interface PriceEntryItem {
  id: string;
  name: string;
  sku: string;
  partNumber: string | null;
  brandName: string | null;
  costUsd: string;
  /** Cost plus the default margin, or null without a cost. */
  suggestedUsd: string | null;
}

/** One row per product: public price (suggested from the cost) and optional technician price. Enter saves and jumps to the next one. */
export function PriceEntryList({ items, marginPct, techMarkdownPct }: { items: PriceEntryItem[]; marginPct: number; techMarkdownPct: number }) {
  return (
    <ul className="divide-y rounded-xl border">
      {items.map((item, i) => (
        <PriceRow key={item.id} item={item} index={i} marginPct={marginPct} techMarkdownPct={techMarkdownPct} />
      ))}
    </ul>
  );
}

function PriceRow({ item, index, marginPct, techMarkdownPct }: { item: PriceEntryItem; index: number; marginPct: number; techMarkdownPct: number }) {
  const [publicPrice, setPublicPrice] = useState("");
  const [techPrice, setTechPrice] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const parsedPublic = parseLocalizedNumber(publicPrice);
  const techSuggestion = parsedPublic ? suggestTechPrice(parsedPublic, techMarkdownPct) : null;

  function save() {
    if (!publicPrice.trim()) {
      toast.error("Escribe el precio público.");
      return;
    }
    startTransition(async () => {
      const result = await setProductPricesAction({ productId: item.id, publicPriceUsd: publicPrice, techPriceUsd: techPrice || undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setSaved(true);
      toast.success(`${item.name}: ya se puede vender`);
      // Next product's price field.
      document.getElementById(`price-${index + 1}`)?.focus();
    });
  }

  return (
    <li className="grid gap-3 p-3 md:grid-cols-[1fr_auto] md:items-end">
      <div className="min-w-0">
        <Link href={`/productos/${item.id}`} className="font-medium hover:underline">
          {item.name}
        </Link>
        <p className="text-muted-foreground text-xs">
          {[item.partNumber, item.sku, item.brandName].filter(Boolean).join(" · ")} · Costo <Money value={item.costUsd} />
          {item.suggestedUsd ? ` · sugerido ${formatMoney(item.suggestedUsd, "USD")} (${marginPct} % sobre costo)` : ""}
        </p>
      </div>
      {saved ? (
        <p className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-4" /> Precio guardado: {formatMoney(parseLocalizedNumber(publicPrice) ?? 0, "USD")}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Público USD</span>
            <Input
              id={`price-${index}`}
              inputMode="decimal"
              className="h-10 w-28 text-right"
              placeholder={item.suggestedUsd ? item.suggestedUsd.replace(".", ",") : "0,00"}
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
          {item.suggestedUsd && !publicPrice ? (
            <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => setPublicPrice(item.suggestedUsd!.replace(".", ","))}>
              Usar sugerido
            </Button>
          ) : null}
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      )}
    </li>
  );
}
