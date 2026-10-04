"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Search, SearchCheck, UserPlus, UserRound, UserSearch } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { findCustomerByDocAction, quickCreateCustomerAction } from "@/app/(app)/vender/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { applyFieldErrors } from "@/modules/core/ui/form-errors";
import { DOC_TYPES, docNumberError, formatDoc, isCompanyDoc, type DocType } from "@/modules/customers/domain/document";
import { customerInputSchema, type CustomerData, type CustomerInput } from "@/modules/customers/domain/schema";
import { CustomerFields } from "@/modules/customers/ui/customer-fields";
import type { CartCustomer } from "../../application/schemas";
import { CustomerSearchDialog } from "./customer-picker";

type Lookup = { status: "idle" } | { status: "found"; customer: CartCustomer } | { status: "missing"; docType: DocType; docNumber: string };

/**
 * First screen of Vender and Nueva cotización: no customer, no invoice. The
 * cashier types the cédula/RIF; a registered customer continues straight to
 * the sale, a new one is registered right here. "Solo consultar precio" is
 * the way to answer a price question without a customer.
 */
export function CustomerGate({ mode, onSelect }: { mode: "sale" | "quote"; onSelect: (customer: CartCustomer) => void }) {
  const [docType, setDocType] = useState<DocType>("V");
  const [docNumber, setDocNumber] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);

  function search() {
    setError(null);
    const invalid = docNumberError(docType, docNumber);
    if (invalid) {
      setError(`${invalid}.`);
      numberRef.current?.focus();
      return;
    }
    startSearch(async () => {
      const result = await findCustomerByDocAction({ docType, docNumber });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setLookup(result.data ? { status: "found", customer: result.data } : { status: "missing", docType, docNumber });
    });
  }

  function reset() {
    setLookup({ status: "idle" });
    setDocNumber("");
    requestAnimationFrame(() => numberRef.current?.focus());
  }

  const verb = mode === "sale" ? "Vender" : "Cotizar";

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-2 md:py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{mode === "sale" ? "¿A quién le vendes?" : "¿Para quién es la cotización?"}</CardTitle>
          <CardDescription>Escribe la cédula o RIF del cliente. Sin cliente no se puede facturar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <NativeSelect
              aria-label="Tipo de documento"
              className="w-20 shrink-0 [&>select]:h-12 [&>select]:text-base"
              value={docType}
              onChange={(e) => {
                setDocType(e.target.value as DocType);
                setLookup({ status: "idle" });
              }}
            >
              {DOC_TYPES.map((d) => (
                <NativeSelectOption key={d.value} value={d.value}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              ref={numberRef}
              autoFocus
              aria-label="Número de cédula o RIF"
              inputMode={docType === "P" ? "text" : "numeric"}
              autoComplete="off"
              placeholder={isCompanyDoc(docType) ? "12345678-9" : "12345678"}
              value={docNumber}
              onChange={(e) => {
                setDocNumber(e.target.value);
                if (lookup.status !== "idle") setLookup({ status: "idle" });
              }}
              aria-invalid={Boolean(error)}
              className="h-12 text-lg tabular-nums md:text-lg"
            />
            <Button type="submit" size="lg" className="h-12 px-4" disabled={searching}>
              {searching ? <Spinner /> : <Search />}
              <span className="max-sm:sr-only">Buscar</span>
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {lookup.status === "found" ? (
            <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  <UserRound className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{lookup.customer.name}</p>
                  <p className="text-muted-foreground text-sm">{[lookup.customer.doc, lookup.customer.phone].filter(Boolean).join(" · ")}</p>
                </div>
                {lookup.customer.customerType === "technician" ? <Badge variant="secondary">Técnico</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="lg" className="h-11 flex-1" autoFocus onClick={() => onSelect(lookup.customer)}>
                  {verb} a {lookup.customer.name.split(" ")[0]} <ArrowRight />
                </Button>
                <Button type="button" variant="outline" size="lg" className="h-11" onClick={reset}>
                  Otra cédula
                </Button>
              </div>
            </div>
          ) : null}

          {lookup.status === "missing" ? (
            <NewCustomer key={`${lookup.docType}-${lookup.docNumber}`} docType={lookup.docType} docNumber={lookup.docNumber} verb={verb} onCreated={onSelect} onCancel={reset} />
          ) : null}
        </CardContent>
      </Card>

      {lookup.status !== "missing" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" size="lg" className="h-11" onClick={() => setSearchOpen(true)}>
            <UserSearch /> Buscar por nombre o teléfono
          </Button>
          <Button variant="outline" size="lg" className="h-11" render={<Link href="/vender/consulta" />}>
            <SearchCheck /> Solo consultar precio
          </Button>
        </div>
      ) : null}

      <CustomerSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPick={(c) => {
          setSearchOpen(false);
          onSelect(c);
        }}
      />
    </div>
  );
}

/** Registration right at the counter, with the document already typed. */
function NewCustomer({
  docType,
  docNumber,
  verb,
  onCreated,
  onCancel,
}: {
  docType: DocType;
  docNumber: string;
  verb: string;
  onCreated: (c: CartCustomer) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: { docType, docNumber, firstName: "", lastName: "", companyName: "", phonePrefix: "", phoneNumber: "", customerType: "public", state: "", municipality: "", parish: "", address: "" },
  });

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const result = await quickCreateCustomerAction(form.getValues());
      if (!result.ok) {
        applyFieldErrors(result, form.setError);
        toast.error(result.error.message);
        return;
      }
      toast.success(`Cliente ${result.data.name} registrado`);
      onCreated(result.data);
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4 border-t pt-4">
      <div className="flex items-start gap-2">
        <UserPlus className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">No hay ningún cliente con {formatDoc(docType, docNumber) || "ese documento"}.</p>
          <p className="text-muted-foreground text-sm">Regístralo para continuar. La dirección es opcional.</p>
        </div>
      </div>
      <CustomerFields form={form} showDocument={false} autoFocus={isCompanyDoc(docType) ? undefined : "firstName"} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" className="h-11 flex-1" disabled={pending}>
          {pending ? "Guardando..." : `Guardar y ${verb.toLowerCase()}`}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
