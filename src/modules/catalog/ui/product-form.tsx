"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { createProductAction, updateProductAction, uploadProductPhotoAction } from "@/app/(app)/productos/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPct, parseLocalizedNumber } from "@/lib/format";
import { priceMargin, suggestTechPrice } from "../domain/pricing";
import { APPLIANCE_TYPES, NEW_BRAND_OPTION, emptyProductForm, productFormSchema, type ProductFormValues } from "../domain/product-schema";
import type { ProductFormOptions } from "../infrastructure/catalog-options";
import { controlClass, FormField, selectWrapperClass } from "./form-field";
import { PhotoCapture, photoFormData, type AcceptedPhoto } from "./photo-capture";

export interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initialValues: ProductFormValues;
  options: ProductFormOptions;
  canViewCosts: boolean;
}

const fmtMoney = (d: { toFixed: (n: number) => string; isZero: () => boolean }) => (d.isZero() ? "" : d.toFixed(2).replace(".", ","));

export function ProductForm({ mode, productId, initialValues, options, canViewCosts }: ProductFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [photos, setPhotos] = useState<AcceptedPhoto[]>([]);
  const [processingPhotos, setProcessingPhotos] = useState(0);
  const [photoKey, setPhotoKey] = useState(0);
  const pct = options.techPriceMarkdownPct;
  const [techEdited, setTechEdited] = useState(
    () => mode === "edit" && initialValues.techPriceUsd !== "" && initialValues.techPriceUsd !== fmtMoney(suggestTechPrice(parseLocalizedNumber(initialValues.publicPriceUsd) ?? "", pct)),
  );

  const form = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: initialValues, mode: "onBlur" });
  const { register, control, handleSubmit, setValue, setError, reset, formState } = form;
  const { errors } = formState;
  const equivalences = useFieldArray({ control, name: "equivalences" });
  const compatibilities = useFieldArray({ control, name: "compatibilities" });

  const publicPrice = useWatch({ control, name: "publicPriceUsd" });
  const techPrice = useWatch({ control, name: "techPriceUsd" });
  const cost = useWatch({ control, name: "costUsd" });
  const brandId = useWatch({ control, name: "brandId" });
  const isActive = useWatch({ control, name: "isActive" });
  const skipNextTechSync = useRef(false);

  useEffect(() => {
    if (techEdited) return;
    if (skipNextTechSync.current) {
      skipNextTechSync.current = false;
      return;
    }
    const suggested = suggestTechPrice(parseLocalizedNumber(publicPrice) ?? "", pct);
    setValue("techPriceUsd", fmtMoney(suggested), { shouldValidate: false });
  }, [publicPrice, techEdited, pct, setValue]);

  const margin = priceMargin(parseLocalizedNumber(publicPrice) ?? "", parseLocalizedNumber(cost) ?? "");
  const techMargin = priceMargin(parseLocalizedNumber(techPrice) ?? "", parseLocalizedNumber(cost) ?? "");
  const parents = options.categories.filter((c) => c.depth === 0);

  function applyFieldErrors(fields?: Record<string, unknown>) {
    if (!fields) return;
    for (const [key, message] of Object.entries(fields)) {
      setError(key as FieldPath<ProductFormValues>, { type: "server", message: String(message) });
    }
  }

  async function uploadPhotos(id: string): Promise<number> {
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      setUploadStatus(`Subiendo foto ${i + 1} de ${photos.length}...`);
      const res = await uploadProductPhotoAction(photoFormData(id, photos[i]));
      if (!res.ok) {
        failed++;
        toast.error(`Foto ${i + 1}: ${res.error.message}`);
      }
    }
    setUploadStatus(null);
    return failed;
  }

  const submit = (andNew: boolean) =>
    handleSubmit(async (values) => {
      if (processingPhotos > 0) {
        toast.error("Espera a que terminen de procesarse las fotos.");
        return;
      }
      setBusy(true);
      try {
        if (mode === "create") {
          const res = await createProductAction(values);
          if (!res.ok) {
            applyFieldErrors(res.error.details?.fields as Record<string, unknown> | undefined);
            toast.error(res.error.message);
            return;
          }
          const failed = await uploadPhotos(res.data.id);
          toast.success(failed > 0 ? `Producto ${res.data.sku} guardado, pero ${failed} foto(s) no se subieron.` : `Producto ${res.data.sku} guardado`);
          if (andNew) {
            const blank = emptyProductForm({ unitId: values.unitId, taxId: values.taxId });
            skipNextTechSync.current = false;
            reset({ ...blank, categoryId: values.categoryId, brandId: values.brandId === NEW_BRAND_OPTION ? "" : values.brandId });
            setTechEdited(false);
            setPhotos([]);
            setPhotoKey((k) => k + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            router.push(`/productos/${res.data.id}`);
          }
        } else {
          const res = await updateProductAction(productId!, values);
          if (!res.ok) {
            applyFieldErrors(res.error.details?.fields as Record<string, unknown> | undefined);
            toast.error(res.error.message);
            return;
          }
          toast.success("Cambios guardados");
          router.push(`/productos/${productId}`);
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    });

  const err = (path: string) => {
    const parts = path.split(".");
    let cursor: unknown = errors;
    for (const p of parts) {
      if (!cursor || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[p];
    }
    return cursor && typeof cursor === "object" && "message" in cursor ? String((cursor as { message?: unknown }).message ?? "") : undefined;
  };

  return (
    <form onSubmit={submit(false)} className="space-y-4 pb-24 md:pb-6" noValidate>
      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Foto</CardTitle>
            <CardDescription>Toma la foto con el celular; la app la deja con fondo blanco. Puedes agregar varias; la primera será la principal.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoCapture key={photoKey} disabled={busy} onChange={(accepted, processing) => { setPhotos(accepted); setProcessingPhotos(processing); }} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "2. Datos básicos" : "Datos básicos"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FormField label="Nombre" htmlFor="name" required error={err("name")} className="md:col-span-2">
            <Input id="name" autoFocus={mode === "create"} placeholder="Ej.: Compresor Embraco 1/3 HP R134a" className={controlClass} {...register("name")} />
          </FormField>
          <FormField label="Número de parte" htmlFor="partNumber" error={err("partNumber")} hint="Código del fabricante, tal como viene en la pieza">
            <Input id="partNumber" placeholder="Ej.: FFI12HBX" className={controlClass} {...register("partNumber")} />
          </FormField>
          <FormField label="Categoría" htmlFor="categoryId" error={err("categoryId")}>
            <NativeSelect id="categoryId" className={selectWrapperClass} {...register("categoryId")}>
              <NativeSelectOption value="">Sin categoría</NativeSelectOption>
              {parents.map((parent) => {
                const children = options.categories.filter((c) => c.depth > 0 && c.label.startsWith(`${parent.label} > `));
                return (
                  <NativeSelectOptGroup key={parent.id} label={parent.name}>
                    <NativeSelectOption value={parent.id}>{parent.name} (general)</NativeSelectOption>
                    {children.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.label.slice(parent.label.length + 3)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                );
              })}
            </NativeSelect>
          </FormField>
          <FormField label="Marca" htmlFor="brandId" error={err("brandId")}>
            <NativeSelect id="brandId" className={selectWrapperClass} {...register("brandId")}>
              <NativeSelectOption value="">Sin marca</NativeSelectOption>
              {options.brands.map((b) => (
                <NativeSelectOption key={b.id} value={b.id}>
                  {b.name}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={NEW_BRAND_OPTION}>+ Nueva marca...</NativeSelectOption>
            </NativeSelect>
          </FormField>
          {brandId === NEW_BRAND_OPTION ? (
            <FormField label="Nombre de la nueva marca" htmlFor="newBrandName" required error={err("newBrandName")}>
              <Input id="newBrandName" placeholder="Ej.: Danfoss" className={controlClass} {...register("newBrandName")} />
            </FormField>
          ) : null}
          <FormField label="Unidad" htmlFor="unitId" required error={err("unitId")}>
            <NativeSelect id="unitId" className={selectWrapperClass} {...register("unitId")}>
              {options.units.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name} ({u.symbol})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>

          <div className="md:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              {showMore ? <ChevronUp /> : <ChevronDown />} {showMore ? "Menos opciones" : "Más opciones"}
            </Button>
          </div>
          {showMore ? (
            <>
              <FormField label="Descripción" htmlFor="description" error={err("description")} className="md:col-span-2">
                <Textarea id="description" rows={3} placeholder="Detalles útiles para el mostrador" {...register("description")} />
              </FormField>
              <FormField label="SKU (código interno)" htmlFor="sku" error={err("sku")} hint={mode === "create" ? "Déjalo vacío para generar LP-000001, LP-000002..." : "Cambiarlo afecta etiquetas ya impresas"}>
                <Input id="sku" placeholder="Automático" className={`${controlClass} uppercase`} {...register("sku")} />
              </FormField>
              <FormField label="Garantía (días)" htmlFor="warrantyDays" error={err("warrantyDays")}>
                <Input id="warrantyDays" inputMode="numeric" placeholder="0" className={controlClass} {...register("warrantyDays")} />
              </FormField>
              <FormField label="Impuesto" htmlFor="taxId" required error={err("taxId")}>
                <NativeSelect id="taxId" className={selectWrapperClass} {...register("taxId")}>
                  {options.taxes.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      {t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              {mode === "edit" ? (
                <div className="flex items-center gap-3 self-end pb-2">
                  <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => <Switch id="isActive" checked={field.value} onCheckedChange={(checked) => field.onChange(checked)} />}
                  />
                  <label htmlFor="isActive" className="text-sm font-medium">
                    {isActive ? "Producto activo" : "Producto inactivo (no se vende)"}
                  </label>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "3. Compatibilidades y equivalencias" : "Compatibilidades y equivalencias"}</CardTitle>
          <CardDescription>Con qué aparatos funciona este repuesto y con qué otros códigos se conoce. Todo esto se puede buscar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Compatible con</p>
            <datalist id="appliance-types">
              {APPLIANCE_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {compatibilities.fields.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <div>
                  <Input list="appliance-types" placeholder="Tipo (Nevera)" aria-label="Tipo de aparato" className={controlClass} {...register(`compatibilities.${index}.applianceType`)} />
                </div>
                <div>
                  <Input placeholder="Marca (Mabe)" aria-label="Marca del aparato" className={controlClass} {...register(`compatibilities.${index}.brand`)} />
                </div>
                <div>
                  <Input placeholder="Modelo (RMS400)" aria-label="Modelo del aparato" className={controlClass} {...register(`compatibilities.${index}.model`)} />
                  {err(`compatibilities.${index}.model`) ? <p className="text-destructive mt-1 text-xs">{err(`compatibilities.${index}.model`)}</p> : null}
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-11 md:size-10" aria-label="Quitar compatibilidad" onClick={() => compatibilities.remove(index)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="lg" onClick={() => compatibilities.append({ applianceType: "", brand: "", model: "" })}>
              <Plus /> Agregar compatibilidad
            </Button>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Códigos equivalentes</p>
            {equivalences.fields.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <div>
                  <Input placeholder="Código (FFI12HBX)" aria-label="Código equivalente" className={controlClass} {...register(`equivalences.${index}.code`)} />
                  {err(`equivalences.${index}.code`) ? <p className="text-destructive mt-1 text-xs">{err(`equivalences.${index}.code`)}</p> : null}
                </div>
                <div>
                  <Input placeholder="Marca (opcional)" aria-label="Marca del código equivalente" className={controlClass} {...register(`equivalences.${index}.brand`)} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-11 md:size-10" aria-label="Quitar equivalencia" onClick={() => equivalences.remove(index)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="lg" onClick={() => equivalences.append({ code: "", brand: "" })}>
              <Plus /> Agregar equivalencia
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "4. Precios y costo" : "Precios y costo"}</CardTitle>
          <CardDescription>Precios en dólares con IVA incluido. Bs y COP se calculan con la tasa del día.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <FormField label="Precio público (USD)" htmlFor="publicPriceUsd" required error={err("publicPriceUsd")}>
            <Input id="publicPriceUsd" inputMode="decimal" placeholder="0,00" className={controlClass} {...register("publicPriceUsd")} />
          </FormField>
          <FormField
            label="Precio técnico (USD)"
            htmlFor="techPriceUsd"
            error={err("techPriceUsd")}
            hint={techEdited ? "Editado a mano" : `Sugerido: público menos ${pct} %`}
          >
            <Input
              id="techPriceUsd"
              inputMode="decimal"
              placeholder="0,00"
              className={controlClass}
              {...register("techPriceUsd", {
                onChange: () => setTechEdited(true),
              })}
            />
            {techEdited ? (
              <button type="button" className="text-primary text-xs underline" onClick={() => setTechEdited(false)}>
                Volver a la sugerencia
              </button>
            ) : null}
          </FormField>
          {canViewCosts ? (
            <FormField
              label="Costo (USD)"
              htmlFor="costUsd"
              error={err("costUsd")}
              hint={
                margin.marginPct
                  ? `Margen público ${formatPct(margin.marginPct)}${techMargin.marginPct ? ` · técnico ${formatPct(techMargin.marginPct)}` : ""}`
                  : "Costo unitario para calcular el margen"
              }
            >
              <Input id="costUsd" inputMode="decimal" placeholder="0,00" className={controlClass} {...register("costUsd")} />
            </FormField>
          ) : null}
          {margin.belowCost || techMargin.belowCost ? (
            <Alert variant="destructive" className="md:col-span-3">
              <TriangleAlert />
              <AlertTitle>Precio por debajo del costo</AlertTitle>
              <AlertDescription>{margin.belowCost ? "El precio público" : "El precio técnico"} es menor que el costo. Revisa antes de guardar.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "5. Stock y ubicación" : "Stock y ubicación"}</CardTitle>
          {mode === "edit" ? <CardDescription>Para cambiar existencias usa Inventario → Ajustes; aquí solo se editan mínimos, máximos y ubicación.</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          {mode === "create" ? (
            <FormField label="Stock inicial" htmlFor="initialStock" error={err("initialStock")} hint="Genera el movimiento de inventario inicial">
              <Input id="initialStock" inputMode="decimal" placeholder="0" className={controlClass} {...register("initialStock")} />
            </FormField>
          ) : null}
          <FormField label="Mínimo" htmlFor="minStock" error={err("minStock")} hint="Avisar cuando quede esto o menos">
            <Input id="minStock" inputMode="decimal" placeholder="0" className={controlClass} {...register("minStock")} />
          </FormField>
          <FormField label="Máximo" htmlFor="maxStock" error={err("maxStock")}>
            <Input id="maxStock" inputMode="decimal" placeholder="0" className={controlClass} {...register("maxStock")} />
          </FormField>
          <FormField label="Ubicación en estante" htmlFor="locationCode" error={err("locationCode")} hint="Ej.: P2-E3-N1">
            <Input id="locationCode" placeholder="P2-E3" className={`${controlClass} uppercase`} {...register("locationCode")} />
          </FormField>
          {mode === "create" ? (
            <>
              <FormField label="Código de barras del fabricante" htmlFor="barcode" error={err("barcode")} hint="Escanea o escribe el código. Si no trae, se genera uno interno." className="md:col-span-2">
                <Input id="barcode" placeholder="Escanea aquí" autoComplete="off" className={controlClass} {...register("barcode")} />
              </FormField>
              <div className="flex items-center gap-3 self-end pb-2 md:col-span-2">
                <Controller
                  control={control}
                  name="generateInternalBarcode"
                  render={({ field }) => <Checkbox id="generateInternalBarcode" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />}
                />
                <label htmlFor="generateInternalBarcode" className="text-sm">
                  Generar código interno si el campo queda vacío
                </label>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-14 z-30 border-t p-3 backdrop-blur md:sticky md:inset-x-auto md:bottom-0 md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {uploadStatus ? <span className="text-muted-foreground mr-auto text-sm">{uploadStatus}</span> : null}
          {processingPhotos > 0 ? <span className="text-muted-foreground mr-auto text-sm">Procesando {processingPhotos} foto(s)...</span> : null}
          {mode === "create" ? (
            <Button type="button" size="lg" variant="outline" className="h-12" disabled={busy} onClick={() => void submit(true)()}>
              Guardar y crear otro
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="h-12 sm:min-w-40" disabled={busy}>
            {busy ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
