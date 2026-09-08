"use client";

import { CheckCircle2, Download, FileUp, RotateCcw, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyImportAction, undoImportAction, validateImportAction } from "@/app/(app)/productos/importar/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { ImportJobView, ImportPreview, UndoImportResult } from "../application/import";
import { IMPORT_STATUS_LABEL } from "./labels-es";

type Step = { kind: "upload" } | { kind: "preview"; preview: ImportPreview } | { kind: "done"; jobId: string; created: number; skipped: number; undo?: UndoImportResult };

export function ImportWizard({ jobs }: { jobs: ImportJobView[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "upload" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function validate() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Elige el archivo Excel que quieres importar.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await validateImportAction(fd);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setStep({ kind: "preview", preview: res.data });
    });
  }

  function apply(jobId: string) {
    startTransition(async () => {
      const res = await applyImportAction(jobId);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`${res.data.created} producto(s) importados`);
      setStep({ kind: "done", jobId, created: res.data.created, skipped: res.data.skipped });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {step.kind === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Descarga la plantilla y llénala</CardTitle>
            <CardDescription>Una fila por producto. Las columnas marcadas con * son obligatorias; la hoja &ldquo;Instrucciones&rdquo; explica cada una.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button size="lg" variant="outline" className="h-12" render={<a href="/api/products/import/template" />}>
              <Download /> Descargar plantilla Excel
            </Button>
            <div className="space-y-3">
              <p className="font-medium">2. Sube el archivo lleno</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" size="lg" variant="outline" className="h-12" onClick={() => fileRef.current?.click()} disabled={pending}>
                  <FileUp /> {fileName ? "Cambiar archivo" : "Elegir archivo .xlsx"}
                </Button>
                {fileName ? <span className="text-muted-foreground text-sm">{fileName}</span> : null}
                <Button type="button" size="lg" className="h-12 sm:ml-auto" onClick={validate} disabled={pending || !fileName}>
                  {pending ? "Validando..." : "Validar archivo"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">Primero se revisa fila por fila; nada se guarda hasta que apliques.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step.kind === "preview" ? <PreviewStep preview={step.preview} pending={pending} onApply={() => apply(step.preview.jobId)} onBack={() => setStep({ kind: "upload" })} /> : null}

      {step.kind === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" /> Importación aplicada
            </CardTitle>
            <CardDescription>
              {step.created} producto(s) creados{step.skipped > 0 ? `, ${step.skipped} fila(s) con errores omitidas` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="lg" render={<Link href="/productos" />}>
              Ver productos
            </Button>
            {!step.undo ? (
              <ConfirmButton
                title="Deshacer importación"
                description="Los productos creados se eliminarán. Si recibieron stock inicial se registra una salida por ajuste (el kardex no se borra). Los que ya tengan ventas o compras se conservan."
                confirmLabel="Deshacer"
                destructive
                size="lg"
                action={() => undoImportAction(step.jobId)}
                onSuccess={() => router.refresh()}
              >
                <Undo2 /> Deshacer
              </ConfirmButton>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setFileName(null);
                setStep({ kind: "upload" });
              }}
            >
              <RotateCcw /> Importar otro archivo
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Importaciones recientes</CardTitle>
          <CardDescription>Puedes deshacer una importación aplicada si te equivocaste de archivo.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay importaciones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead className="text-right">Creados</TableHead>
                  <TableHead className="text-right">Errores</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{formatDateTime(j.appliedAt ?? j.createdAt)}</TableCell>
                    <TableCell>{j.createdBy ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={j.status === "applied" ? "default" : "secondary"}>{IMPORT_STATUS_LABEL[j.status] ?? j.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{j.totalRows}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.createdCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.errorRows}</TableCell>
                    <TableCell className="text-right">
                      {j.status === "applied" ? (
                        <ConfirmButton
                          title="Deshacer importación"
                          description="Los productos creados se eliminarán. Si recibieron stock inicial se registra una salida por ajuste. Los que ya tengan ventas o compras se conservan."
                          confirmLabel="Deshacer"
                          destructive
                          size="sm"
                          variant="outline"
                          action={() => undoImportAction(j.id)}
                          onSuccess={() => router.refresh()}
                        >
                          <Undo2 /> Deshacer
                        </ConfirmButton>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewStep({ preview, pending, onApply, onBack }: { preview: ImportPreview; pending: boolean; onApply: () => void; onBack: () => void }) {
  const [onlyErrors, setOnlyErrors] = useState(false);
  const rows = onlyErrors ? preview.rows.filter((r) => r.errors.length > 0) : preview.rows;
  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Revisa el resultado</CardTitle>
        <CardDescription>
          {preview.fileName}: {preview.totalRows} fila(s), <span className="text-emerald-700">{preview.okRows} válidas</span>
          {preview.errorRows > 0 ? (
            <>
              , <span className="text-destructive">{preview.errorRows} con errores</span>
            </>
          ) : null}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.unknownHeaders.length > 0 ? (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Columnas ignoradas</AlertTitle>
            <AlertDescription>No se reconocen: {preview.unknownHeaders.join(", ")}. Usa los encabezados de la plantilla.</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" className="h-12" onClick={onApply} disabled={pending || preview.okRows === 0}>
            {pending ? "Importando..." : `Aplicar: importar ${preview.okRows} producto(s)`}
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={onBack} disabled={pending}>
            Subir otro archivo
          </Button>
          {preview.errorRows > 0 ? (
            <Button variant="ghost" size="sm" className="sm:ml-auto" onClick={() => setOnlyErrors((v) => !v)}>
              {onlyErrors ? "Ver todas las filas" : "Ver solo errores"}
            </Button>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Fila</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.rowNumber} className={r.errors.length > 0 ? "bg-destructive/5" : undefined}>
                <TableCell className="tabular-nums">{r.rowNumber}</TableCell>
                <TableCell className="max-w-64 truncate">{r.values.name || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="font-mono text-xs">{r.values.sku || <span className="text-muted-foreground">auto</span>}</TableCell>
                <TableCell className="max-w-48 truncate">{r.values.category || "—"}</TableCell>
                <TableCell>{r.values.brand || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.values.publicPrice || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.values.initialStock || "—"}</TableCell>
                <TableCell className="whitespace-normal">
                  {r.errors.length > 0 ? (
                    <ul className="text-destructive list-inside list-disc text-xs">
                      {r.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="size-3.5" /> OK
                    </span>
                  )}
                  {r.warnings.length > 0 ? <p className="text-muted-foreground text-xs">{r.warnings.join(" · ")}</p> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
