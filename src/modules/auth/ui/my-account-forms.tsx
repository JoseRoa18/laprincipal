"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { changeOwnPasswordAction, changeOwnPinAction } from "@/app/(app)/configuracion/mi-cuenta/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { changeOwnPasswordSchema, setPinSchema, type ChangeOwnPasswordInput, type SetPinInput } from "@/modules/settings/domain/user-forms";

/** Current password + new password with confirmation. `email` feeds password managers only. */
export function ChangePasswordForm({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangeOwnPasswordInput, unknown, z.output<typeof changeOwnPasswordSchema>>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: { currentPassword: "", password: "", passwordConfirm: "" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await changeOwnPasswordAction(data);
      if (result.ok) {
        toast.success("Contraseña actualizada");
        reset();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* Hidden username so browsers associate the new password with this account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden className="sr-only" />

      <Field data-invalid={Boolean(errors.currentPassword) || undefined}>
        <FieldLabel htmlFor="currentPassword">Contraseña actual</FieldLabel>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.currentPassword)}
          {...register("currentPassword")}
        />
        <FieldError errors={[errors.currentPassword]} />
      </Field>

      <Field data-invalid={Boolean(errors.password) || undefined}>
        <FieldLabel htmlFor="password">Nueva contraseña</FieldLabel>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register("password")} />
        <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
        <FieldError errors={[errors.password]} />
      </Field>

      <Field data-invalid={Boolean(errors.passwordConfirm) || undefined}>
        <FieldLabel htmlFor="passwordConfirm">Confirmar nueva contraseña</FieldLabel>
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.passwordConfirm)}
          {...register("passwordConfirm")}
        />
        <FieldError errors={[errors.passwordConfirm]} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

/** New counter PIN (4 to 6 digits) with confirmation. */
export function ChangePinForm({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SetPinInput, unknown, z.output<typeof setPinSchema>>({
    resolver: zodResolver(setPinSchema),
    defaultValues: { pin: "", pinConfirm: "" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await changeOwnPinAction(data);
      if (result.ok) {
        toast.success(hasPin ? "PIN actualizado" : "PIN creado");
        reset();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field data-invalid={Boolean(errors.pin) || undefined}>
        <FieldLabel htmlFor="pin">Nuevo PIN</FieldLabel>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          aria-invalid={Boolean(errors.pin)}
          {...register("pin")}
        />
        <FieldDescription>De 4 a 6 dígitos. Solo tú debes conocerlo.</FieldDescription>
        <FieldError errors={[errors.pin]} />
      </Field>

      <Field data-invalid={Boolean(errors.pinConfirm) || undefined}>
        <FieldLabel htmlFor="pinConfirm">Confirmar PIN</FieldLabel>
        <Input
          id="pinConfirm"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          aria-invalid={Boolean(errors.pinConfirm)}
          {...register("pinConfirm")}
        />
        <FieldError errors={[errors.pinConfirm]} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : hasPin ? "Cambiar PIN" : "Crear PIN"}
      </Button>
    </form>
  );
}
