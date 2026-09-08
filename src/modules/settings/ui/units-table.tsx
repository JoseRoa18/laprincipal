"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createUnitAction, deleteUnitAction, updateUnitAction } from "@/app/(app)/configuracion/unidades/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { UNIT_DECIMALS, unitInputSchema, type UnitData, type UnitInput, type UnitListRow } from "@/modules/settings/domain/catalog-forms";

type DialogState = { mode: "create" } | { mode: "edit"; unit: UnitListRow };

export function UnitsTable({ units }: { units: UnitListRow[] }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const openCreate = () => setDialog({ mode: "create" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {units.length} {units.length === 1 ? "unidad" : "unidades"}
        </p>
        <Button size="lg" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nueva unidad
        </Button>
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Todavía no hay unidades"
          description="Crea al menos una unidad (por ejemplo, Unidad o Metro) para poder registrar productos."
          action={<Button onClick={openCreate}>Nueva unidad</Button>}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Símbolo</TableHead>
                <TableHead className="text-right">Decimales</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <UnitRowItem key={unit.id} unit={unit} onEdit={() => setDialog({ mode: "edit", unit })} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog ? <UnitDialog key={dialog.mode === "edit" ? dialog.unit.id : "new"} state={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function UnitRowItem({ unit, onEdit }: { unit: UnitListRow; onEdit: () => void }) {
  const router = useRouter();
  const inUse = unit.productCount > 0;

  return (
    <TableRow>
      <TableCell className="font-medium">{unit.name}</TableCell>
      <TableCell>{unit.symbol}</TableCell>
      <TableCell className="text-right tabular-nums">{unit.decimals}</TableCell>
      <TableCell className="tabular-nums">
        {inUse ? `${unit.productCount} ${unit.productCount === 1 ? "producto" : "productos"}` : <span className="text-muted-foreground">Sin uso</span>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
          <span title={inUse ? "No se puede eliminar: hay productos que usan esta unidad." : undefined}>
            <ConfirmButton
              title={`Eliminar la unidad "${unit.name}"`}
              description="La unidad desaparecerá de la lista. Esta acción no se puede deshacer."
              confirmLabel="Eliminar"
              destructive
              size="sm"
              disabled={inUse}
              action={() => deleteUnitAction(unit.id)}
              successMessage="Unidad eliminada"
              onSuccess={() => router.refresh()}
            >
              Eliminar
            </ConfirmButton>
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function UnitDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.unit : null;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UnitInput, unknown, UnitData>({
    resolver: zodResolver(unitInputSchema),
    defaultValues: editing ? { name: editing.name, symbol: editing.symbol, decimals: editing.decimals } : { name: "", symbol: "", decimals: 0 },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = editing ? await updateUnitAction(editing.id, data) : await createUnitAction(data);
      if (result.ok) {
        toast.success(editing ? "Unidad actualizada" : "Unidad creada");
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
            <DialogTitle>{editing ? "Editar unidad" : "Nueva unidad"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.productCount} ${editing.productCount === 1 ? "producto usa" : "productos usan"} esta unidad.`
                : "Unidad de medida para las cantidades de los productos."}
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="unit-name">Nombre</FieldLabel>
            <Input id="unit-name" autoFocus placeholder="Ej. Metro" className="h-11 text-base" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(errors.symbol) || undefined}>
              <FieldLabel htmlFor="unit-symbol">Símbolo</FieldLabel>
              <Input id="unit-symbol" placeholder="Ej. m" className="h-11 text-base" aria-invalid={Boolean(errors.symbol) || undefined} {...register("symbol")} />
              <FieldError errors={[errors.symbol]} />
            </Field>
            <Field data-invalid={Boolean(errors.decimals) || undefined}>
              <FieldLabel htmlFor="unit-decimals">Decimales</FieldLabel>
              <NativeSelect id="unit-decimals" className="w-full [&>select]:h-11" aria-invalid={Boolean(errors.decimals) || undefined} {...register("decimals")}>
                {UNIT_DECIMALS.map((d) => (
                  <NativeSelectOption key={d.value} value={d.value}>
                    {d.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.decimals]} />
            </Field>
          </div>
          <FieldDescription>Los decimales indican si se venden fracciones: 0 para piezas, 2 para metros, 3 para kilos.</FieldDescription>

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando..." : editing ? "Guardar" : "Crear unidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
