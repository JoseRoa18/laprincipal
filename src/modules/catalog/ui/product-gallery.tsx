"use client";

import { ImagePlus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteImageAction, setPrimaryImageAction, uploadProductPhotoAction } from "@/app/(app)/productos/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { ProductImageView } from "../infrastructure/product-detail";
import { IMAGE_STATUS_LABEL } from "./labels-es";
import { PhotoCapture, photoFormData, type AcceptedPhoto } from "./photo-capture";
import { ProductThumb } from "./product-thumb";

export function ProductGallery({ productId, productName, images, canEdit, className }: { productId: string; productName: string; images: ProductImageView[]; canEdit: boolean; className?: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(images.length === 0 && canEdit);
  const [pending, startTransition] = useTransition();
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

  return (
    <div className={cn("space-y-3", className)}>
      {selected ? (
        <div className="space-y-3">
          <div className="mx-auto w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt={productName} className="aspect-square w-full rounded-xl border bg-white object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary">{IMAGE_STATUS_LABEL[selected.status] ?? selected.status}</Badge>
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
            <PhotoCapture onAccept={upload} />
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
