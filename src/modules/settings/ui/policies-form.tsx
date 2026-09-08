"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, type FieldError as RHFFieldError, type Path } from "react-hook-form";
import { toast } from "sonner";
import { savePoliciesAction } from "@/app/(app)/configuracion/politicas/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { policiesFormSchema, type PoliciesFormInput } from "@/modules/settings/domain/forms";

export function PoliciesForm({ defaultValues }: { defaultValues: PoliciesFormInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PoliciesFormInput>({ resolver: zodResolver(policiesFormSchema), defaultValues });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await savePoliciesAction(data);
      if (result.ok) {
        toast.success("Políticas guardadas");
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  const numberField = (name: Path<PoliciesFormInput>, label: string, hint: string, error: RHFFieldError | undefined, suffix = "%") => (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="relative w-40">
        <Input id={name} type="number" step="any" inputMode="decimal" className="pr-10 text-right tabular-nums" aria-invalid={Boolean(error)} {...register(name, { valueAsNumber: true })} />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{suffix}</span>
      </div>
      <FieldDescription>{hint}</FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );

  const switchField = (name: "allowNegativeStock" | "requireRatesToSell" | "requireOpenCashSession", label: string, hint: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className="items-start">
          <Switch id={name} className="mt-0.5" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
          <div className="space-y-0.5">
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <FieldDescription>{hint}</FieldDescription>
          </div>
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Ventas y caja</CardTitle>
          <CardDescription>Reglas que se aplican al cobrar en el mostrador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {switchField("requireOpenCashSession", "Exigir caja abierta para vender", "Si está apagado se puede vender sin sesión de caja; los pagos no entrarán en ningún cierre.")}
          {switchField("requireRatesToSell", "Exigir la tasa del día para vender", "Bloquea el cobro en Bs o COP cuando no hay tasa cargada hoy.")}
          {switchField("allowNegativeStock", "Permitir stock negativo", "Deja vender aunque el sistema marque cero existencias (se corrige luego con un ajuste).")}
          {numberField("voidWindowHours", "Ventana para anular", "Horas después de la venta en que un vendedor puede anularla; pasado ese tiempo solo el administrador.", errors.voidWindowHours, "h")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descuentos y precios</CardTitle>
          <CardDescription>Límites por rol y valores sugeridos al registrar productos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {numberField("maxDiscountPctByRole.admin", "Descuento máximo · Administrador", "Sobre el precio de lista.", errors.maxDiscountPctByRole?.admin)}
          {numberField("maxDiscountPctByRole.seller", "Descuento máximo · Vendedor", "Por encima pide PIN de administrador.", errors.maxDiscountPctByRole?.seller)}
          {numberField("maxDiscountPctByRole.warehouse", "Descuento máximo · Almacén", "Normalmente 0.", errors.maxDiscountPctByRole?.warehouse)}
          {numberField("techPriceMarkdownPct", "Precio Técnico sugerido", "Porcentaje por debajo del precio Público al crear un producto.", errors.techPriceMarkdownPct)}
          {numberField("defaultMarginPct", "Margen sugerido", "Margen sobre el precio para sugerir el precio Público desde el costo.", errors.defaultMarginPct)}
          {numberField("quoteValidityDays", "Vigencia de cotizaciones", "Días de validez por defecto.", errors.quoteValidityDays, "días")}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : "Guardar políticas"}
      </Button>
    </form>
  );
}
