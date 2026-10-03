"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateProductSupplierAction } from "@/app/(app)/compras/proveedores/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { productSupplierSchema, type ProductSupplierFormValues, type ProductSupplierInput } from "@/modules/purchasing/application/schemas";

/** Edit the supplier's own product code and the units per pack it sells. */
export function SupplierLinkDialog({
  productId,
  supplierId,
  title,
  supplierCode,
  packSize,
}: {
  productId: string;
  supplierId: string;
  /** Product name (from the supplier screen) or supplier name (from the product screen). */
  title: string;
  supplierCode: string | null;
  packSize: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, formState, setError } = useForm<ProductSupplierFormValues, unknown, ProductSupplierInput>({
    resolver: zodResolver(productSupplierSchema),
    defaultValues: { productId, supplierId, supplierCode: supplierCode ?? "", packSize },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await updateProductSupplierAction(values);
    if (!result.ok) {
      const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
      for (const [k, msg] of Object.entries(fields)) setError(k as keyof ProductSupplierFormValues, { message: msg });
      toast.error(result.error.message);
      return;
    }
    toast.success("Datos del proveedor guardados");
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar código y empaque" title="Editar código y empaque" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <form onSubmit={onSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Código y empaque del proveedor</DialogTitle>
            <DialogDescription className="truncate">{title}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(formState.errors.supplierCode) || undefined}>
            <FieldLabel htmlFor={`${productId}-${supplierId}-code`}>Código del proveedor</FieldLabel>
            <Input id={`${productId}-${supplierId}-code`} className="h-11 text-base" autoComplete="off" placeholder="Opcional" {...register("supplierCode")} />
            <FieldDescription>Cómo llama el proveedor a este repuesto en su lista o factura.</FieldDescription>
            <FieldError errors={[formState.errors.supplierCode]} />
          </Field>
          <Field data-invalid={Boolean(formState.errors.packSize) || undefined}>
            <FieldLabel htmlFor={`${productId}-${supplierId}-pack`}>Unidades por empaque</FieldLabel>
            <Input id={`${productId}-${supplierId}-pack`} type="number" inputMode="numeric" min={1} step={1} className="h-11 text-base" {...register("packSize")} />
            <FieldDescription>&quot;Qué comprar&quot; redondea la cantidad sugerida a este empaque. Usa 1 si vende por unidad.</FieldDescription>
            <FieldError errors={[formState.errors.packSize]} />
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
