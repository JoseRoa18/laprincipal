"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCustomerAction, updateCustomerAction } from "@/app/(app)/clientes/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import {
  CUSTOMER_KINDS,
  CUSTOMER_TYPES,
  customerInputSchema,
  DOC_TYPES,
  type CustomerData,
  type CustomerInput,
} from "@/modules/customers/domain/schema";

export interface PriceListOption {
  id: string;
  code: string;
  name: string;
}

export function CustomerForm({
  customerId,
  defaultValues,
  priceLists,
}: {
  customerId?: string;
  defaultValues?: Partial<CustomerInput>;
  priceLists: PriceListOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const publicList = priceLists.find((l) => l.code === "PUBLIC") ?? priceLists[0];
  const techList = priceLists.find((l) => l.code === "TECH") ?? publicList;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      kind: "person",
      docType: "NONE",
      docNumber: "",
      name: "",
      phone: "",
      email: "",
      address: "",
      customerType: "public",
      priceListId: publicList?.id ?? "",
      notes: "",
      isActive: true,
      ...defaultValues,
    },
  });

  const docType = watch("docType");

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = customerId ? await updateCustomerAction(customerId, data) : await createCustomerAction(data);
      if (result.ok) {
        toast.success(customerId ? "Cliente actualizado" : "Cliente creado");
        router.push(`/clientes/${result.data.id}`);
        router.refresh();
      } else {
        applyFieldErrors(result, setError);
        toast.error(result.error.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kind">Tipo</FieldLabel>
          <NativeSelect className="w-full" id="kind" {...register("kind")}>
            {CUSTOMER_KINDS.map((k) => (
              <NativeSelectOption key={k.value} value={k.value}>
                {k.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="customerType">Cliente</FieldLabel>
          <NativeSelect
            className="w-full"
            id="customerType"
            {...register("customerType", {
              onChange: (e) => {
                const list = e.target.value === "technician" ? techList : publicList;
                if (list) setValue("priceListId", list.id, { shouldDirty: true });
              },
            })}
          >
            {CUSTOMER_TYPES.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>Los técnicos usan la lista de precios Técnico.</FieldDescription>
        </Field>
      </div>

      <Field data-invalid={Boolean(errors.name) || undefined}>
        <FieldLabel htmlFor="name">Nombre o razón social</FieldLabel>
        <Input id="name" autoFocus placeholder="Ej. Refrigeración Pérez" aria-invalid={Boolean(errors.name)} {...register("name")} />
        <FieldError errors={[errors.name]} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="docType">Documento</FieldLabel>
          <NativeSelect className="w-full" id="docType" {...register("docType")}>
            {DOC_TYPES.map((d) => (
              <NativeSelectOption key={d.value} value={d.value}>
                {d.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field data-invalid={Boolean(errors.docNumber) || undefined}>
          <FieldLabel htmlFor="docNumber">Número</FieldLabel>
          <Input
            id="docNumber"
            inputMode="numeric"
            placeholder={docType === "NONE" ? "Sin documento" : "12345678"}
            disabled={docType === "NONE"}
            aria-invalid={Boolean(errors.docNumber)}
            {...register("docNumber")}
          />
          <FieldError errors={[errors.docNumber]} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.phone) || undefined}>
          <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
          <Input id="phone" type="tel" placeholder="0412-1234567" {...register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>
        <Field data-invalid={Boolean(errors.email) || undefined}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input id="email" type="email" placeholder="cliente@correo.com" aria-invalid={Boolean(errors.email)} {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
      </div>

      <Field data-invalid={Boolean(errors.address) || undefined}>
        <FieldLabel htmlFor="address">Dirección</FieldLabel>
        <Input id="address" placeholder="Opcional" {...register("address")} />
        <FieldError errors={[errors.address]} />
      </Field>

      <Field data-invalid={Boolean(errors.priceListId) || undefined}>
        <FieldLabel htmlFor="priceListId">Lista de precios</FieldLabel>
        <NativeSelect className="w-full" id="priceListId" {...register("priceListId")}>
          {priceLists.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError errors={[errors.priceListId]} />
      </Field>

      <Field data-invalid={Boolean(errors.notes) || undefined}>
        <FieldLabel htmlFor="notes">Notas</FieldLabel>
        <Textarea id="notes" rows={3} placeholder="Opcional" {...register("notes")} />
        <FieldError errors={[errors.notes]} />
      </Field>

      {customerId ? (
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id="isActive" checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
              <FieldLabel htmlFor="isActive">Cliente activo</FieldLabel>
            </Field>
          )}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="outline" size="lg" render={<Link href={customerId ? `/clientes/${customerId}` : "/clientes"} />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
