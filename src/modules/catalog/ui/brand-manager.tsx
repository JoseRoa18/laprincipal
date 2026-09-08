"use client";

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createBrandAction, deleteBrandAction, updateBrandAction } from "@/app/(app)/productos/categorias/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BrandOption } from "../infrastructure/catalog-options";
import { controlClass, FormField } from "./form-field";

export function BrandManager({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    const value = name.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await createBrandAction({ name: value });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Marca "${res.data.name}" creada`);
      setName("");
      router.refresh();
    });
  }

  function saveEdit() {
    if (!editing) return;
    const value = editing.name.trim();
    if (!value) {
      setError("Escribe el nombre de la marca");
      return;
    }
    startTransition(async () => {
      const res = await updateBrandAction(editing.id, { name: value });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success("Marca actualizada");
      setEditing(null);
      router.refresh();
    });
  }

  function reactivate(b: BrandOption) {
    startTransition(async () => {
      const res = await updateBrandAction(b.id, { name: b.name, isActive: true });
      if (!res.ok) toast.error(res.error.message);
      else {
        toast.success("Marca activada");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva marca, por ejemplo Embraco" aria-label="Nueva marca" className={`${controlClass} flex-1`} />
        <Button type="submit" size="lg" className="h-11 md:h-10" disabled={pending || !name.trim()}>
          <Plus /> Agregar marca
        </Button>
      </form>
      {brands.length === 0 ? (
        <EmptyState title="Sin marcas" description="Agrega las marcas de los repuestos: Embraco, Danfoss, Tecumseh, genérico..." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {brands.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {b.name}
                  {!b.isActive ? (
                    <Badge variant="secondary" className="ml-2">
                      Inactiva
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">{b.productCount ?? 0} producto(s)</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                title="Editar"
                onClick={() => {
                  setError(null);
                  setEditing({ id: b.id, name: b.name });
                }}
              >
                <Pencil />
              </Button>
              {b.isActive ? (
                <ConfirmButton
                  title={`Eliminar "${b.name}"`}
                  description={(b.productCount ?? 0) > 0 ? "Hay productos con esta marca, así que solo se desactivará." : "La marca se eliminará. Esta acción no se puede deshacer."}
                  confirmLabel={(b.productCount ?? 0) > 0 ? "Desactivar" : "Eliminar"}
                  destructive
                  variant="ghost"
                  size="icon"
                  action={() => deleteBrandAction(b.id)}
                  onSuccess={() => router.refresh()}
                  successMessage={(b.productCount ?? 0) > 0 ? "Marca desactivada" : "Marca eliminada"}
                >
                  <Trash2 />
                  <span className="sr-only">Eliminar</span>
                </ConfirmButton>
              ) : (
                <Button variant="ghost" size="icon" aria-label="Activar" title="Activar" disabled={pending} onClick={() => reactivate(b)}>
                  <RotateCcw />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar marca</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <FormField label="Nombre" htmlFor="brand-name" required error={error ?? undefined}>
              <Input id="brand-name" autoFocus value={editing?.name ?? ""} onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : null)} className={controlClass} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
