"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createPaymentMethodAction, setPaymentMethodFlagAction, updatePaymentMethodAction } from "@/app/(app)/configuracion/metodos-de-pago/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPct } from "@/lib/format";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_FLAG_LABEL,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
  type PaymentMethodCreateData,
  type PaymentMethodCreateInput,
  type PaymentMethodFlag,
  type PaymentMethodListRow,
  type PaymentMethodUpdateData,
  type PaymentMethodUpdateInput,
} from "@/modules/settings/domain/catalog-forms";

export interface CurrencyOption {
  code: string;
  symbol: string;
}

type DialogState = { mode: "create" } | { mode: "edit"; method: PaymentMethodListRow };

export function PaymentMethodsTable({ methods, currencies }: { methods: PaymentMethodListRow[]; currencies: CurrencyOption[] }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const openCreate = () => setDialog({ mode: "create" });
  const nextSortOrder = methods.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {methods.length} {methods.length === 1 ? "método" : "métodos"}
        </p>
        <Button size="lg" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nuevo método
        </Button>
      </div>

      {methods.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no hay métodos de pago"
          description="Crea al menos uno (por ejemplo, Efectivo USD) para poder cobrar en el punto de venta."
          action={<Button onClick={openCreate}>Nuevo método</Button>}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Recargo</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>En caja</TableHead>
                <TableHead>Da cambio</TableHead>
                <TableHead className="hidden text-right md:table-cell">Orden</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <MethodRowItem key={m.id} method={m} onEdit={() => setDialog({ mode: "edit", method: m })} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-muted-foreground text-sm">
        Referencia: el vendedor debe anotar el número de la transferencia o pago. En caja: el dinero se cuenta al cerrar la caja. Da cambio: solo
        para métodos que cuentan en caja.
      </p>

      {dialog?.mode === "create" ? <CreateMethodDialog currencies={currencies} nextSortOrder={nextSortOrder} onClose={() => setDialog(null)} /> : null}
      {dialog?.mode === "edit" ? <EditMethodDialog key={dialog.method.id} method={dialog.method} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function MethodRowItem({ method, onEdit }: { method: PaymentMethodListRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [row, setOptimistic] = useOptimistic(method);

  function toggle(flag: PaymentMethodFlag, checked: boolean) {
    startTransition(async () => {
      const next = { ...method };
      next[flag] = checked;
      if (flag === "countsInDrawer" && !checked) next.allowsChange = false;
      setOptimistic(next);
      const result = await setPaymentMethodFlagAction(method.id, flag, checked);
      if (result.ok) {
        toast.success(`${method.name}: ${PAYMENT_METHOD_FLAG_LABEL[flag].toLowerCase()} ${checked ? "sí" : "no"}`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const flagSwitch = (flag: PaymentMethodFlag, disabled = false) => (
    <Switch
      checked={row[flag]}
      disabled={pending || disabled}
      onCheckedChange={(checked) => toggle(flag, checked)}
      aria-label={`${PAYMENT_METHOD_FLAG_LABEL[flag]}: ${row.name}`}
    />
  );

  return (
    <TableRow className={row.isActive ? undefined : "text-muted-foreground"}>
      <TableCell>
        <div className="font-medium">{row.name}</div>
        <div className="text-muted-foreground font-mono text-xs">{row.code}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{PAYMENT_KIND_LABEL[row.kind]}</Badge>
      </TableCell>
      <TableCell>
        {row.currencyCode} <span className="text-muted-foreground">({row.currencySymbol})</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.surchargePctDisplay === "0" ? <span className="text-muted-foreground">—</span> : formatPct(row.surchargePctDisplay, 2)}
      </TableCell>
      <TableCell>{flagSwitch("isActive")}</TableCell>
      <TableCell>{flagSwitch("requiresReference")}</TableCell>
      <TableCell>{flagSwitch("countsInDrawer")}</TableCell>
      <TableCell>{flagSwitch("allowsChange", !row.countsInDrawer)}</TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{row.sortOrder}</TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Editar
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CreateMethodDialog({ currencies, nextSortOrder, onClose }: { currencies: CurrencyOption[]; nextSortOrder: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<PaymentMethodCreateInput, unknown, PaymentMethodCreateData>({
    resolver: zodResolver(paymentMethodCreateSchema),
    defaultValues: {
      code: "",
      name: "",
      kind: "transfer",
      currencyCode: currencies[0]?.code ?? "USD",
      requiresReference: true,
      countsInDrawer: false,
      allowsChange: false,
      surchargePct: "0",
      sortOrder: nextSortOrder,
    },
  });
  const countsInDrawer = Boolean(useWatch({ control, name: "countsInDrawer" }));

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createPaymentMethodAction(data);
      if (result.ok) {
        toast.success("Método de pago creado");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  const flagField = (name: "requiresReference" | "countsInDrawer" | "allowsChange", label: string, description: string, disabled = false) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" data-invalid={Boolean(errors[name]) || undefined}>
          <Switch id={`pm-${name}`} checked={Boolean(field.value)} disabled={disabled} onCheckedChange={(checked) => field.onChange(checked)} />
          <FieldContent>
            <FieldLabel htmlFor={`pm-${name}`}>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
            <FieldError errors={[errors[name]]} />
          </FieldContent>
        </Field>
      )}
    />
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Nuevo método de pago</DialogTitle>
            <DialogDescription>El código, el tipo y la moneda no se pueden cambiar después.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field data-invalid={Boolean(errors.code) || undefined}>
              <FieldLabel htmlFor="pm-code">Código</FieldLabel>
              <Input
                id="pm-code"
                autoFocus
                placeholder="Ej. ZELLE"
                autoCapitalize="characters"
                className="h-11 font-mono text-base uppercase"
                aria-invalid={Boolean(errors.code) || undefined}
                {...register("code")}
              />
              <FieldError errors={[errors.code]} />
            </Field>
            <Field data-invalid={Boolean(errors.name) || undefined}>
              <FieldLabel htmlFor="pm-name">Nombre</FieldLabel>
              <Input id="pm-name" placeholder="Ej. Zelle" className="h-11 text-base" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(errors.kind) || undefined}>
              <FieldLabel htmlFor="pm-kind">Tipo</FieldLabel>
              <NativeSelect
                id="pm-kind"
                className="w-full [&>select]:h-11"
                aria-invalid={Boolean(errors.kind) || undefined}
                {...register("kind", {
                  onChange: (e) => {
                    const cash = e.target.value === "cash";
                    setValue("countsInDrawer", cash, { shouldDirty: true });
                    setValue("allowsChange", cash, { shouldDirty: true });
                    setValue("requiresReference", !cash, { shouldDirty: true });
                  },
                })}
              >
                {PAYMENT_KINDS.map((k) => (
                  <NativeSelectOption key={k.value} value={k.value}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.kind]} />
            </Field>
            <Field data-invalid={Boolean(errors.currencyCode) || undefined}>
              <FieldLabel htmlFor="pm-currency">Moneda</FieldLabel>
              <NativeSelect id="pm-currency" className="w-full [&>select]:h-11" aria-invalid={Boolean(errors.currencyCode) || undefined} {...register("currencyCode")}>
                {currencies.map((c) => (
                  <NativeSelectOption key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.currencyCode]} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(errors.surchargePct) || undefined}>
              <FieldLabel htmlFor="pm-surcharge">Recargo (%)</FieldLabel>
              <Input id="pm-surcharge" inputMode="decimal" placeholder="0" className="h-11 text-base" aria-invalid={Boolean(errors.surchargePct) || undefined} {...register("surchargePct")} />
              <FieldDescription>Por ejemplo, el IGTF. 0 si no aplica.</FieldDescription>
              <FieldError errors={[errors.surchargePct]} />
            </Field>
            <Field data-invalid={Boolean(errors.sortOrder) || undefined}>
              <FieldLabel htmlFor="pm-order">Orden</FieldLabel>
              <Input
                id="pm-order"
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                step={1}
                className="h-11 text-base"
                aria-invalid={Boolean(errors.sortOrder) || undefined}
                {...register("sortOrder")}
              />
              <FieldDescription>Posición al cobrar.</FieldDescription>
              <FieldError errors={[errors.sortOrder]} />
            </Field>
          </div>

          <div className="space-y-3">
            {flagField("requiresReference", "Requiere referencia", "El vendedor anota el número de la operación.")}
            {flagField("countsInDrawer", "Cuenta en caja", "El dinero se cuenta al abrir y cerrar la caja.")}
            {flagField("allowsChange", "Permite dar cambio", "Solo para métodos que cuentan en caja.", !countsInDrawer)}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando..." : "Crear método"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMethodDialog({ method, onClose }: { method: PaymentMethodListRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PaymentMethodUpdateInput, unknown, PaymentMethodUpdateData>({
    resolver: zodResolver(paymentMethodUpdateSchema),
    defaultValues: {
      name: method.name,
      surchargePct: method.surchargePctDisplay,
      sortOrder: method.sortOrder,
      // Flags are edited inline in the table; they travel unchanged with the form.
      isActive: method.isActive,
      requiresReference: method.requiresReference,
      countsInDrawer: method.countsInDrawer,
      allowsChange: method.allowsChange,
    },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updatePaymentMethodAction(method.id, data);
      if (result.ok) {
        toast.success("Método de pago actualizado");
        onClose();
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Editar método de pago</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{method.code}</span> · {PAYMENT_KIND_LABEL[method.kind]} · {method.currencyCode}
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="pm-edit-name">Nombre</FieldLabel>
            <Input id="pm-edit-name" autoFocus className="h-11 text-base" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(errors.surchargePct) || undefined}>
              <FieldLabel htmlFor="pm-edit-surcharge">Recargo (%)</FieldLabel>
              <Input
                id="pm-edit-surcharge"
                inputMode="decimal"
                placeholder="0"
                className="h-11 text-base"
                aria-invalid={Boolean(errors.surchargePct) || undefined}
                {...register("surchargePct")}
              />
              <FieldDescription>Por ejemplo, el IGTF. 0 si no aplica.</FieldDescription>
              <FieldError errors={[errors.surchargePct]} />
            </Field>
            <Field data-invalid={Boolean(errors.sortOrder) || undefined}>
              <FieldLabel htmlFor="pm-edit-order">Orden</FieldLabel>
              <Input
                id="pm-edit-order"
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                step={1}
                className="h-11 text-base"
                aria-invalid={Boolean(errors.sortOrder) || undefined}
                {...register("sortOrder")}
              />
              <FieldDescription>Posición al cobrar.</FieldDescription>
              <FieldError errors={[errors.sortOrder]} />
            </Field>
          </div>
          {errors.allowsChange ? <FieldError errors={[errors.allowsChange]} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
