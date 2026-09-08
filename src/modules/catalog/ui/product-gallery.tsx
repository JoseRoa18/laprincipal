"use client";

import { Check, ImagePlus, Star, Trash2, Undo2, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyAiPhotoAction, deleteImageAction, enhancePhotoWithAiAction, revertAiPhotoAction, setPrimaryImageAction, uploadProductPhotoAction } from "@/app/(app)/productos/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";
import type { ProductImageView } from "../infrastructure/product-detail";
import { IMAGE_STATUS_LABEL } from "./labels-es";
import { AI_BUSY_LABEL, AI_WARNING, PhotoCapture, photoFormData, type AcceptedPhoto } from "./photo-capture";
import { base64ToBlob } from "./photo-pipeline";
import { ProductThumb } from "./product-thumb";

interface AiPreview {
  imageId: string;
  processed: Blob;
  thumb: Blob;
  url: string;
}

export function ProductGallery({
  productId,
  productName,
  images,
  canEdit,
  aiEnabled = false,
  className,
}: {
  productId: string;
  productName: string;
  images: ProductImageView[];
  canEdit: boolean;
  /** Server has GEMINI_API_KEY: shows "Estilo catálogo con IA". */
  aiEnabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(images.length === 0 && canEdit);
  const [pending, startTransition] = useTransition();
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const selected = images.find((i) => i.id === selectedId) ?? images.find((i) => i.isPrimary) ?? images[0] ?? null;

  async function upload(photo: AcceptedPhoto): Promise<boolean> {
    const res = await uploadProductPhotoAction(photoFormData(productId, photo));
    if (!res.ok) {
      toast.error(res.error.message);
      return false;
    }
    toast.success("Foto guardada");
    router.refresh();
    return true;
  }

  function discardAi() {
    setAiPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function generateAi(imageId: string) {
    setAiBusy(true);
    const res = await enhancePhotoWithAiAction(imageId);
    setAiBusy(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    const processed = base64ToBlob(res.data.processed.base64, res.data.processed.contentType);
    const thumb = base64ToBlob(res.data.thumb.base64, res.data.thumb.contentType);
    setAiPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { imageId, processed, thumb, url: URL.createObjectURL(processed) };
    });
  }

  async function applyAi() {
    if (!aiPreview) return;
    setApplying(true);
    const fd = new FormData();
    fd.set("imageId", aiPreview.imageId);
    fd.set("ai", new File([aiPreview.processed], "ai.webp", { type: aiPreview.processed.type }));
    fd.set("aiThumb", new File([aiPreview.thumb], "ai-thumb.webp", { type: aiPreview.thumb.type }));
    const res = await applyAiPhotoAction(fd);
    setApplying(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Foto de catálogo aplicada");
    discardAi();
    router.refresh();
  }

  const comparing = selected && aiPreview && aiPreview.imageId === selected.id ? aiPreview : null;

  return (
    <div className={cn("space-y-3", className)}>
      {selected ? (
        <div className="space-y-3">
          {comparing ? (
            <div className="space-y-3">
              <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3">
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.url} alt={`${productName} (actual)`} className="aspect-square w-full rounded-xl border bg-white object-contain" />
                  <figcaption className="text-muted-foreground text-center text-xs">Actual</figcaption>
                </figure>
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={comparing.url} alt={`${productName} (catálogo con IA)`} className="aspect-square w-full rounded-xl border bg-white object-contain" />
                  <figcaption className="text-muted-foreground text-center text-xs">Con IA</figcaption>
                </figure>
              </div>
              <p className="text-center text-xs text-amber-700">{AI_WARNING}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="lg" disabled={applying} onClick={() => void applyAi()}>
                  <Check /> {applying ? "Guardando..." : "Usar esta"}
                </Button>
                <Button size="lg" variant="outline" disabled={applying} onClick={discardAi}>
                  <Undo2 /> Conservar la anterior
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mx-auto w-full max-w-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.url} alt={productName} className="aspect-square w-full rounded-xl border bg-white object-contain" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {selected.isAi ? <Badge>Catálogo con IA</Badge> : <Badge variant="secondary">{IMAGE_STATUS_LABEL[selected.status] ?? selected.status}</Badge>}
                {selected.isPrimary ? <Badge>Principal</Badge> : null}
                {selected.status === "processed" ? (
                  <a href={selected.originalUrl} target="_blank" rel="noreferrer" className="text-primary text-xs underline">
                    Ver original
                  </a>
                ) : null}
                {canEdit && !selected.isPrimary ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setPrimaryImageAction(productId, selected.id);
                        if (!res.ok) toast.error(res.error.message);
                        else {
                          toast.success("Foto principal actualizada");
                          router.refresh();
                        }
                      })
                    }
                  >
                    <Star /> Hacer principal
                  </Button>
                ) : null}
                {canEdit && aiEnabled ? (
                  <Button size="sm" variant="secondary" disabled={aiBusy || pending} onClick={() => void generateAi(selected.id)}>
                    {aiBusy ? <Spinner /> : <WandSparkles />} {aiBusy ? AI_BUSY_LABEL : "Estilo catálogo con IA"}
                  </Button>
                ) : null}
                {canEdit && selected.isAi ? (
                  <ConfirmButton
                    title="Volver al recorte"
                    description="Se mostrará otra vez el recorte con fondo blanco hecho en el dispositivo y se borrará la versión generada por IA."
                    confirmLabel="Volver al recorte"
                    size="sm"
                    variant="outline"
                    disabled={aiBusy}
                    action={() => revertAiPhotoAction(selected.id)}
                    successMessage="Recorte restaurado"
                    onSuccess={() => router.refresh()}
                  >
                    <Undo2 /> Volver al recorte
                  </ConfirmButton>
                ) : null}
                {canEdit ? (
                  <ConfirmButton
                    title="Eliminar foto"
                    description="La foto se borrará del producto. Esta acción no se puede deshacer."
                    confirmLabel="Eliminar"
                    destructive
                    size="sm"
                    variant="ghost"
                    action={() => deleteImageAction(productId, selected.id)}
                    successMessage="Foto eliminada"
                    onSuccess={() => {
                      setSelectedId(null);
                      router.refresh();
                    }}
                  >
                    <Trash2 /> Eliminar
                  </ConfirmButton>
                ) : null}
              </div>
              {aiBusy ? <p className="text-muted-foreground text-center text-xs">Suele tardar entre 10 y 20 segundos.</p> : null}
            </>
          )}
          {images.length > 1 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedId(img.id)}
                  className={cn("rounded-md ring-offset-2 focus-visible:ring-2", img.id === selected.id ? "ring-primary ring-2" : "")}
                  aria-label={`Ver foto ${img.sortOrder}`}
                  aria-pressed={img.id === selected.id}
                >
                  <ProductThumb url={img.thumbUrl} alt="" size={64} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="bg-muted/30 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <ProductThumb url={null} alt="" size={72} />
          <p className="text-muted-foreground text-sm">Sin fotos todavía.</p>
        </div>
      )}

      {canEdit ? (
        adding ? (
          <div className="rounded-xl border p-3">
            <PhotoCapture onAccept={upload} aiEnabled={aiEnabled} />
            {images.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(false)}>
                Cerrar
              </Button>
            ) : null}
          </div>
        ) : (
          <Button type="button" variant="outline" size="lg" className="h-11 w-full sm:w-auto" onClick={() => setAdding(true)}>
            <ImagePlus /> Agregar foto
          </Button>
        )
      ) : null}
    </div>
  );
}
