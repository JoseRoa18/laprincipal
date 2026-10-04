"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDoc } from "@/modules/customers/domain/document";
import type { CartCustomer } from "../../application/schemas";
import type { CustomerSearchResult } from "../../infrastructure/customers-lookup";
import { useDebounced } from "../use-debounced";

async function fetchCustomers(q: string): Promise<CustomerSearchResult[]> {
  const res = await fetch(`/api/sales/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo buscar clientes.");
  return ((await res.json()) as { customers: CustomerSearchResult[] }).customers;
}

/** The sale's customer in the cart, with "Cambiar" to go back to the cédula screen (the lines stay). */
export function CustomerCard({ customer, onChange, disabled }: { customer: CartCustomer; onChange: () => void; disabled?: boolean }) {
  return (
    <div className="border-primary/40 bg-primary/5 flex items-center gap-2 rounded-lg border px-3 py-2">
      <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {[customer.doc, customer.customerType === "technician" ? "Técnico · precio técnico" : "Precio público"].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onChange} disabled={disabled} aria-label="Cambiar cliente">
        Cambiar
      </Button>
    </div>
  );
}

/** Find a registered customer by name or phone when the cédula is not at hand. */
export function CustomerSearchDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (c: CartCustomer) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">{open ? <SearchBody onPick={onPick} /> : null}</DialogContent>
    </Dialog>
  );
}

/** Mounted while the dialog is open, so the search starts fresh each time. */
function SearchBody({ onPick }: { onPick: (c: CartCustomer) => void }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);
  const { data, isFetching, isError } = useQuery({ queryKey: ["pos-customers", debounced], queryFn: () => fetchCustomers(debounced), staleTime: 10_000 });
  // Customers without a document cannot be invoiced: they are listed but ask for the cédula first.
  const results = data ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Buscar cliente</DialogTitle>
        <DialogDescription>Por nombre, cédula o teléfono.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nombre, cédula o teléfono" autoFocus className="h-11 pl-9" aria-label="Buscar cliente" />
        {isFetching ? <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" /> : null}
      </div>
      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {isError ? <p className="text-destructive px-3 py-6 text-center text-sm">No se pudo buscar clientes.</p> : null}
        {!isError && results.length === 0 && !isFetching ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{term ? "Sin resultados. Búscalo por cédula para registrarlo." : "Aún no hay clientes registrados."}</p>
        ) : null}
        {results.map((c) => {
          const doc = formatDoc(c.docType, c.docNumber);
          return (
            <button
              key={c.id}
              type="button"
              disabled={!doc}
              onClick={() => onPick({ id: c.id, name: c.name, doc, phone: c.phone, customerType: c.customerType, priceListId: c.priceListId })}
              className="hover:bg-muted/60 flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm last:border-b-0 disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground block truncate text-xs">{doc ? [doc, c.phone].filter(Boolean).join(" · ") : "Sin cédula: búscalo por cédula para completarlo"}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">{c.customerType === "technician" ? "Técnico" : "Público"}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
