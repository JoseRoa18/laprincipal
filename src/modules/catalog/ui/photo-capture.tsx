"use client";

import { Camera, Check, ImageIcon, RotateCcw, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { enhanceDraftPhotoWithAiAction } from "@/app/(app)/productos/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "cn";
import { base64ToBlob, compositeOnWhite, downscaleImage, makeThumb, removeBackgroundWithTimeout } from "./photo-pipeline";

const COARSE_POINTER = "(pointer: coarse)";
function subscribeCoarse(cb: () => void) {
  const mql = window.matchMedia(COARSE_POINTER);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
/** True on phones and tablets (touch), where the camera capture input opens the camera. */
function useHasCamera() {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE_POINTER).matches, () => true);
}

export const AI_WARNING = "La IA puede alterar detalles; revisa que el repuesto sea idéntico.";
export const AI_BUSY_LABEL = "Generando foto de catálogo…";

export type PhotoChoice = "processed" | "original" | "ai";

export interface AiDraft {
  processed: Blob;
  thumb: Blob;
  url: string;
}

export interface PhotoDraft {
  id: string;
  original: Blob;
  /** Transparent cut-out (PNG), kept to re-composite quickly when the shadow toggle changes. */
  cutout: Blob | null;
  processed: Blob | null;
  /** Thumbnail of the chosen version (original until the cut-out is ready). */
  thumb: Blob | null;
  thumbOriginal: Blob | null;
  status: "processing" | "processed" | "original_only";
  stage: string;
  percent: number;
  /** Contact shadow under the part (studio finish option). */
  shadow: boolean;
  /** Set once the user accepts the photo. */
  choice: PhotoChoice | null;
  originalUrl: string;
  processedUrl: string | null;
  /** "Estilo catálogo con IA" result waiting for the user's decision. */
  ai: AiDraft | null;
  aiBusy: boolean;
  error: string | null;
  uploading: boolean;
}

export interface AcceptedPhoto {
  id: string;
  original: Blob;
  /** Browser cut-out with the studio finish (kept even when the AI version is chosen, to allow "Volver al recorte"). */
  processed: Blob | null;
  thumb: Blob | null;
  ai: Blob | null;
  aiThumb: Blob | null;
  choice: PhotoChoice;
}

export function acceptedFromDraft(d: PhotoDraft): AcceptedPhoto | null {
  if (!d.choice) return null;
  const hasCutout = Boolean(d.processed);
  const useAi = d.choice === "ai" && d.ai !== null;
  const useCutout = useAi ? hasCutout : d.choice === "processed" && hasCutout;
  return {
    id: d.id,
    original: d.original,
    processed: useCutout ? d.processed : null,
    thumb: useCutout ? d.thumb : d.thumbOriginal,
    ai: useAi ? d.ai!.processed : null,
    aiThumb: useAi ? d.ai!.thumb : null,
    choice: useAi ? "ai" : useCutout ? "processed" : "original",
  };
}

/** Build the FormData expected by uploadProductPhotoAction. */
export function photoFormData(productId: string, photo: AcceptedPhoto): FormData {
  const fd = new FormData();
  fd.set("productId", productId);
  fd.set("status", photo.processed ? "processed" : "original_only");
  fd.set("choice", photo.choice);
  fd.set("original", new File([photo.original], "original.jpg", { type: photo.original.type || "image/jpeg" }));
  if (photo.processed) fd.set("processed", new File([photo.processed], `processed.${ext(photo.processed)}`, { type: photo.processed.type }));
  if (photo.thumb) fd.set("thumb", new File([photo.thumb], `thumb.${ext(photo.thumb)}`, { type: photo.thumb.type }));
  if (photo.ai) {
    fd.set("ai", new File([photo.ai], `ai.${ext(photo.ai)}`, { type: photo.ai.type }));
    if (photo.aiThumb) fd.set("aiThumb", new File([photo.aiThumb], `ai-thumb.${ext(photo.aiThumb)}`, { type: photo.aiThumb.type }));
  }
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
  /** Server has GEMINI_API_KEY: shows "Estilo catálogo con IA". */
  aiEnabled?: boolean;
  disabled?: boolean;
  className?: string;
}

export function PhotoCapture({ onChange, onAccept, aiEnabled = false, disabled, className }: PhotoCaptureProps) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const draftsRef = useRef(drafts);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    draftsRef.current = drafts;
    const accepted = drafts.map(acceptedFromDraft).filter((p): p is AcceptedPhoto => p !== null);
    const processing = drafts.filter((d) => d.status === "processing").length;
    onChangeRef.current?.(accepted, processing);
  }, [drafts]);

  const update = useCallback((id: string, patch: Partial<PhotoDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  /** Compose the cut-out on white with the studio finish; replaces the previous processed version. */
  const compose = useCallback(
    async (id: string, cutout: Blob, shadow: boolean) => {
      const { processed, thumb } = await compositeOnWhite(cutout, { shadow });
      const previousUrl = draftsRef.current.find((d) => d.id === id)?.processedUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      update(id, { status: "processed", processed, thumb, processedUrl: URL.createObjectURL(processed), stage: "Listo", percent: 100, error: null });
    },
    [update],
  );

  const process = useCallback(
    async (id: string, original: Blob) => {
      try {
        const cutout = await removeBackgroundWithTimeout(original, (p) => {
          update(id, {
            stage: p.stage === "download" ? "Descargando el modelo (solo la primera vez)" : "Recortando el fondo",
            percent: p.percent,
          });
        });
        update(id, { cutout, stage: "Acabado de estudio", percent: 100 });
        await compose(id, cutout, true);
      } catch (err) {
        const timedOut = err instanceof Error && err.message === "timeout";
        update(id, {
          status: "original_only",
          stage: "",
          error: timedOut ? "El recorte tardó más de un minuto; puedes conservar la original." : "No se pudo recortar el fondo; puedes conservar la original.",
        });
      }
    },
    [compose, update],
  );

  const toggleShadow = useCallback(
    async (id: string, shadow: boolean) => {
      const draft = draftsRef.current.find((d) => d.id === id);
      if (!draft?.cutout) return;
      update(id, { shadow, status: "processing", stage: shadow ? "Agregando la sombra" : "Quitando la sombra", percent: 100 });
      try {
        await compose(id, draft.cutout, shadow);
      } catch {
        update(id, { status: "processed", stage: "Listo" });
        toast.error("No se pudo volver a componer la foto.");
      }
    },
    [compose, update],
  );

  const enhanceWithAi = useCallback(
    async (id: string) => {
      const draft = draftsRef.current.find((d) => d.id === id);
      if (!draft) return;
      update(id, { aiBusy: true });
      const fd = new FormData();
      fd.set("original", new File([draft.original], "original.jpg", { type: draft.original.type || "image/jpeg" }));
      const res = await enhanceDraftPhotoWithAiAction(fd);
      if (!res.ok) {
        toast.error(res.error.message);
        update(id, { aiBusy: false });
        return;
      }
      const processed = base64ToBlob(res.data.processed.base64, res.data.processed.contentType);
      const thumb = base64ToBlob(res.data.thumb.base64, res.data.thumb.contentType);
      update(id, { aiBusy: false, ai: { processed, thumb, url: URL.createObjectURL(processed) } });
    },
    [update],
  );

  const discardAi = useCallback(
    (id: string) => {
      const draft = draftsRef.current.find((d) => d.id === id);
      if (draft?.ai) URL.revokeObjectURL(draft.ai.url);
      update(id, { ai: null });
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
            cutout: null,
            processed: null,
            thumb: thumbOriginal,
            thumbOriginal,
            status: "processing",
            stage: "Preparando",
            percent: 0,
            shadow: true,
            choice: null,
            originalUrl: URL.createObjectURL(original),
            processedUrl: null,
            ai: null,
            aiBusy: false,
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
        if (d.ai) URL.revokeObjectURL(d.ai.url);
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

  const hasCamera = useHasCamera();
  return (
    <div className={cn("space-y-4", className)}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void handleFiles(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void handleFiles(e.target.files).then(() => (e.target.value = ""))} />

      <div className="flex flex-col gap-2 sm:flex-row">
        {hasCamera ? (
          <>
            <Button type="button" size="lg" className="h-12 flex-1 sm:flex-none" disabled={disabled} onClick={() => cameraRef.current?.click()}>
              <Camera /> Tomar foto
            </Button>
            <Button type="button" size="lg" variant="outline" className="h-12 flex-1 sm:flex-none" disabled={disabled} onClick={() => fileRef.current?.click()}>
              <ImageIcon /> Elegir de la galería
            </Button>
          </>
        ) : (
          <Button type="button" size="lg" className="h-12 flex-1 sm:flex-none" disabled={disabled} onClick={() => fileRef.current?.click()}>
            <ImageIcon /> Subir foto desde la PC
          </Button>
        )}
      </div>
      {!hasCamera ? (
        <p className="text-muted-foreground text-xs">Desde el celular puedes tomar la foto directamente con la cámara.</p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Fondo claro y luz pareja mejoran el recorte. La app quita el fondo y aplica un acabado de estudio aquí mismo, en tu dispositivo; la primera vez descarga el modelo
        (unos 40 MB).
      </p>

      {pending.map((d) => (
        <div key={d.id} className="rounded-xl border p-3">
          {d.ai ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.processedUrl ?? d.originalUrl} alt="Foto actual" className="aspect-square w-full rounded-lg border bg-white object-contain" />
                  <figcaption className="text-muted-foreground text-center text-xs">{d.processedUrl ? "Recorte" : "Original"}</figcaption>
                </figure>
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.ai.url} alt="Foto de catálogo generada con IA" className="aspect-square w-full rounded-lg border bg-white object-contain" />
                  <figcaption className="text-muted-foreground text-center text-xs">Con IA</figcaption>
                </figure>
              </div>
              <p className="mt-2 text-xs text-amber-700">{AI_WARNING}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="lg" disabled={d.uploading || disabled} onClick={() => void accept(d.id, "ai")}>
                  <Check /> {d.uploading ? "Subiendo..." : "Usar esta"}
                </Button>
                <Button type="button" size="lg" variant="outline" disabled={d.uploading || disabled} onClick={() => discardAi(d.id)}>
                  <Undo2 /> Conservar la anterior
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.originalUrl} alt="Foto original" className="aspect-square w-full rounded-lg border bg-white object-contain" />
                  <figcaption className="text-muted-foreground text-center text-xs">Original</figcaption>
                </figure>
                <figure className="space-y-1">
                  {d.processedUrl && d.status !== "processing" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.processedUrl} alt="Foto con fondo blanco y acabado de estudio" className="aspect-square w-full rounded-lg border bg-white object-contain" />
                  ) : (
                    <div className="bg-muted/40 flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center">
                      {d.status === "processing" ? (
                        <>
                          <Progress value={d.percent} className="w-full" />
                          <span className="text-muted-foreground text-xs">
                            {d.stage} {d.percent > 0 && d.percent < 100 ? `${d.percent} %` : ""}
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
              {d.cutout ? (
                <div className="mt-3 flex items-center gap-2">
                  <Switch id={`shadow-${d.id}`} size="sm" checked={d.shadow} disabled={d.status === "processing" || d.uploading || disabled} onCheckedChange={(checked) => void toggleShadow(d.id, Boolean(checked))} />
                  <Label htmlFor={`shadow-${d.id}`} className="font-normal">
                    Sombra suave bajo la pieza
                  </Label>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="lg" disabled={d.status !== "processed" || d.uploading || d.aiBusy || disabled} onClick={() => void accept(d.id, "processed")}>
                  <Check /> {d.uploading ? "Subiendo..." : "Usar mejorada"}
                </Button>
                <Button type="button" size="lg" variant="outline" disabled={d.uploading || d.aiBusy || disabled || d.status === "processing"} onClick={() => void accept(d.id, "original")}>
                  <Upload /> Conservar original
                </Button>
                {aiEnabled ? (
                  <Button type="button" size="lg" variant="secondary" disabled={d.status === "processing" || d.uploading || d.aiBusy || disabled} onClick={() => void enhanceWithAi(d.id)}>
                    {d.aiBusy ? <Spinner /> : <WandSparkles />} {d.aiBusy ? AI_BUSY_LABEL : "Estilo catálogo con IA"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  disabled={d.uploading || d.aiBusy || disabled}
                  onClick={() => {
                    remove(d.id);
                    cameraRef.current?.click();
                  }}
                >
                  <RotateCcw /> Repetir
                </Button>
                <Button type="button" size="lg" variant="ghost" className="ml-auto" disabled={d.uploading || d.aiBusy || disabled} onClick={() => remove(d.id)} aria-label="Quitar foto">
                  <X />
                </Button>
              </div>
              {d.aiBusy ? <p className="text-muted-foreground mt-2 text-xs">Suele tardar entre 10 y 20 segundos.</p> : null}
            </>
          )}
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
                  src={d.choice === "ai" && d.ai ? d.ai.url : d.choice === "processed" && d.processedUrl ? d.processedUrl : d.originalUrl}
                  alt={`Foto ${index + 1}`}
                  className="size-24 rounded-lg border bg-white object-contain"
                />
                {index === 0 ? <Badge className="absolute top-1 left-1">Principal</Badge> : null}
                {d.choice === "ai" ? <Badge variant="secondary" className="absolute bottom-1 left-1">IA</Badge> : null}
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
