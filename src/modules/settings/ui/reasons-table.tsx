"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createReasonAction, setReasonActiveAction, updateReasonAction } from "@/app/(app)/configuracion/motivos/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import {
  REASON_KINDS,
  REASON_KIND_LABEL,
  reasonInputSchema,
  type AdjustmentReasonListRow,
  type ReasonData,
  type ReasonInput,
} from "@/modules/settings/domain/catalog-forms";

type DialogState = { mode: "create" } | { mode: "edit"; reason: AdjustmentReasonListRow };

const KIND_BADGE: Record<AdjustmentReasonListRow["kind"], "default" | "secondary" | "outline"> = {
  increase: "default",
  decrease: "secondary",
  both: "outline",
};

export function ReasonsTable({ reasons }: { reasons: AdjustmentReasonListRow[] }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const openCreate = () => setDialog({ mode: "create" });
  const nextSortOrder = reasons.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {reasons.length} {reasons.length === 1 ? "motivo" : "motivos"}
        </p>
        <Button size="lg" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nuevo motivo
        </Button>
      </div>

      {reasons.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Todavía no hay motivos"
          description="Crea motivos como Merma, Daño o Error de conteo para explicar cada ajuste de inventario."
          action={<Button onClick={openCreate}>Nuevo motivo</Button>}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Se usa en</TableHead>
                <TableHead className="hidden text-right md:table-cell">Orden</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((reason) => (
                <ReasonRowItem key={reason.id} reason={reason} onEdit={() => setDialog({ mode: "edit", reason })} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog ? (
        <ReasonDialog key={dialog.mode === "edit" ? dialog.reason.id : "new"} state={dialog} nextSortOrder={nextSortOrder} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function ReasonRowItem({ reason, onEdit }: { reason: AdjustmentReasonListRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [row, setOptimistic] = useOptimistic(reason);

  function setActive(checked: boolean) {
    startTransition(async () => {
      setOptimistic({ ...reason, isActive: checked });
      const result = await setReasonActiveAction(reason.id, checked);
      if (result.ok) {
        toast.success(checked ? "Motivo activado" : "Motivo desactivado");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <TableRow className={row.isActive ? undefined : "text-muted-foreground"}>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <Badge variant={KIND_BADGE[row.kind]}>{REASON_KIND_LABEL[row.kind]}</Badge>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{row.sortOrder}</TableCell>
      <TableCell>
        <Switch checked={row.isActive} disabled={pending} onCheckedChange={(checked) => setActive(checked)} aria-label={`${row.name} activo`} />
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Editar
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ReasonDialog({ state, nextSortOrder, onClose }: { state: DialogState; nextSortOrder: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.reason : null;

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ReasonInput, unknown, ReasonData>({
    resolver: zodResolver(reasonInputSchema),
    defaultValues: editing
      ? { name: editing.name, kind: editing.kind, sortOrder: editing.sortOrder, isActive: editing.isActive }
      : { name: "", kind: "both", sortOrder: nextSortOrder, isActive: true },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = editing ? await updateReasonAction(editing.id, data) : await createReasonAction(data);
      if (result.ok) {
        toast.success(editing ? "Motivo actualizado" : "Motivo creado");
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
            <DialogTitle>{editing ? "Editar motivo" : "Nuevo motivo"}</DialogTitle>
            <DialogDescription>Los motivos explican por qué entra o sale mercancía sin una compra o una venta.</DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="reason-name">Nombre</FieldLabel>
            <Input id="reason-name" autoFocus placeholder="Ej. Merma" className="h-11 text-base" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field data-invalid={Boolean(errors.kind) || undefined}>
              <FieldLabel htmlFor="reason-kind">Se usa en</FieldLabel>
              <NativeSelect id="reason-kind" className="w-full [&>select]:h-11" aria-invalid={Boolean(errors.kind) || undefined} {...register("kind")}>
                {REASON_KINDS.map((k) => (
                  <NativeSelectOption key={k.value} value={k.value}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.kind]} />
            </Field>
            <Field data-invalid={Boolean(errors.sortOrder) || undefined} className="w-24">
              <FieldLabel htmlFor="reason-order">Orden</FieldLabel>
              <Input
                id="reason-order"
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                step={1}
                className="h-11 text-base"
                aria-invalid={Boolean(errors.sortOrder) || undefined}
                {...register("sortOrder")}
              />
              <FieldError errors={[errors.sortOrder]} />
            </Field>
          </div>
          <FieldDescription>Entrada suma existencias, salida las resta. El orden define la posición en la lista.</FieldDescription>

          {editing ? (
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch id="reason-active" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
                  <FieldContent>
                    <FieldLabel htmlFor="reason-active">Activo</FieldLabel>
                    <FieldDescription>Los motivos inactivos no aparecen al hacer ajustes, pero se conservan en el historial.</FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando..." : editing ? "Guardar" : "Crear motivo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
