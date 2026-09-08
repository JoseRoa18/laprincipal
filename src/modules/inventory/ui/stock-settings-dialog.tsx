"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { upsertStockSettingsAction } from "@/app/(app)/inventario/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { stockSettingsSchema } from "@/modules/inventory/application/schemas";
import { STOCK_MODE_LABEL } from "@/modules/inventory/infrastructure/labels";

type FormValues = z.input<typeof stockSettingsSchema>;

export interface StockSettingsProduct {
  productId: string;
  name: string;
  unitDecimals: number;
  minStock: string;
  maxStock: string;
  reorderPoint: string;
  reorderQty: string;
  mode: "manual" | "auto";
}

function trimZeros(v: string) {
  return v.includes(".") ? v.replace(/\.?0+$/, "") : v;
}

/** Inline dialog to edit min / max / reorder point of one product. */
export function StockSettingsDialog({
  product,
  iconOnly = false,
  size = "sm",
}: {
  product: StockSettingsProduct;
  iconOnly?: boolean;
  size?: "sm" | "default" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const step = product.unitDecimals > 0 ? `0.${"0".repeat(product.unitDecimals - 1)}1` : "1";

  const form = useForm<FormValues, unknown, z.output<typeof stockSettingsSchema>>({
    resolver: zodResolver(stockSettingsSchema),
    defaultValues: {
      productId: product.productId,
      minStock: trimZeros(product.minStock),
      maxStock: trimZeros(product.maxStock),
      reorderPoint: trimZeros(product.reorderPoint),
      reorderQty: trimZeros(product.reorderQty),
      mode: product.mode,
    },
  });
  const { register, handleSubmit, formState, setError } = form;

  const onSubmit = handleSubmit(async (values) => {
    const result = await upsertStockSettingsAction(values);
    if (!result.ok) {
      const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
      for (const [k, msg] of Object.entries(fields)) setError(k as keyof FormValues, { message: msg });
      toast.error(result.error.message);
      return;
    }
    toast.success("Mínimos guardados");
    setOpen(false);
    router.refresh();
  });

  const numberField = (name: "minStock" | "maxStock" | "reorderPoint" | "reorderQty", label: string, hint?: string) => (
    <Field data-invalid={Boolean(formState.errors[name]) || undefined}>
      <FieldLabel htmlFor={`${product.productId}-${name}`}>{label}</FieldLabel>
      <Input
        id={`${product.productId}-${name}`}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        className="h-11 text-base"
        aria-invalid={Boolean(formState.errors[name]) || undefined}
        {...register(name)}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <FieldError errors={[formState.errors[name]]} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={iconOnly ? "icon-sm" : size} aria-label="Editar mínimos" />}>
        <SlidersHorizontal />
        {iconOnly ? null : "Editar mínimos"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Mínimos y máximos</DialogTitle>
            <DialogDescription className="truncate">{product.name}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {numberField("minStock", "Mínimo", "Avisar cuando baje de aquí")}
            {numberField("maxStock", "Máximo", "0 = sin límite")}
            {numberField("reorderPoint", "Punto de reorden", "Vacío o 0 usa el mínimo")}
            {numberField("reorderQty", "Cantidad a pedir")}
          </div>
          <Field>
            <FieldLabel htmlFor={`${product.productId}-mode`}>Modo</FieldLabel>
            <NativeSelect id={`${product.productId}-mode`} className="w-full [&>select]:h-11" {...register("mode")}>
              {(Object.keys(STOCK_MODE_LABEL) as Array<"manual" | "auto">).map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {STOCK_MODE_LABEL[m]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">En modo automático la app calcula el punto de reorden con la velocidad de venta.</p>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)} disabled={formState.isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
