"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCountAction } from "@/app/(app)/inventario/conteos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryOption } from "@/modules/inventory/infrastructure/stock-query";

/** Start a physical count: optional category or shelf filter, blind mode. */
export function CountCreateForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [locationPrefix, setLocationPrefix] = useState("");
  const [blind, setBlind] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createCountAction({ categoryId, locationPrefix, blind, notes });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Conteo creado con ${result.data.itemCount} ${result.data.itemCount === 1 ? "producto" : "productos"}`);
      router.push(`/inventario/conteos/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="category" className="text-base">
          Categoría
        </Label>
        <NativeSelect id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full [&>select]:h-11 [&>select]:text-base">
          <NativeSelectOption value="">Todo el inventario</NativeSelectOption>
          {categories.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="location" className="text-base">
          Ubicación (empieza por)
        </Label>
        <Input id="location" value={locationPrefix} onChange={(e) => setLocationPrefix(e.target.value)} placeholder="Ej.: P2-E3" className="h-11 text-base" />
        <p className="text-muted-foreground text-sm">Deja vacío para contar todos los estantes.</p>
      </div>
      <Label className="h-12 cursor-pointer gap-3 rounded-lg border px-3 text-base font-normal">
        <input type="checkbox" className="accent-primary size-5" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
        <span>
          Conteo ciego
          <span className="text-muted-foreground block text-xs">No muestra la existencia esperada mientras se cuenta.</span>
        </span>
      </Label>
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-base">
          Notas
        </Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </div>
      <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? "Creando..." : "Empezar a contar"}
      </Button>
    </form>
  );
}
