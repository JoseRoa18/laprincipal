"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { savePrintingAction } from "@/app/(app)/configuracion/impresion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { printingFormSchema, type PrintingFormInput } from "@/modules/settings/domain/forms";

export function PrintingForm({ defaultValues }: { defaultValues: PrintingFormInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PrintingFormInput>({ resolver: zodResolver(printingFormSchema), defaultValues });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await savePrintingAction(data);
      if (result.ok) {
        toast.success("Impresión guardada");
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Field data-invalid={Boolean(errors.ticketWidthMm) || undefined}>
        <FieldLabel htmlFor="ticketWidthMm">Ancho del ticket</FieldLabel>
        <NativeSelect className="w-full sm:w-60" id="ticketWidthMm" {...register("ticketWidthMm", { setValueAs: (v) => Number(v) })}>
          <NativeSelectOption value={80}>80 mm (rollo estándar)</NativeSelectOption>
          <NativeSelectOption value={58}>58 mm (impresora pequeña)</NativeSelectOption>
        </NativeSelect>
        <FieldError errors={[errors.ticketWidthMm]} />
      </Field>

      <Field data-invalid={Boolean(errors.footer) || undefined}>
        <FieldLabel htmlFor="footer">Pie de página</FieldLabel>
        <Textarea id="footer" rows={3} placeholder="¡Gracias por su compra!" {...register("footer")} />
        <FieldDescription>Texto al final del ticket: agradecimiento, política de garantía, WhatsApp.</FieldDescription>
        <FieldError errors={[errors.footer]} />
      </Field>

      <div className="space-y-3">
        <Controller
          control={control}
          name="showBsOnTicket"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id="showBsOnTicket" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
              <FieldLabel htmlFor="showBsOnTicket">Mostrar el total en bolívares (Bs)</FieldLabel>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="showCopOnTicket"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id="showCopOnTicket" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
              <FieldLabel htmlFor="showCopOnTicket">Mostrar el total en pesos (COP)</FieldLabel>
            </Field>
          )}
        />
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
