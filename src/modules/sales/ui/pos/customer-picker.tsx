"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, UserPlus, UserRound, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateCustomerAction } from "@/app/(app)/vender/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";
import type { CartCustomer } from "../../application/schemas";
import type { CustomerSearchResult } from "../../infrastructure/customers-lookup";
import { useDebounced } from "../use-debounced";

interface Props {
  customer: CartCustomer | null;
  onSelect: (customer: CartCustomer | null) => void;
  disabled?: boolean;
}

const DOC_TYPES = [
  { value: "NONE", label: "Sin documento" },
  { value: "V", label: "V (cédula)" },
  { value: "E", label: "E (extranjero)" },
  { value: "J", label: "J (RIF jurídico)" },
  { value: "G", label: "G (gobierno)" },
  { value: "P", label: "P (pasaporte)" },
];

async function fetchCustomers(q: string): Promise<CustomerSearchResult[]> {
  const res = await fetch(`/api/sales/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo buscar clientes.");
  return ((await res.json()) as { customers: CustomerSearchResult[] }).customers;
}

export function CustomerPicker({ customer, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  function pick(c: CartCustomer | null) {
    onSelect(c);
    setOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(
            "hover:bg-muted/60 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-left transition-colors disabled:opacity-50",
            customer && "border-primary/40 bg-primary/5",
          )}
        >
          <UserRound className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{customer ? customer.name : "Consumidor final"}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {customer ? (customer.customerType === "technician" ? "Técnico · precio técnico" : "Cliente · precio público") : "Toca para elegir cliente"}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>
        {customer ? (
          <Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label="Quitar cliente" onClick={() => onSelect(null)} disabled={disabled}>
            <X />
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <CustomerDialogBody onPick={pick} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Mounted while the dialog is open, so search state starts fresh each time. */
function CustomerDialogBody({ onPick }: { onPick: (c: CartCustomer | null) => void }) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);
  const { data, isFetching, isError } = useQuery({ queryKey: ["pos-customers", debounced], queryFn: () => fetchCustomers(debounced), staleTime: 10_000 });
  const results = data ?? [];

  if (mode === "create") {
    return <QuickCreateForm onBack={() => setMode("search")} onCreated={(c) => onPick(c)} initialName={term} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cliente</DialogTitle>
        <DialogDescription>Busca por nombre, documento o teléfono. Los técnicos ven precio técnico.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nombre, cédula o teléfono" autoFocus className="h-11 pl-9" />
        {isFetching ? <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" /> : null}
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border">
        <button type="button" onClick={() => onPick(null)} className="hover:bg-muted/60 flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm">
          <UserRound className="text-muted-foreground size-4" />
          <span className="font-medium">Consumidor final</span>
          <span className="text-muted-foreground ml-auto text-xs">Precio público</span>
        </button>
        {isError ? <p className="text-destructive px-3 py-6 text-center text-sm">No se pudo buscar clientes.</p> : null}
        {!isError && results.length === 0 && !isFetching ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{term ? "Sin resultados." : "Aún no hay clientes registrados."}</p>
        ) : null}
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick({ id: c.id, name: c.name, phone: c.phone, customerType: c.customerType, priceListId: c.priceListId })}
            className="hover:bg-muted/60 flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {[c.docType !== "NONE" && c.docNumber ? `${c.docType}-${c.docNumber}` : null, c.phone].filter(Boolean).join(" · ") || "Sin datos"}
              </span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">{c.customerType === "technician" ? "Técnico" : "Público"}</span>
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setMode("create")}>
          <UserPlus /> Nuevo cliente
        </Button>
      </DialogFooter>
    </>
  );
}

function QuickCreateForm({ onBack, onCreated, initialName }: { onBack: () => void; onCreated: (c: CartCustomer) => void; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [docType, setDocType] = useState("NONE");
  const [docNumber, setDocNumber] = useState("");
  const [customerType, setCustomerType] = useState<"public" | "technician">("public");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await quickCreateCustomerAction({ name, phone: phone || null, docType, docNumber: docNumber || null, customerType });
      if (!result.ok) {
        const fields = (result.error.details?.fields as Record<string, string> | undefined) ?? {};
        setErrors(Object.keys(fields).length ? fields : { _: result.error.message });
        return;
      }
      toast.success("Cliente creado");
      onCreated(result.data);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuevo cliente</DialogTitle>
        <DialogDescription>Solo lo básico; el resto se completa en Clientes.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="qc-name">Nombre</Label>
          <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11" />
          {errors.name ? <p className="text-destructive text-xs">{errors.name}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qc-phone">Teléfono</Label>
          <Input id="qc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0412-1234567" className="h-11" />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="qc-doctype">Documento</Label>
            <NativeSelect id="qc-doctype" value={docType} onChange={(e) => setDocType(e.target.value)} className="[&>select]:h-11">
              {DOC_TYPES.map((d) => (
                <NativeSelectOption key={d.value} value={d.value}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qc-docnumber">Número</Label>
            <Input id="qc-docnumber" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} disabled={docType === "NONE"} inputMode="numeric" className="h-11" />
            {errors.docNumber ? <p className="text-destructive text-xs">{errors.docNumber}</p> : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de cliente</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["public", "technician"] as const).map((t) => (
              <Button key={t} type="button" variant={customerType === t ? "default" : "outline"} className="h-11" onClick={() => setCustomerType(t)}>
                {t === "public" ? "Público" : "Técnico"}
              </Button>
            ))}
          </div>
        </div>
        {errors._ ? (
          <p role="alert" className="text-destructive text-sm">
            {errors._}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          Volver
        </Button>
        <Button type="button" onClick={submit} disabled={pending || name.trim().length < 2}>
          {pending ? "Guardando..." : "Crear y usar"}
        </Button>
      </DialogFooter>
    </>
  );
}
