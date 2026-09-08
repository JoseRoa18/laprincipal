"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveCompanyAction } from "@/app/(app)/configuracion/empresa/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { companyFormSchema, type CompanyFormInput } from "@/modules/settings/domain/forms";

const MAX_SIDE = 600;

/** Downscale to MAX_SIDE px and encode as WebP (PNG when the browser cannot encode WebP). */
async function resizeLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.9);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

export function CompanyForm({ defaultValues, logoUrl }: { defaultValues: CompanyFormInput; logoUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CompanyFormInput>({ resolver: zodResolver(companyFormSchema), defaultValues });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elige una imagen (PNG, JPG o WebP).");
      return;
    }
    try {
      const dataUrl = await resizeLogo(file);
      setLogoDataUrl(dataUrl);
      setPreview(dataUrl);
      setRemoveLogo(false);
    } catch {
      toast.error("No se pudo procesar la imagen.");
    }
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await saveCompanyAction({ ...data, logoDataUrl, removeLogo });
      if (result.ok) {
        toast.success("Datos de la empresa guardados");
        setLogoDataUrl(undefined);
        setRemoveLogo(false);
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="bg-muted flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo de la empresa" className="size-full object-contain" />
          ) : (
            <span className="text-muted-foreground text-xs">Sin logo</span>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Logo</p>
          <p className="text-muted-foreground text-sm">Se reduce a 600 px y se usa en tickets y cotizaciones. PNG con fondo transparente funciona mejor.</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageUp />
              {preview ? "Cambiar logo" : "Subir logo"}
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setLogoDataUrl(undefined);
                  setRemoveLogo(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X />
                Quitar
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Field data-invalid={Boolean(errors.name) || undefined}>
        <FieldLabel htmlFor="name">Nombre de la empresa</FieldLabel>
        <Input id="name" aria-invalid={Boolean(errors.name)} {...register("name")} />
        <FieldError errors={[errors.name]} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.taxId) || undefined}>
          <FieldLabel htmlFor="taxId">RIF</FieldLabel>
          <Input id="taxId" placeholder="J-12345678-9" {...register("taxId")} />
          <FieldError errors={[errors.taxId]} />
        </Field>
        <Field data-invalid={Boolean(errors.phone) || undefined}>
          <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
          <Input id="phone" type="tel" placeholder="0412-1234567" {...register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>
      </div>

      <Field data-invalid={Boolean(errors.email) || undefined}>
        <FieldLabel htmlFor="email">Correo</FieldLabel>
        <Input id="email" type="email" placeholder="ventas@empresa.com" aria-invalid={Boolean(errors.email)} {...register("email")} />
        <FieldError errors={[errors.email]} />
      </Field>

      <Field data-invalid={Boolean(errors.address) || undefined}>
        <FieldLabel htmlFor="address">Dirección</FieldLabel>
        <Textarea id="address" rows={2} {...register("address")} />
        <FieldDescription>Aparece en el encabezado de tickets y notas de entrega.</FieldDescription>
        <FieldError errors={[errors.address]} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
