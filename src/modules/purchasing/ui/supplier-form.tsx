"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createSupplierAction, updateSupplierAction } from "@/app/(app)/compras/proveedores/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { supplierSchema, type SupplierFormValues, type SupplierInput } from "@/modules/purchasing/application/schemas";
import { currencyLabel } from "@/modules/purchasing/infrastructure/labels";

export interface SupplierFormInitial {
  id: string;
  name: string;
  taxId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currencyCode: string;
  leadTimeDays: number;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
}

export function SupplierForm({ initial, currencies }: { initial?: SupplierFormInitial; currencies: string[] }) {
  const router = useRouter();
  const form = useForm<SupplierFormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: initial?.name ?? "",
      taxId: initial?.taxId ?? "",
      contactName: initial?.contactName ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      address: initial?.address ?? "",
      currencyCode: initial?.currencyCode ?? "USD",
      leadTimeDays: initial?.leadTimeDays ?? 7,
      paymentTerms: initial?.paymentTerms ?? "",
      notes: initial?.notes ?? "",
      isActive: initial?.isActive ?? true,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    const result = initial ? await updateSupplierAction({ ...values, id: initial.id }) : await createSupplierAction(values);
    if (!result.ok) {
      const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
      for (const [k, msg] of Object.entries(fields)) setError(k as keyof SupplierFormValues, { message: msg });
      toast.error(result.error.message);
      return;
    }
    toast.success(initial ? "Proveedor actualizado" : "Proveedor creado");
    router.push(`/compras/proveedores/${result.data.id}`);
    router.refresh();
  });

  const text = (name: keyof SupplierFormValues, label: string, opts: { required?: boolean; placeholder?: string; type?: string; autoComplete?: string } = {}) => (
    <Field data-invalid={Boolean(errors[name]) || undefined}>
      <FieldLabel htmlFor={`supplier-${name}`}>
        {label}
        {opts.required ? <span className="text-destructive"> *</span> : null}
      </FieldLabel>
      <Input
        id={`supplier-${name}`}
        type={opts.type ?? "text"}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete ?? "off"}
        aria-invalid={Boolean(errors[name]) || undefined}
        className="h-11 text-base"
        {...register(name)}
      />
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      {text("name", "Nombre", { required: true, placeholder: "Ej.: Refripartes C.A." })}
      <div className="grid gap-5 sm:grid-cols-2">
        {text("taxId", "RIF", { placeholder: "J-12345678-9" })}
        {text("contactName", "Contacto", { placeholder: "Nombre de quien atiende" })}
        {text("phone", "Teléfono", { type: "tel", placeholder: "0414-0000000" })}
        {text("email", "Correo", { type: "email", placeholder: "ventas@proveedor.com" })}
      </div>
      {text("address", "Dirección")}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.currencyCode) || undefined}>
          <FieldLabel htmlFor="supplier-currency">Moneda en la que cotiza</FieldLabel>
          <NativeSelect id="supplier-currency" className="w-full [&>select]:h-11 [&>select]:text-base" {...register("currencyCode")}>
            {currencies.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {currencyLabel(c)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError errors={[errors.currencyCode]} />
        </Field>
        <Field data-invalid={Boolean(errors.leadTimeDays) || undefined}>
          <FieldLabel htmlFor="supplier-leadTimeDays">Tiempo de entrega (días)</FieldLabel>
          <Input id="supplier-leadTimeDays" type="number" inputMode="numeric" min={0} max={365} className="h-11 text-base" {...register("leadTimeDays")} />
          <p className="text-muted-foreground text-xs">Se usa para calcular el punto de reorden.</p>
          <FieldError errors={[errors.leadTimeDays]} />
        </Field>
      </div>
      {text("paymentTerms", "Condiciones de pago", { placeholder: "Ej.: contado, 50 % anticipo" })}
      <Field>
        <FieldLabel htmlFor="supplier-notes">Notas</FieldLabel>
        <Textarea id="supplier-notes" {...register("notes")} />
      </Field>
      {initial ? (
        <label className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm">
          <input type="checkbox" className="accent-primary size-5" {...register("isActive")} />
          Proveedor activo
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" className="h-11" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear proveedor"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={() => router.back()} disabled={formState.isSubmitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
