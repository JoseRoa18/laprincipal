"use client";

import { Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { searchProductsAction } from "@/app/(app)/productos/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LABEL_FORMATS, MAX_LABELS, serializeLabelItems, type LabelFormat } from "../domain/labels";
import { ProductThumb } from "./product-thumb";

export interface LabelProduct {
  id: string;
  sku: string;
  name: string;
  partNumber: string | null;
  thumbUrl: string | null;
}

interface SelectedProduct extends LabelProduct {
  quantity: number;
}

export function LabelsPicker({ initial }: { initial: LabelProduct[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SelectedProduct[]>(initial.map((p) => ({ ...p, quantity: 1 })));
  const [format, setFormat] = useState<LabelFormat>("roll");
  const [showPrice, setShowPrice] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const term = value.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchProductsAction(term);
      setSearching(false);
      if (res.ok) setResults(res.data);
      else toast.error(res.error.message);
    }, 250);
  }

  function add(p: LabelProduct) {
    setSelected((prev) => {
      const existing = prev.find((x) => x.id === p.id);
      if (existing) return prev.map((x) => (x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...prev, { ...p, quantity: 1 }];
    });
    setQuery("");
    setResults([]);
  }

  function setQty(id: string, quantity: number) {
    setSelected((prev) => prev.map((x) => (x.id === id ? { ...x, quantity: Math.max(1, Math.min(MAX_LABELS, Math.floor(quantity) || 1)) } : x)));
  }

  const total = selected.reduce((acc, x) => acc + x.quantity, 0);
  const layout = LABEL_FORMATS[format];
  const pages = Math.ceil(total / (layout.cols * layout.rows));
  const href = `/api/products/labels?items=${encodeURIComponent(serializeLabelItems(selected.map((s) => ({ productId: s.id, quantity: s.quantity }))))}&format=${format}&price=${showPrice ? "1" : "0"}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Elige los productos</CardTitle>
            <CardDescription>Busca por nombre, número de parte, SKU o escanea el código.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Buscar producto..." className="h-11 pl-9" aria-label="Buscar producto" autoComplete="off" />
            </div>
            {searching ? <p className="text-muted-foreground text-sm">Buscando...</p> : null}
            {results.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left" onClick={() => add(p)}>
                      <ProductThumb url={p.thumbUrl} alt="" size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {p.sku}
                          {p.partNumber ? ` · ${p.partNumber}` : ""}
                        </span>
                      </span>
                      <Plus className="text-muted-foreground size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim() && !searching ? (
              <p className="text-muted-foreground text-sm">Sin resultados para &ldquo;{query}&rdquo;.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Cantidades</CardTitle>
          </CardHeader>
          <CardContent>
            {selected.length === 0 ? (
              <EmptyState title="Nada seleccionado" description="Busca arriba y toca un producto para agregarlo a la lista." />
            ) : (
              <ul className="divide-y">
                {selected.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <ProductThumb url={p.thumbUrl} alt="" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {p.sku}
                        {p.partNumber ? ` · ${p.partNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" aria-label="Menos" onClick={() => setQty(p.id, p.quantity - 1)}>
                        <Minus />
                      </Button>
                      <Input
                        inputMode="numeric"
                        value={p.quantity}
                        onChange={(e) => setQty(p.id, Number(e.target.value))}
                        className="h-9 w-16 text-center"
                        aria-label={`Cantidad de etiquetas de ${p.name}`}
                      />
                      <Button variant="outline" size="icon" aria-label="Más" onClick={() => setQty(p.id, p.quantity + 1)}>
                        <Plus />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setSelected((prev) => prev.filter((x) => x.id !== p.id))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>3. Formato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={format} onValueChange={(v) => setFormat(v as LabelFormat)} className="gap-3">
            {(Object.keys(LABEL_FORMATS) as LabelFormat[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary">
                <RadioGroupItem value={key} id={`format-${key}`} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{LABEL_FORMATS[key].label}</span>
                  <span className="text-muted-foreground block text-xs">{LABEL_FORMATS[key].description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="flex items-center gap-2">
            <Checkbox id="show-price" checked={showPrice} onCheckedChange={(checked) => setShowPrice(checked === true)} />
            <Label htmlFor="show-price">Incluir precio público en USD</Label>
          </div>
          <p className="text-muted-foreground text-sm">
            {total} etiqueta(s) · {pages} página(s){total > MAX_LABELS ? ` · máximo ${MAX_LABELS} por archivo` : ""}
          </p>
          <Button size="lg" className="h-12 w-full" disabled={selected.length === 0} render={<a href={href} target="_blank" rel="noreferrer" />}>
            <Printer /> Generar PDF
          </Button>
          <p className="text-muted-foreground text-xs">Se abre en una pestaña nueva; imprímelo desde ahí sin ajustar a la página.</p>
        </CardContent>
      </Card>
    </div>
  );
}
