"use client";

import { Camera, Check, ImageIcon, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";
import { compositeOnWhite, downscaleImage, makeThumb, removeBackgroundWithTimeout } from "./photo-pipeline";

export type PhotoChoice = "processed" | "original";

export interface PhotoDraft {
  id: string;
  original: Blob;
  processed: Blob | null;
  /** Thumbnail of the chosen version (original until the cut-out is ready). */
  thumb: Blob | null;
  thumbOriginal: Blob | null;
  status: "processing" | "processed" | "original_only";
  stage: string;
  percent: number;
  /** Set once the user accepts the photo. */
  choice: PhotoChoice | null;
  originalUrl: string;
  processedUrl: string | null;
  error: string | null;
  uploading: boolean;
}

export interface AcceptedPhoto {
  id: string;
  original: Blob;
  processed: Blob | null;
  thumb: Blob | null;
  choice: PhotoChoice;
}

export function acceptedFromDraft(d: PhotoDraft): AcceptedPhoto | null {
  if (!d.choice) return null;
  const useProcessed = d.choice === "processed" && d.processed;
  return {
    id: d.id,
    original: d.original,
    processed: useProcessed ? d.processed : null,
    thumb: useProcessed ? d.thumb : d.thumbOriginal,
    choice: useProcessed ? "processed" : "original",
  };
}

/** Build the FormData expected by uploadProductPhotoAction. */
export function photoFormData(productId: string, photo: AcceptedPhoto): FormData {
  const fd = new FormData();
  fd.set("productId", productId);
  fd.set("status", photo.processed ? "processed" : "original_only");
  fd.set("original", new File([photo.original], "original.jpg", { type: photo.original.type || "image/jpeg" }));
  if (photo.processed) fd.set("processed", new File([photo.processed], `processed.${ext(photo.processed)}`, { type: photo.processed.type }));
  if (photo.thumb) fd.set("thumb", new File([photo.thumb], `thumb.${ext(photo.thumb)}`, { type: photo.thumb.type }));
  return fd;
}

function ext(blob: Blob) {
  return blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
}

interface PhotoCaptureProps {
  /**
   * Deferred mode (create form): accepted photos are reported through `onChange` and
   * uploaded by the parent after the product is saved.
   * Immediate mode (edit/detail): `onAccept` uploads right away and the draft is removed.
   */
  onChange?: (accepted: AcceptedPhoto[], processing: number) => void;
  onAccept?: (photo: AcceptedPhoto) => Promise<boolean>;
  disabled?: boolean;
  className?: string;
}

export function PhotoCapture({ onChange, onAccept, disabled, className }: PhotoCaptureProps) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const accepted = drafts.map(acceptedFromDraft).filter((p): p is AcceptedPhoto => p !== null);
    const processing = drafts.filter((d) => d.status === "processing").length;
    onChangeRef.current?.(accepted, processing);
  }, [drafts]);

  const update = useCallback((id: string, patch: Partial<PhotoDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const process = useCallback(
    async (id: string, original: Blob) => {
      try {
        const transparent = await removeBackgroundWithTimeout(original, (p) => {
          update(id, {
            stage: p.stage === "download" ? "Descargando el modelo (solo la primera vez)" : "Recortando el fondo",
            percent: p.percent,
          });
        });
        update(id, { stage: "Centrando sobre fondo blanco", percent: 100 });
        const { processed, thumb } = await compositeOnWhite(transparent);
        update(id, { status: "processed", processed, thumb, processedUrl: URL.createObjectURL(processed), stage: "Listo", percent: 100, error: null });
      } catch (err) {
        const timedOut = err instanceof Error && err.message === "timeout";
        update(id, {
          status: "original_only",
          stage: "",
          error: timedOut ? "El recorte tardó más de un minuto; puedes conservar la original." : "No se pudo recortar el fondo; puedes conservar la original.",
        });
      }
    },
    [update],
  );

  const handleFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      for (const file of Array.from(list)) {
        let original: Blob;
        try {
          original = await downscaleImage(file);
        } catch {
          toast.error(`No se pudo leer la imagen ${file.name}`);
          continue;
        }
        const id = crypto.randomUUID();
        const thumbOriginal = await makeThumb(original).catch(() => null);
        setDrafts((prev) => [
          ...prev,
          {
            id,
            original,
            processed: null,
            thumb: thumbOriginal,
            thumbOriginal,
            status: "processing",
            stage: "Preparando",
            percent: 0,
            choice: null,
            originalUrl: URL.createObjectURL(original),
            processedUrl: null,
            error: null,
            uploading: false,
          },
        ]);
        void process(id, original);
      }
    },
    [process],
  );

  const remove = useCallback((id: string) => {
    setDrafts((prev) => {
      const d = prev.find((x) => x.id === id);
      if (d) {
        URL.revokeObjectURL(d.originalUrl);
        if (d.processedUrl) URL.revokeObjectURL(d.processedUrl);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const accept = useCallback(
    async (id: string, choice: PhotoChoice) => {
      const draft = drafts.find((d) => d.id === id);
      if (!draft) return;
      const next = { ...draft, choice };
      if (!onAccept) {
        update(id, { choice });
        return;
      }
      const photo = acceptedFromDraft(next);
      if (!photo) return;
      update(id, { uploading: true });
      const ok = await onAccept(photo);
      if (ok) remove(id);
      else update(id, { uploading: false });
    },
    [drafts, onAccept, remove, update],
  );

  const pending = drafts.filter((d) => d.choice === null);
  const accepted = drafts.filter((d) => d.choice !== null);

  return (
    <div className={cn("space-y-4", className)}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void handleFiles(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void handleFiles(e.target.files).then(() => (e.target.value = ""))} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="lg" className="h-12 flex-1 sm:flex-none" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          <Camera /> Tomar foto
        </Button>
        <Button type="button" size="lg" variant="outline" className="h-12 flex-1 sm:flex-none" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <ImageIcon /> Elegir de la galería
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Fondo claro y luz pareja mejoran el recorte. La app quita el fondo aquí mismo, en tu dispositivo; la primera vez descarga el modelo (unos 40 MB).
      </p>

      {pending.map((d) => (
        <div key={d.id} className="rounded-xl border p-3">
          <div className="grid grid-cols-2 gap-3">
            <figure className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.originalUrl} alt="Foto original" className="aspect-square w-full rounded-lg border bg-white object-contain" />
              <figcaption className="text-muted-foreground text-center text-xs">Original</figcaption>
            </figure>
            <figure className="space-y-1">
              {d.processedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.processedUrl} alt="Foto con fondo blanco" className="aspect-square w-full rounded-lg border bg-white object-contain" />
              ) : (
                <div className="bg-muted/40 flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center">
                  {d.status === "processing" ? (
                    <>
                      <Progress value={d.percent} className="w-full" />
                      <span className="text-muted-foreground text-xs">
                        {d.stage} {d.percent > 0 ? `${d.percent} %` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">{d.error ?? "Sin versión mejorada"}</span>
                  )}
                </div>
              )}
              <figcaption className="text-muted-foreground text-center text-xs">Mejorada</figcaption>
            </figure>
          </div>
          {d.error && d.status !== "processing" ? <p className="text-destructive mt-2 text-xs">{d.error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="lg" disabled={d.status !== "processed" || d.uploading || disabled} onClick={() => void accept(d.id, "processed")}>
              <Check /> {d.uploading ? "Subiendo..." : "Usar mejorada"}
            </Button>
            <Button type="button" size="lg" variant="outline" disabled={d.uploading || disabled || d.status === "processing"} onClick={() => void accept(d.id, "original")}>
              <Upload /> Conservar original
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              disabled={d.uploading || disabled}
              onClick={() => {
                remove(d.id);
                cameraRef.current?.click();
              }}
            >
              <RotateCcw /> Repetir
            </Button>
            <Button type="button" size="lg" variant="ghost" className="ml-auto" disabled={d.uploading || disabled} onClick={() => remove(d.id)} aria-label="Quitar foto">
              <X />
            </Button>
          </div>
        </div>
      ))}

      {accepted.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos listas para guardar ({accepted.length})</p>
          <div className="flex flex-wrap gap-3">
            {accepted.map((d, index) => (
              <div key={d.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.choice === "processed" && d.processedUrl ? d.processedUrl : d.originalUrl}
                  alt={`Foto ${index + 1}`}
                  className="size-24 rounded-lg border bg-white object-contain"
                />
                {index === 0 ? <Badge className="absolute top-1 left-1">Principal</Badge> : null}
                <button
                  type="button"
                  aria-label="Quitar foto"
                  className="bg-background/90 absolute -top-2 -right-2 rounded-full border p-1 shadow-sm"
                  disabled={disabled}
                  onClick={() => remove(d.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
