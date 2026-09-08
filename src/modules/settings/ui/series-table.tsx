"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Hash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { updateDocumentSeriesAction } from "@/app/(app)/configuracion/series/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import {
  SERIES_PADDINGS,
  documentSeriesInputSchema,
  formatDocumentNumber,
  type DocumentSeriesData,
  type DocumentSeriesInput,
  type DocumentSeriesListRow,
} from "@/modules/settings/domain/catalog-forms";

export function SeriesTable({ series }: { series: DocumentSeriesListRow[] }) {
  const [editing, setEditing] = useState<DocumentSeriesListRow | null>(null);

  return (
    <div className="space-y-4">
      {series.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="No hay series configuradas"
          description="Las series se crean con los datos iniciales de la aplicación (pnpm db:seed)."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Prefijo</TableHead>
                <TableHead className="text-right">Relleno</TableHead>
                <TableHead className="text-right">Próximo número</TableHead>
                <TableHead>Ejemplo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell className="font-mono">{s.prefix}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.padding} dígitos</TableCell>
                  <TableCell className="text-right tabular-nums">{s.nextNumber}</TableCell>
                  <TableCell className="font-mono">{s.example}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-muted-foreground text-sm">
        El ejemplo muestra cómo se numerará el próximo documento. El próximo número solo puede subir: los números que se salten no se usarán nunca.
      </p>

      {editing ? <SeriesDialog key={editing.id} series={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SeriesDialog({ series, onClose }: { series: DocumentSeriesListRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<DocumentSeriesInput, unknown, DocumentSeriesData>({
    resolver: zodResolver(documentSeriesInputSchema),
    defaultValues: { prefix: series.prefix, padding: series.padding, nextNumber: series.nextNumber, confirm: false },
  });

  const [prefixValue, paddingValue, nextValue] = useWatch({ control, name: ["prefix", "padding", "nextNumber"] });
  const prefix = String(prefixValue ?? "");
  const padding = Number(paddingValue);
  const nextNumber = Number(nextValue);
  const preview = formatDocumentNumber(prefix, padding, nextNumber);
  const jumps = Number.isInteger(nextNumber) && nextNumber > series.nextNumber;

  function save(data: DocumentSeriesData) {
    startTransition(async () => {
      const result = await updateDocumentSeriesAction(series.id, data);
      if (result.ok) {
        toast.success(`Serie de ${series.label.toLowerCase()} actualizada`);
        onClose();
        router.refresh();
      } else {
        setConfirming(false);
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  }

  const onSubmit = handleSubmit((data) => {
    if (data.nextNumber < series.nextNumber) {
      setError("nextNumber", { type: "manual", message: `No puede ser menor que ${series.nextNumber}, el próximo número actual.` });
      return;
    }
    const moves = data.nextNumber > series.nextNumber;
    if (moves && !confirming) {
      setConfirming(true);
      return;
    }
    save({ ...data, confirm: moves });
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
            <DialogTitle>Serie de {series.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Próximo documento: <span className="text-foreground font-mono font-medium">{preview}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field data-invalid={Boolean(errors.prefix) || undefined}>
              <FieldLabel htmlFor="series-prefix">Prefijo</FieldLabel>
              <Input
                id="series-prefix"
                autoFocus
                placeholder="Ej. V-"
                maxLength={10}
                readOnly={confirming}
                className="h-11 font-mono text-base"
                aria-invalid={Boolean(errors.prefix) || undefined}
                {...register("prefix")}
              />
              <FieldError errors={[errors.prefix]} />
            </Field>
            <Field data-invalid={Boolean(errors.padding) || undefined} className="w-28">
              <FieldLabel htmlFor="series-padding">Relleno</FieldLabel>
              <NativeSelect id="series-padding" className="w-full [&>select]:h-11" disabled={confirming} aria-invalid={Boolean(errors.padding) || undefined} {...register("padding")}>
                {SERIES_PADDINGS.map((p) => (
                  <NativeSelectOption key={p} value={p}>
                    {p} dígitos
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[errors.padding]} />
            </Field>
          </div>

          <Field data-invalid={Boolean(errors.nextNumber) || undefined}>
            <FieldLabel htmlFor="series-next">Próximo número</FieldLabel>
            <Input
              id="series-next"
              type="number"
              inputMode="numeric"
              min={series.nextNumber}
              step={1}
              readOnly={confirming}
              className="h-11 text-base"
              aria-invalid={Boolean(errors.nextNumber) || undefined}
              {...register("nextNumber")}
            />
            <FieldDescription>Actualmente {series.nextNumber}. Solo puede subir; los números saltados no se usarán nunca.</FieldDescription>
            <FieldError errors={[errors.nextNumber]} />
          </Field>

          {confirming && jumps ? (
            <div role="alert" className="border-destructive/40 bg-destructive/5 text-destructive space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                Vas a saltar del {series.nextNumber} al {nextNumber}.
              </p>
              <p>
                {nextNumber - series.nextNumber === 1
                  ? `El número ${formatDocumentNumber(prefix, padding, series.nextNumber)} no se usará nunca.`
                  : `Los números del ${formatDocumentNumber(prefix, padding, series.nextNumber)} al ${formatDocumentNumber(prefix, padding, nextNumber - 1)} no se usarán nunca.`}{" "}
                Esta acción no se puede deshacer.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            {confirming ? (
              <>
                <Button type="button" variant="outline" size="lg" onClick={() => setConfirming(false)} disabled={pending}>
                  Volver
                </Button>
                <Button type="submit" variant="destructive" size="lg" disabled={pending}>
                  {pending ? "Guardando..." : "Sí, saltar la numeración"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? "Guardando..." : "Guardar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
