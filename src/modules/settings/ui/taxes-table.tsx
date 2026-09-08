"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Percent, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createTaxAction, setDefaultTaxAction, setTaxActiveAction, updateTaxAction } from "@/app/(app)/configuracion/impuestos/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPct } from "@/lib/format";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { taxInputSchema, type TaxData, type TaxInput, type TaxListRow } from "@/modules/settings/domain/catalog-forms";

type DialogState = { mode: "create" } | { mode: "edit"; tax: TaxListRow };

export function TaxesTable({ taxes }: { taxes: TaxListRow[] }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const openCreate = () => setDialog({ mode: "create" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {taxes.length} {taxes.length === 1 ? "impuesto" : "impuestos"}
        </p>
        <Button size="lg" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nuevo impuesto
        </Button>
      </div>

      {taxes.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="Todavía no hay impuestos"
          description="Crea el IVA y un impuesto exento para asignarlos a los productos."
          action={<Button onClick={openCreate}>Nuevo impuesto</Button>}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxes.map((tax) => (
                <TaxRowItem key={tax.id} tax={tax} onEdit={() => setDialog({ mode: "edit", tax })} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog ? <TaxDialog key={dialog.mode === "edit" ? dialog.tax.id : "new"} state={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function TaxRowItem({ tax, onEdit }: { tax: TaxListRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [row, setOptimistic] = useOptimistic(tax);

  function setActive(checked: boolean) {
    startTransition(async () => {
      setOptimistic({ ...tax, isActive: checked });
      const result = await setTaxActiveAction(tax.id, checked);
      if (result.ok) {
        toast.success(checked ? "Impuesto activado" : "Impuesto desactivado");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function makeDefault() {
    startTransition(async () => {
      setOptimistic({ ...tax, isDefault: true });
      const result = await setDefaultTaxAction(tax.id);
      if (result.ok) {
        toast.success(`${tax.name} es ahora el impuesto predeterminado`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <TableRow className={row.isActive ? undefined : "text-muted-foreground"}>
      <TableCell>
        <span className="font-medium">{row.name}</span>
        {row.isDefault ? <Badge className="ml-2">Predeterminado</Badge> : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatPct(row.ratePct, 2)}</TableCell>
      <TableCell>
        <Switch
          checked={row.isActive}
          disabled={pending || row.isDefault}
          onCheckedChange={(checked) => setActive(checked)}
          aria-label={`${row.name} activo`}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {!row.isDefault && row.isActive ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={makeDefault}>
              Hacer predeterminado
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function TaxDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.tax : null;

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<TaxInput, unknown, TaxData>({
    resolver: zodResolver(taxInputSchema),
    defaultValues: editing
      ? { name: editing.name, ratePct: editing.ratePct, isDefault: editing.isDefault, isActive: editing.isActive }
      : { name: "", ratePct: "", isDefault: false, isActive: true },
  });
  const isDefault = Boolean(useWatch({ control, name: "isDefault" }));

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = editing ? await updateTaxAction(editing.id, data) : await createTaxAction(data);
      if (result.ok) {
        toast.success(editing ? "Impuesto actualizado" : "Impuesto creado");
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <form onSubmit={onSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar impuesto" : "Nuevo impuesto"}</DialogTitle>
            <DialogDescription>
              {editing ? "La nueva tasa se usa en las ventas siguientes; las ya guardadas no cambian." : "Después podrás asignarlo a los productos."}
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="tax-name">Nombre</FieldLabel>
            <Input id="tax-name" autoFocus placeholder="Ej. IVA 16 %" className="h-11 text-base" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field data-invalid={Boolean(errors.ratePct) || undefined}>
            <FieldLabel htmlFor="tax-rate">Tasa (%)</FieldLabel>
            <Input
              id="tax-rate"
              inputMode="decimal"
              placeholder="16"
              className="h-11 text-base"
              aria-invalid={Boolean(errors.ratePct) || undefined}
              {...register("ratePct")}
            />
            <FieldDescription>Entre 0 y 100. Usa 0 para los productos exentos.</FieldDescription>
            <FieldError errors={[errors.ratePct]} />
          </Field>

          <Controller
            control={control}
            name="isDefault"
            render={({ field }) => (
              <Field orientation="horizontal" data-invalid={Boolean(errors.isDefault) || undefined}>
                <Switch
                  id="tax-default"
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  disabled={Boolean(editing?.isDefault)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="tax-default">Impuesto predeterminado</FieldLabel>
                  <FieldDescription>
                    {editing?.isDefault ? "Para cambiarlo, marca otro impuesto como predeterminado." : "Se asigna a los productos nuevos. Solo puede haber uno."}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          {errors.isDefault ? <FieldError errors={[errors.isDefault]} /> : null}

          {editing ? (
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Field orientation="horizontal" data-invalid={Boolean(errors.isActive) || undefined}>
                  <Switch id="tax-active" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} disabled={isDefault} />
                  <FieldContent>
                    <FieldLabel htmlFor="tax-active">Activo</FieldLabel>
                    <FieldDescription>{isDefault ? "El impuesto predeterminado siempre está activo." : "Los inactivos no se pueden asignar a productos."}</FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          ) : null}
          {errors.isActive ? <FieldError errors={[errors.isActive]} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando..." : editing ? "Guardar" : "Crear impuesto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
