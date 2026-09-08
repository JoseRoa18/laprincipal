"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addCashMovementAction } from "@/app/(app)/caja/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { movementSchema, type MovementForm } from "@/modules/cash/domain/forms";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { AmountInput } from "./amount-input";

export interface MovementCurrency {
  code: string;
  symbol: string;
}

export function MovementDialog({
  type,
  currencies,
  admins,
  requiresAuthorization,
}: {
  type: "in" | "out";
  currencies: MovementCurrency[];
  /** Active admins with a PIN (only needed when `requiresAuthorization`). */
  admins: Array<{ id: string; name: string }>;
  /** Sellers need an admin PIN to withdraw cash. */
  requiresAuthorization: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isOut = type === "out";
  const needsPin = isOut && requiresAuthorization;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<MovementForm>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type, currencyCode: currencies[0]?.code ?? "USD", amount: "", reason: "", adminId: admins[0]?.id ?? "", pin: "" },
  });
  const currencyCode = watch("currencyCode");
  const symbol = currencies.find((c) => c.code === currencyCode)?.symbol ?? "";

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await addCashMovementAction(data);
      if (result.ok) {
        toast.success(isOut ? "Retiro registrado" : "Ingreso registrado");
        reset();
        setOpen(false);
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        {isOut ? <ArrowUpFromLine /> : <ArrowDownToLine />}
        {isOut ? "Retiro" : "Ingreso"}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isOut ? "Retiro de efectivo" : "Ingreso de efectivo"}</DialogTitle>
            <DialogDescription>
              {isOut ? "Dinero que sale de la caja (pagos, depósitos, cambio para otra caja)." : "Dinero que entra a la caja sin ser una venta (sencillo, reposición de fondo)."}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" {...register("type")} />
          <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
            <Field>
              <FieldLabel htmlFor={`mv-currency-${type}`}>Moneda</FieldLabel>
              <NativeSelect className="w-full" id={`mv-currency-${type}`} {...register("currencyCode")}>
                {currencies.map((c) => (
                  <NativeSelectOption key={c.code} value={c.code}>
                    {c.code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field data-invalid={Boolean(errors.amount) || undefined}>
              <FieldLabel htmlFor={`mv-amount-${type}`}>Monto</FieldLabel>
              <AmountInput id={`mv-amount-${type}`} symbol={symbol} autoFocus aria-invalid={Boolean(errors.amount)} {...register("amount")} />
              <FieldError errors={[errors.amount]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.reason) || undefined}>
            <FieldLabel htmlFor={`mv-reason-${type}`}>Motivo</FieldLabel>
            <Input id={`mv-reason-${type}`} placeholder={isOut ? "Ej. Pago a proveedor" : "Ej. Sencillo para vueltos"} aria-invalid={Boolean(errors.reason)} {...register("reason")} />
            <FieldError errors={[errors.reason]} />
          </Field>
          {needsPin ? (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Autorización del administrador</p>
              {admins.length === 0 ? (
                <FieldDescription>No hay administradores con PIN configurado. Pídele al administrador que registre su PIN en Mi cuenta.</FieldDescription>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mv-admin">Administrador</FieldLabel>
                    <NativeSelect className="w-full" id="mv-admin" {...register("adminId")}>
                      {admins.map((a) => (
                        <NativeSelectOption key={a.id} value={a.id}>
                          {a.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field data-invalid={Boolean(errors.pin) || undefined}>
                    <FieldLabel htmlFor="mv-pin">PIN</FieldLabel>
                    <Input id="mv-pin" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-invalid={Boolean(errors.pin)} {...register("pin")} />
                    <FieldError errors={[errors.pin]} />
                  </Field>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (needsPin && admins.length === 0)}>
              {pending ? "Guardando..." : isOut ? "Registrar retiro" : "Registrar ingreso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
