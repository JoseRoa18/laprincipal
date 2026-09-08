"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { createUserAction, resetUserPasswordAction, resetUserPinAction, updateUserAction } from "@/app/(app)/configuracion/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { UserListRow } from "@/modules/auth/infrastructure/users";
import { ROLE_HINT, ROLE_LABEL, ROLES } from "@/modules/auth/ui/roles";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import {
  createUserSchema,
  resetPasswordSchema,
  setPinSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type SetPinInput,
  type UpdateUserInput,
} from "@/modules/settings/domain/user-forms";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/*
 * Each dialog mounts its form inside `DialogContent`, which Base UI unmounts when
 * closed, so every opening starts with fresh default values and no stale errors.
 */

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function CreateUserDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <CreateUserForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateUserInput, unknown, z.output<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "seller", password: "", passwordConfirm: "", pin: "" },
  });
  const role = useWatch({ control, name: "role" });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createUserAction(data);
      if (result.ok) {
        toast.success("Usuario creado");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>Nuevo usuario</DialogTitle>
        <DialogDescription>Entrará con su correo y contraseña. Podrá cambiarlas después desde Mi cuenta.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="create-name">Nombre</FieldLabel>
          <Input id="create-name" autoComplete="off" placeholder="Ej. María Pérez" aria-invalid={Boolean(errors.name)} {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={Boolean(errors.email) || undefined}>
          <FieldLabel htmlFor="create-email">Correo</FieldLabel>
          <Input
            id="create-email"
            type="email"
            autoComplete="off"
            placeholder="maria@correo.com"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={Boolean(errors.role) || undefined}>
          <FieldLabel htmlFor="create-role">Rol</FieldLabel>
          <NativeSelect className="w-full" id="create-role" {...register("role")}>
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {ROLE_LABEL[r]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>{ROLE_HINT[role]}</FieldDescription>
          <FieldError errors={[errors.role]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="create-password">Contraseña</FieldLabel>
            <Input
              id="create-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={Boolean(errors.passwordConfirm) || undefined}>
            <FieldLabel htmlFor="create-password-confirm">Confirmar contraseña</FieldLabel>
            <Input
              id="create-password-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.passwordConfirm)}
              {...register("passwordConfirm")}
            />
            <FieldError errors={[errors.passwordConfirm]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.pin) || undefined}>
          <FieldLabel htmlFor="create-pin">PIN</FieldLabel>
          <Input
            id="create-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            aria-invalid={Boolean(errors.pin)}
            {...register("pin")}
          />
          <FieldDescription>De 4 a 6 dígitos. Sirve para cambiar de vendedor en el mostrador sin cerrar sesión.</FieldDescription>
          <FieldError errors={[errors.pin]} />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creando..." : "Crear usuario"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Edit (name, role, active)
// ---------------------------------------------------------------------------

export function EditUserDialog({ user, isSelf, open, onOpenChange }: DialogProps & { user: UserListRow; isSelf: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <EditUserForm user={user} isSelf={isSelf} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, isSelf, onClose }: { user: UserListRow; isSelf: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<UpdateUserInput, unknown, z.output<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: user.name, role: user.role, isActive: user.isActive },
  });
  const role = useWatch({ control, name: "role" });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateUserAction(user.id, data);
      if (result.ok) {
        toast.success("Usuario actualizado");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription className="truncate">{user.email}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="edit-name">Nombre</FieldLabel>
          <Input id="edit-name" autoComplete="off" aria-invalid={Boolean(errors.name)} {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={Boolean(errors.role) || undefined}>
          <FieldLabel htmlFor="edit-role">Rol</FieldLabel>
          <NativeSelect className="w-full" id="edit-role" {...register("role")}>
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {ROLE_LABEL[r]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>{isSelf ? "No puedes quitarte el rol de administrador." : ROLE_HINT[role]}</FieldDescription>
          <FieldError errors={[errors.role]} />
        </Field>

        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="edit-active"
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(checked)}
                disabled={isSelf}
              />
              <FieldContent>
                <FieldLabel htmlFor="edit-active">Usuario activo</FieldLabel>
                <FieldDescription>
                  {isSelf
                    ? "No puedes desactivar tu propio usuario."
                    : "Si lo desactivas no podrá entrar ni aparecerá al cambiar de vendedor. Debe quedar al menos un administrador activo."}
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export function ResetPasswordDialog({ user, open, onOpenChange }: DialogProps & { user: UserListRow }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <ResetPasswordForm user={user} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordForm({ user, onClose }: { user: UserListRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordInput, unknown, z.output<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await resetUserPasswordAction(user.id, data);
      if (result.ok) {
        toast.success("Contraseña actualizada");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>Cambiar contraseña</DialogTitle>
        <DialogDescription>{user.name} tendrá que entrar con la nueva contraseña la próxima vez.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field data-invalid={Boolean(errors.password) || undefined}>
          <FieldLabel htmlFor="reset-password">Nueva contraseña</FieldLabel>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={Boolean(errors.passwordConfirm) || undefined}>
          <FieldLabel htmlFor="reset-password-confirm">Confirmar contraseña</FieldLabel>
          <Input
            id="reset-password-confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.passwordConfirm)}
            {...register("passwordConfirm")}
          />
          <FieldError errors={[errors.passwordConfirm]} />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reset PIN
// ---------------------------------------------------------------------------

export function ResetPinDialog({ user, open, onOpenChange }: DialogProps & { user: UserListRow }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <ResetPinForm user={user} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ResetPinForm({ user, onClose }: { user: UserListRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SetPinInput, unknown, z.output<typeof setPinSchema>>({
    resolver: zodResolver(setPinSchema),
    defaultValues: { pin: "", pinConfirm: "" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await resetUserPinAction(user.id, data);
      if (result.ok) {
        toast.success("PIN actualizado");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{user.hasPin ? "Cambiar PIN" : "Asignar PIN"}</DialogTitle>
        <DialogDescription>{user.name} usará el nuevo PIN para cambiar de vendedor en el mostrador.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field data-invalid={Boolean(errors.pin) || undefined}>
          <FieldLabel htmlFor="reset-pin">Nuevo PIN</FieldLabel>
          <Input
            id="reset-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            aria-invalid={Boolean(errors.pin)}
            {...register("pin")}
          />
          <FieldDescription>De 4 a 6 dígitos.</FieldDescription>
          <FieldError errors={[errors.pin]} />
        </Field>
        <Field data-invalid={Boolean(errors.pinConfirm) || undefined}>
          <FieldLabel htmlFor="reset-pin-confirm">Confirmar PIN</FieldLabel>
          <Input
            id="reset-pin-confirm"
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
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando..." : user.hasPin ? "Cambiar PIN" : "Asignar PIN"}
        </Button>
      </DialogFooter>
    </form>
  );
}
