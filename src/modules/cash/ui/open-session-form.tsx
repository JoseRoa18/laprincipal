"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { openCashSessionAction } from "@/app/(app)/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { openSessionSchema, type OpenSessionForm as OpenSessionValues } from "@/modules/cash/domain/forms";
import type { CashCurrency } from "@/modules/cash/infrastructure/queries";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { AmountInput } from "./amount-input";

export function OpenSessionForm({ currencies }: { currencies: CashCurrency[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OpenSessionValues>({
    resolver: zodResolver(openSessionSchema),
    defaultValues: { openings: currencies.map((c) => ({ currencyCode: c.code, amount: "" })), notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await openCashSessionAction(data);
      if (result.ok) {
        toast.success(`Caja ${result.data.number ?? ""} abierta`);
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {currencies.map((c, i) => (
          <Field key={c.code} data-invalid={Boolean(errors.openings?.[i]?.amount) || undefined}>
            <FieldLabel htmlFor={`opening-${c.code}`}>Fondo inicial en {c.code === "USD" ? "dólares" : c.code === "COP" ? "pesos" : c.code}</FieldLabel>
            <input type="hidden" {...register(`openings.${i}.currencyCode`)} />
            <AmountInput id={`opening-${c.code}`} symbol={c.symbol} aria-invalid={Boolean(errors.openings?.[i]?.amount)} {...register(`openings.${i}.amount`)} />
            <FieldError errors={[errors.openings?.[i]?.amount]} />
          </Field>
        ))}
      </div>
      <FieldDescription>Cuenta el efectivo con el que empiezas el día. Si no hay fondo, deja el campo vacío.</FieldDescription>
      <Field data-invalid={Boolean(errors.notes) || undefined}>
        <FieldLabel htmlFor="notes">Notas</FieldLabel>
        <Textarea id="notes" rows={2} placeholder="Opcional" {...register("notes")} />
        <FieldError errors={[errors.notes]} />
      </Field>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Abriendo..." : "Abrir caja"}
      </Button>
    </form>
  );
}
