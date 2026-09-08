"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { setRatesAction } from "@/app/(app)/configuracion/tasas/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { setRatesSchema, type SetRatesInput } from "@/modules/settings/domain/forms";

export interface RateCurrency {
  code: string;
  symbol: string;
  /** Latest known rate, for the placeholder. */
  currentRate: string | null;
  currentDate: string | null;
}

const LABEL: Record<string, string> = { VES: "Bs por 1 USD", COP: "COP por 1 USD" };

export function RatesForm({ currencies, today }: { currencies: RateCurrency[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SetRatesInput>({
    resolver: zodResolver(setRatesSchema),
    defaultValues: { effectiveDate: today, rates: Object.fromEntries(currencies.map((c) => [c.code, ""])) },
  });

  // For record fields RHF types `message` through the index signature; read it loosely.
  const ratesError = (errors.rates as { message?: unknown } | undefined)?.message;

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await setRatesAction(data);
      if (result.ok) {
        toast.success(`Tasa guardada: ${result.data.map((r) => `${r.currencyCode} ${formatMoney(r.rate, r.currencyCode, { symbol: "" }).trim()}`).join(" · ")}`);
        reset({ effectiveDate: data.effectiveDate, rates: Object.fromEntries(currencies.map((c) => [c.code, ""])) });
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        {currencies.map((c) => (
          <Field key={c.code} data-invalid={Boolean(errors.rates?.[c.code]) || undefined}>
            <FieldLabel htmlFor={`rate-${c.code}`}>{LABEL[c.code] ?? `${c.code} por 1 USD`}</FieldLabel>
            <Input
              id={`rate-${c.code}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={c.currentRate ? formatMoney(c.currentRate, c.code, { symbol: "" }).trim() : "0"}
              className="h-11 text-right text-lg tabular-nums"
              aria-invalid={Boolean(errors.rates?.[c.code])}
              {...register(`rates.${c.code}`)}
            />
            <FieldError errors={[errors.rates?.[c.code]]} />
          </Field>
        ))}
        <Field data-invalid={Boolean(errors.effectiveDate) || undefined}>
          <FieldLabel htmlFor="effectiveDate">Fecha</FieldLabel>
          <Input id="effectiveDate" type="date" max={today} className="h-11" {...register("effectiveDate")} />
          <FieldError errors={[errors.effectiveDate]} />
        </Field>
      </div>
      {typeof ratesError === "string" ? <FieldError>{ratesError}</FieldError> : null}
      <FieldDescription>Deja vacía la moneda que no cambia. Si ya existe una tasa para esa fecha, se reemplaza.</FieldDescription>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : "Guardar tasa"}
      </Button>
    </form>
  );
}
