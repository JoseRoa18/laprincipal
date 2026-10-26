"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, History, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { callAction, callActionWithRetry, toastActionError } from "@/lib/action-client";
import { formatPct, parseLocalizedNumber } from "@/lib/format";
import { priceMargin, suggestTechPrice } from "../domain/pricing";
import { APPLIANCE_TYPES, NEW_BRAND_OPTION, emptyProductForm, productFormSchema, type ProductFormValues } from "../domain/product-schema";
import type { ProductFormOptions } from "../infrastructure/catalog-options";
import { controlClass, FormField, selectWrapperClass } from "./form-field";
import { OwnerPicker } from "./owner-picker";
import { PhotoCapture, photoFormData, type AcceptedPhoto } from "./photo-capture";
import { clearProductDraft, productDraftKey, readDraftPhotos, readProductDraft, writeDraftPhotos, writeProductDraft } from "./product-draft";

export interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  /** Signed-in user: what is being typed is kept on this device under their name. */
  userId: string;
  initialValues: ProductFormValues;
  options: ProductFormOptions;
  canViewCosts: boolean;
  /** Server has GEMINI_API_KEY: shows "Estilo catálogo con IA" in the photo step. */
  aiPhotosEnabled?: boolean;
  /** Edit: the product's category when it is no longer offered, so saving keeps it. */
  inactiveCategory?: { id: string; label: string } | null;
}

const fmtMoney = (d: { toFixed: (n: number) => string; isZero: () => boolean }) => (d.isZero() ? "" : d.toFixed(2).replace(".", ","));

/** "a las 3:45 p. m." today, the date too otherwise. */
function savedWhen(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today ? `a las ${date.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}` : `el ${date.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}`;
}

export function ProductForm({ mode, productId, userId, initialValues, options, canViewCosts, aiPhotosEnabled = false, inactiveCategory = null }: ProductFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [photos, setPhotos] = useState<AcceptedPhoto[]>([]);
  const [processingPhotos, setProcessingPhotos] = useState(0);
  const [photoKey, setPhotoKey] = useState(0);
  /** Photos recovered from the device after a reload; PhotoCapture reads them when it mounts. */
  const [restoredPhotos, setRestoredPhotos] = useState<AcceptedPhoto[]>([]);
  /** When the recovered draft was saved (shows the "we recovered it" notice). */
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  /** New product already saved but some photos did not go up: Guardar now only sends those. */
  const [savedProduct, setSavedProduct] = useState<{ id: string; sku: string } | null>(null);
  const pct = options.techPriceMarkdownPct;
  const techEditedAtStart = () =>
    mode === "edit" && initialValues.techPriceUsd !== "" && initialValues.techPriceUsd !== fmtMoney(suggestTechPrice(parseLocalizedNumber(initialValues.publicPriceUsd) ?? "", pct));
  const [techEdited, setTechEdited] = useState(techEditedAtStart);

  const form = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: initialValues, mode: "onBlur" });
  const { register, control, handleSubmit, setValue, setError, reset, getValues, subscribe, formState } = form;
  const { errors } = formState;
  const equivalences = useFieldArray({ control, name: "equivalences" });
  const compatibilities = useFieldArray({ control, name: "compatibilities" });

  const publicPrice = useWatch({ control, name: "publicPriceUsd" });
  const techPrice = useWatch({ control, name: "techPriceUsd" });
  const cost = useWatch({ control, name: "costUsd" });
  const brandId = useWatch({ control, name: "brandId" });
  const isActive = useWatch({ control, name: "isActive" });
  const skipNextTechSync = useRef(false);
  const lastPublicPrice = useRef(publicPrice);
  // Id for the product being created: a second Guardar after a lost response returns the same product.
  const clientId = useRef<string>(crypto.randomUUID());

  // --- Kept on the device while it is being filled (see product-draft.ts) ---
  const draftKey = productDraftKey(userId, mode === "edit" ? productId : undefined);
  const initialJson = JSON.stringify(initialValues);
  /** The form untouched: as loaded, or blank after "Guardar y crear otro". Nothing is kept while equal. */
  const baselineRef = useRef(initialJson);
  /** Off until the saved draft (if any) has been read, so an empty form does not erase it first. */
  const draftReadyRef = useRef(false);
  const photosRef = useRef<AcceptedPhoto[]>([]);
  /** Photos of the new product already stored (a retry skips them). */
  const uploadedRef = useRef(new Set<string>());
  const extrasRef = useRef({ techEdited, showMore });
  useEffect(() => {
    extrasRef.current = { techEdited, showMore };
  }, [techEdited, showMore]);

  const saveDraft = useCallback(() => {
    if (!draftReadyRef.current) return;
    const values = getValues();
    if (JSON.stringify(values) === baselineRef.current && photosRef.current.length === 0) {
      clearProductDraft(draftKey);
      return;
    }
    writeProductDraft(draftKey, { base: initialJson, clientId: mode === "create" ? clientId.current : null, values, ...extrasRef.current });
  }, [draftKey, getValues, initialJson, mode]);

  // Recover what was being typed before a reload.
  useEffect(() => {
    let cancelled = false;
    const draft = readProductDraft(draftKey);
    // Edit: the draft only applies to the product as it was; if it changed since, it is dropped.
    if (!draft || (mode === "edit" && draft.base !== initialJson)) {
      if (draft) clearProductDraft(draftKey);
      draftReadyRef.current = true;
      return;
    }
    void (mode === "create" ? readDraftPhotos(draftKey) : Promise.resolve([])).then((saved) => {
      if (cancelled) return;
      // Fields added to the form after the draft was saved take their default.
      const values: ProductFormValues = { ...initialValues, ...draft.values };
      draftReadyRef.current = true;
      if (JSON.stringify(values) === initialJson && saved.length === 0) {
        clearProductDraft(draftKey);
        return;
      }
      if (draft.clientId) clientId.current = draft.clientId;
      setTechEdited(draft.techEdited);
      if (draft.showMore) setShowMore(true);
      reset(values);
      photosRef.current = saved;
      if (saved.length > 0) {
        setRestoredPhotos(saved);
        setPhotoKey((k) => k + 1);
      }
      setRestoredAt(draft.savedAt);
    });
    return () => {
      cancelled = true;
    };
    // Only when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save while typing, and at once when the page goes to the background (camera, WhatsApp):
  // the phone may close it there.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        clearTimeout(timer);
        timer = setTimeout(saveDraft, 400);
      },
    });
    const flush = () => {
      clearTimeout(timer);
      saveDraft();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [subscribe, saveDraft]);

  const onPhotosChange = useCallback(
    (accepted: AcceptedPhoto[], processing: number) => {
      setPhotos(accepted);
      setProcessingPhotos(processing);
      const before = photosRef.current;
      const changed =
        accepted.length !== before.length ||
        accepted.some((p, i) => p.id !== before[i]?.id || p.choice !== before[i]?.choice || p.processed !== before[i]?.processed || p.ai !== before[i]?.ai);
      photosRef.current = accepted;
      if (changed && draftReadyRef.current) {
        void writeDraftPhotos(draftKey, accepted);
        saveDraft();
      }
    },
    [draftKey, saveDraft],
  );

  /** "Empezar de cero" / "Descartar cambios": back to the form as it opened. */
  function discardDraft() {
    clearProductDraft(draftKey);
    baselineRef.current = initialJson;
    photosRef.current = [];
    uploadedRef.current = new Set();
    if (mode === "create") clientId.current = crypto.randomUUID();
    skipNextTechSync.current = false;
    reset(initialValues);
    setTechEdited(techEditedAtStart());
    setRestoredPhotos([]);
    setPhotos([]);
    setPhotoKey((k) => k + 1);
    setRestoredAt(null);
    setSavedProduct(null);
  }

  useEffect(() => {
    // Public price erased: no prices at all, so the technician one goes too.
    const erased = Boolean(lastPublicPrice.current?.trim()) && !publicPrice?.trim();
    lastPublicPrice.current = publicPrice;
    if (erased) {
      setValue("techPriceUsd", "", { shouldValidate: false });
      setTechEdited(false);
      return;
    }
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

  /** Send the photos not stored yet; returns how many did not go up. */
  async function uploadPhotos(id: string): Promise<number> {
    const pending = photos.filter((p) => !uploadedRef.current.has(p.id));
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      setUploadStatus(`Subiendo foto ${i + 1} de ${pending.length}...`);
      // Safe to repeat: the photo id makes a second send return the same photo.
      const res = await callActionWithRetry(() => uploadProductPhotoAction(photoFormData(id, pending[i])));
      if (res.ok) {
        uploadedRef.current.add(pending[i].id);
        continue;
      }
      failed++;
      if (res.error.code === "NETWORK" || res.error.code === "OUTDATED") {
        // Without connection (or with the app updated) the rest would fail the same way.
        if (res.error.code === "OUTDATED") toastActionError(res.error);
        failed += pending.length - i - 1;
        break;
      }
      toastActionError(res.error, `Foto ${i + 1}`);
    }
    setUploadStatus(null);
    return failed;
  }

  /** Everything stored: clear the device copy and go on (to the product, or to a blank form). */
  function finishCreate(created: { id: string; sku: string }, values: ProductFormValues, andNew: boolean) {
    clearProductDraft(draftKey);
    clientId.current = crypto.randomUUID();
    uploadedRef.current = new Set();
    photosRef.current = [];
    setSavedProduct(null);
    setRestoredAt(null);
    setRestoredPhotos([]);
    if (!andNew) {
      router.push(`/productos/${created.id}`);
      return;
    }
    const blank: ProductFormValues = {
      ...emptyProductForm({ unitId: values.unitId, taxId: values.taxId }),
      categoryId: values.categoryId,
      brandId: values.brandId === NEW_BRAND_OPTION ? "" : values.brandId,
      ownerId: values.ownerId,
    };
    baselineRef.current = JSON.stringify(blank);
    skipNextTechSync.current = false;
    reset(blank);
    setTechEdited(false);
    setPhotos([]);
    setPhotoKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const submit = (andNew: boolean) =>
    handleSubmit(async (values) => {
      if (processingPhotos > 0) {
        toast.error("Espera a que termine la foto, o toca «Conservar original» para guardarla como está.");
        return;
      }
      setBusy(true);
      try {
        if (mode === "create") {
          let created = savedProduct;
          if (!created) {
            const res = await callAction(() => createProductAction(values, clientId.current));
            if (!res.ok) {
              applyFieldErrors(res.error.details?.fields as Record<string, unknown> | undefined);
              toastActionError(res.error);
              return;
            }
            created = { id: res.data.id, sku: res.data.sku };
          }
          const failed = await uploadPhotos(created.id);
          if (failed > 0) {
            setSavedProduct(created);
            toast.error(`El producto ${created.sku} quedó guardado, pero ${failed === 1 ? "una foto no se subió" : `${failed} fotos no se subieron`}. Revisa la conexión y toca «Reintentar fotos».`);
            return;
          }
          toast.success(`Producto ${created.sku} guardado`);
          finishCreate(created, values, andNew);
        } else {
          const res = await callAction(() => updateProductAction(productId!, values));
          if (!res.ok) {
            applyFieldErrors(res.error.details?.fields as Record<string, unknown> | undefined);
            toastActionError(res.error);
            return;
          }
          clearProductDraft(draftKey);
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
      {restoredAt && !savedProduct ? (
        <Alert>
          <History />
          <AlertTitle>{mode === "create" ? "Recuperamos el producto que estabas cargando" : "Recuperamos los cambios que no se guardaron"}</AlertTitle>
          <AlertDescription>
            <p>
              Quedó guardado en este equipo {savedWhen(restoredAt)}. Revísalo y toca Guardar.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={discardDraft}>
              {mode === "create" ? "Empezar de cero" : "Descartar estos cambios"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {savedProduct ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>El producto {savedProduct.sku} ya está guardado; faltan fotos por subir</AlertTitle>
          <AlertDescription>
            <p>Revisa la conexión y toca «Reintentar fotos». Si prefieres, sigue sin ellas y agrégalas después desde el producto.</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Foto</CardTitle>
            <CardDescription>Toma la foto con el celular; la app la deja con fondo blanco. Puedes agregar varias; la primera será la principal.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoCapture key={photoKey} disabled={busy} aiEnabled={aiPhotosEnabled} initialPhotos={restoredPhotos} onChange={onPhotosChange} />
          </CardContent>
        </Card>
      ) : null}

      <fieldset disabled={Boolean(savedProduct)} className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{mode === "create" ? "2. Datos básicos" : "Datos básicos"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField label="Nombre" htmlFor="name" required error={err("name")} className="md:col-span-2">
              <Input id="name" autoFocus={mode === "create"} placeholder="Ej.: Compresor Embraco 1/3 HP R134a" className={controlClass} {...register("name")} />
            </FormField>
            <FormField label="Dueño de la mercancía" required error={err("ownerId")} className="md:col-span-2">
              <OwnerPicker owners={options.owners} name="ownerId" invalid={Boolean(err("ownerId"))} inputProps={register("ownerId")} />
            </FormField>
            <FormField
              label="Número de parte"
              htmlFor="sku"
              error={err("sku")}
              hint={
                mode === "create"
                  ? "El del fabricante, tal como viene en la pieza. Si no tiene, déjalo vacío: se le asigna un código interno (LP-000001)."
                  : "Cambiarlo afecta etiquetas ya impresas"
              }
            >
              <Input id="sku" placeholder={mode === "create" ? "Ej.: FFI12HBX" : undefined} autoCapitalize="characters" className={`${controlClass} uppercase placeholder:normal-case`} {...register("sku")} />
            </FormField>
            <FormField label="Categoría" htmlFor="categoryId" error={err("categoryId")}>
              <NativeSelect id="categoryId" className={selectWrapperClass} {...register("categoryId")}>
                <NativeSelectOption value="">Sin categoría</NativeSelectOption>
                {inactiveCategory ? <NativeSelectOption value={inactiveCategory.id}>{inactiveCategory.label} (ya no se ofrece)</NativeSelectOption> : null}
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
              {/* Phones: two per row (type + brand, then model + remove); wider: one row. */}
              {compatibilities.fields.map((row, index) => (
                <div key={row.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
                  <Button type="button" variant="ghost" size="icon" className="size-11 justify-self-end md:size-10" aria-label="Quitar compatibilidad" onClick={() => compatibilities.remove(index)}>
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
              {/* Phones: code + remove on the first row, brand below; wider: one row. */}
              {equivalences.fields.map((row, index) => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <Input placeholder="Código (FFI12HBX)" aria-label="Código equivalente" className={controlClass} {...register(`equivalences.${index}.code`)} />
                    {err(`equivalences.${index}.code`) ? <p className="text-destructive mt-1 text-xs">{err(`equivalences.${index}.code`)}</p> : null}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Input placeholder="Marca (opcional)" aria-label="Marca del código equivalente" className={controlClass} {...register(`equivalences.${index}.brand`)} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-start-2 row-start-1 size-11 sm:col-start-auto sm:row-start-auto md:size-10"
                    aria-label="Quitar equivalencia"
                    onClick={() => equivalences.remove(index)}
                  >
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
            <FormField
              label="Precio público (USD)"
              htmlFor="publicPriceUsd"
              error={err("publicPriceUsd")}
              hint={
                publicPrice?.trim()
                  ? undefined
                  : mode === "edit" && initialValues.publicPriceUsd.trim()
                    ? "Al guardar sin precio, el producto queda con \"Falta precio\" y deja de venderse."
                    : "Si aún no lo tienes, déjalo vacío: queda con \"Falta precio\" y no se vende hasta ponérselo."
              }
            >
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
                    : cost?.trim()
                      ? "Costo unitario para calcular el margen"
                      : "Si aún no lo tienes, déjalo vacío: queda con \"Falta costo\" y lo cargas después."
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
                <FormField label="Código de barras del fabricante" htmlFor="barcode" error={err("barcode")} hint="Escanea o escribe el código. Si no trae, se genera uno propio." className="md:col-span-2">
                  <Input id="barcode" placeholder="Escanea aquí" autoComplete="off" className={controlClass} {...register("barcode")} />
                </FormField>
                <div className="flex items-center gap-3 self-end pb-2 md:col-span-2">
                  <Controller
                    control={control}
                    name="generateInternalBarcode"
                    render={({ field }) => <Checkbox id="generateInternalBarcode" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />}
                  />
                  <label htmlFor="generateInternalBarcode" className="text-sm">
                    Generar un código de barras propio si el campo queda vacío
                  </label>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </fieldset>

      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-14 z-30 border-t p-3 backdrop-blur md:sticky md:inset-x-auto md:bottom-0 md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {uploadStatus ? <span className="text-muted-foreground mr-auto text-sm">{uploadStatus}</span> : null}
          {processingPhotos > 0 ? <span className="text-muted-foreground mr-auto text-sm">Procesando {processingPhotos} foto(s)...</span> : null}
          {savedProduct ? (
            <Button type="button" size="lg" variant="outline" className="h-12" disabled={busy} onClick={() => finishCreate(savedProduct, getValues(), false)}>
              Seguir sin las fotos
            </Button>
          ) : mode === "create" ? (
            <Button type="button" size="lg" variant="outline" className="h-12" disabled={busy} onClick={() => void submit(true)()}>
              Guardar y crear otro
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="h-12 sm:min-w-40" disabled={busy}>
            {busy ? "Guardando..." : savedProduct ? "Reintentar fotos" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
