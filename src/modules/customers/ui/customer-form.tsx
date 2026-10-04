"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCustomerAction, updateCustomerAction } from "@/app/(app)/clientes/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { customerInputSchema, type CustomerData, type CustomerInput } from "@/modules/customers/domain/schema";
import { CustomerFields } from "./customer-fields";

export interface PriceListOption {
  id: string;
  code: string;
  name: string;
}

/** Clientes screen: the shared customer fields plus email, price list, notes and the active switch. */
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

  const form = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      docType: "V",
      docNumber: "",
      firstName: "",
      lastName: "",
      companyName: "",
      phonePrefix: "",
      phoneNumber: "",
      email: "",
      state: "",
      municipality: "",
      parish: "",
      address: "",
      customerType: "public",
      priceListId: publicList?.id ?? "",
      notes: "",
      isActive: true,
      ...defaultValues,
    },
  });
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = form;

  // The price list follows the customer type unless another list was chosen by hand.
  const customerType = watch("customerType");
  useEffect(() => {
    const current = getValues("priceListId");
    const followsType = !current || current === publicList?.id || current === techList?.id;
    const expected = customerType === "technician" ? techList?.id : publicList?.id;
    if (followsType && expected && current !== expected) setValue("priceListId", expected, { shouldDirty: true });
  }, [customerType, getValues, setValue, publicList?.id, techList?.id]);

  // Validated by the resolver; the raw values go to the server, which validates again.
  const onSubmit = handleSubmit(() => {
    startTransition(async () => {
      const values = getValues();
      const result = customerId ? await updateCustomerAction(customerId, values) : await createCustomerAction(values);
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
      <CustomerFields form={form} autoFocus={customerId ? undefined : "docNumber"} />

      <Field data-invalid={Boolean(errors.email) || undefined}>
        <FieldLabel htmlFor="email">Correo</FieldLabel>
        <Input id="email" type="email" placeholder="Opcional" aria-invalid={Boolean(errors.email)} {...register("email")} />
        <FieldError errors={[errors.email]} />
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
