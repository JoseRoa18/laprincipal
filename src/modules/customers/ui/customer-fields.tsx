"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DOC_TYPES, isCompanyDoc } from "../domain/document";
import { municipalitiesOf, parishesOf, statesOf, type Geo } from "../domain/geo";
import { LANDLINE, MOBILE_PREFIXES } from "../domain/phone";
import type { CustomerData, CustomerInput } from "../domain/schema";

export type CustomerFormApi = UseFormReturn<CustomerInput, unknown, CustomerData>;

let geoCache: Promise<Geo> | null = null;
/** The list is loaded once, the first time an address is opened. */
function loadGeo(): Promise<Geo> {
  geoCache ??= import("../domain/venezuela-geo.json").then((m) => m.default as Geo);
  return geoCache;
}

/**
 * Customer fields shared by the POS (new customer at the counter) and
 * Clientes: document, names or razón social, phone with prefix, price type
 * and the optional address (estado → municipio → parroquia + detail).
 */
export function CustomerFields({
  form,
  autoFocus,
  showDocument = true,
}: {
  form: CustomerFormApi;
  autoFocus?: "docNumber" | "firstName";
  /** False when the document was already typed above (the POS lookup), so it is not asked twice. */
  showDocument?: boolean;
}) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const docType = watch("docType") ?? "V";
  const company = isCompanyDoc(docType);
  const customerType = watch("customerType") ?? "public";
  const err = (name: keyof CustomerInput) => errors[name];

  return (
    <div className="space-y-4">
      {showDocument ? (
        <Field data-invalid={Boolean(err("docNumber")) || undefined}>
          <FieldLabel htmlFor="c-docNumber">Cédula o RIF</FieldLabel>
          <div className="flex gap-2">
            <NativeSelect id="c-docType" aria-label="Tipo de documento" className="w-20 shrink-0" {...register("docType")}>
              {DOC_TYPES.map((d) => (
                <NativeSelectOption key={d.value} value={d.value}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              id="c-docNumber"
              inputMode={docType === "P" ? "text" : "numeric"}
              autoComplete="off"
              autoFocus={autoFocus === "docNumber"}
              placeholder={company ? "12345678-9" : "12345678"}
              aria-invalid={Boolean(err("docNumber"))}
              {...register("docNumber")}
            />
          </div>
          <FieldDescription>{DOC_TYPES.find((d) => d.value === docType)?.hint}</FieldDescription>
          <FieldError errors={[err("docNumber")]} />
        </Field>
      ) : null}

      {company ? (
        <Field data-invalid={Boolean(err("companyName")) || undefined}>
          <FieldLabel htmlFor="c-companyName">Razón social</FieldLabel>
          <Input id="c-companyName" placeholder="Ej.: Refrigeración Los Andes, C.A." aria-invalid={Boolean(err("companyName"))} {...register("companyName")} />
          <FieldError errors={[err("companyName")]} />
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(err("firstName")) || undefined}>
            <FieldLabel htmlFor="c-firstName">Nombre</FieldLabel>
            <Input id="c-firstName" autoComplete="off" autoFocus={autoFocus === "firstName"} aria-invalid={Boolean(err("firstName"))} {...register("firstName")} />
            <FieldError errors={[err("firstName")]} />
          </Field>
          <Field data-invalid={Boolean(err("lastName")) || undefined}>
            <FieldLabel htmlFor="c-lastName">Apellido</FieldLabel>
            <Input id="c-lastName" autoComplete="off" aria-invalid={Boolean(err("lastName"))} {...register("lastName")} />
            <FieldError errors={[err("lastName")]} />
          </Field>
        </div>
      )}

      <PhoneField form={form} />

      <Field>
        <FieldLabel>Tipo de cliente</FieldLabel>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de cliente">
          {(["public", "technician"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={customerType === t ? "default" : "outline"}
              aria-pressed={customerType === t}
              className="h-10"
              onClick={() => setValue("customerType", t, { shouldDirty: true })}
            >
              {t === "public" ? "Público" : "Técnico"}
            </Button>
          ))}
        </div>
        <FieldDescription>Los técnicos pagan el precio técnico.</FieldDescription>
      </Field>

      <AddressFields form={form} />
    </div>
  );
}

function PhoneField({ form }: { form: CustomerFormApi }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const prefix = watch("phonePrefix") ?? "";
  const mobile = (MOBILE_PREFIXES as readonly string[]).includes(prefix);
  // A typed area code keeps the "Fijo" option selected while it is incomplete.
  const [landline, setLandline] = useState(Boolean(prefix) && !mobile);
  const selectValue = landline ? LANDLINE : mobile ? prefix : "";
  const error = errors.phonePrefix ?? errors.phoneNumber;

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor="c-phoneNumber">Teléfono</FieldLabel>
      <div className="flex gap-2">
        <NativeSelect
          aria-label="Prefijo"
          className="w-28 shrink-0"
          value={selectValue}
          aria-invalid={Boolean(errors.phonePrefix)}
          onChange={(e) => {
            const value = e.target.value;
            setLandline(value === LANDLINE);
            setValue("phonePrefix", value === LANDLINE ? "02" : value, { shouldDirty: true, shouldValidate: Boolean(errors.phonePrefix) });
          }}
        >
          <NativeSelectOption value="" disabled>
            Prefijo
          </NativeSelectOption>
          {MOBILE_PREFIXES.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {p}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={LANDLINE}>Fijo…</NativeSelectOption>
        </NativeSelect>
        {landline ? (
          <Input aria-label="Código de área" inputMode="numeric" maxLength={4} placeholder="0212" className="w-20 shrink-0" {...register("phonePrefix")} />
        ) : null}
        <Input id="c-phoneNumber" type="tel" inputMode="numeric" autoComplete="off" placeholder="1234567" aria-invalid={Boolean(errors.phoneNumber)} {...register("phoneNumber")} />
      </div>
      <FieldError errors={[error]} />
    </Field>
  );
}

function AddressFields({ form }: { form: CustomerFormApi }) {
  const { register, watch, setValue } = form;
  const state = watch("state") ?? "";
  const municipality = watch("municipality") ?? "";
  const parish = watch("parish") ?? "";
  const detail = watch("address") ?? "";
  const [open, setOpen] = useState(Boolean(state || detail));
  const [geo, setGeo] = useState<Geo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || geo) return;
    let alive = true;
    loadGeo()
      .then((g) => alive && setGeo(g))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, geo]);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-10 w-full justify-between" onClick={() => setOpen(true)} aria-expanded={false}>
        <span className="flex items-center gap-2">
          <MapPin /> Agregar dirección <span className="text-muted-foreground">(opcional)</span>
        </span>
        <ChevronDown />
      </Button>
    );
  }

  const states = geo ? statesOf(geo) : [];
  const municipalities = geo ? municipalitiesOf(geo, state) : [];
  const parishes = geo ? parishesOf(geo, state, municipality) : [];
  // Keep a saved value visible even before the list loads.
  const withCurrent = (list: string[], value: string) => (value && !list.includes(value) ? [value, ...list] : list);

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <MapPin className="size-4" aria-hidden="true" /> Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
      </legend>
      {failed ? <p className="text-destructive text-sm">No se pudo cargar la lista de estados. Escribe la dirección abajo.</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="c-state">Estado</FieldLabel>
          <NativeSelect
            id="c-state"
            className="w-full"
            value={state}
            disabled={!geo && !state}
            onChange={(e) => {
              setValue("state", e.target.value, { shouldDirty: true });
              setValue("municipality", "", { shouldDirty: true });
              setValue("parish", "", { shouldDirty: true });
            }}
          >
            <NativeSelectOption value="">{geo ? "Elige el estado" : "Cargando…"}</NativeSelectOption>
            {withCurrent(states, state).map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="c-municipality">Municipio</FieldLabel>
          <NativeSelect
            id="c-municipality"
            className="w-full"
            value={municipality}
            disabled={!state}
            onChange={(e) => {
              setValue("municipality", e.target.value, { shouldDirty: true });
              setValue("parish", "", { shouldDirty: true });
            }}
          >
            <NativeSelectOption value="">{state ? "Elige el municipio" : "Primero el estado"}</NativeSelectOption>
            {withCurrent(municipalities, municipality).map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="c-parish">Parroquia</FieldLabel>
          <NativeSelect id="c-parish" className="w-full" value={parish} disabled={!municipality} onChange={(e) => setValue("parish", e.target.value, { shouldDirty: true })}>
            <NativeSelectOption value="">{municipality ? "Elige la parroquia" : "Primero el municipio"}</NativeSelectOption>
            {withCurrent(parishes, parish).map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="c-address">Sector, calle y casa</FieldLabel>
        <Input id="c-address" placeholder="Ej.: Urb. Los Pinos, calle 3, casa 12" {...register("address")} />
      </Field>
    </fieldset>
  );
}
