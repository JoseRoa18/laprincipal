"use client";

import { FolderPlus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/(app)/productos/categorias/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CategoryNode } from "../infrastructure/catalog-options";
import { controlClass, FormField, selectWrapperClass } from "./form-field";

interface DialogState {
  open: boolean;
  id: string | null;
  name: string;
  parentId: string;
  sortOrder: string;
}

const closed: DialogState = { open: false, id: null, name: "", parentId: "", sortOrder: "0" };

function flatten(nodes: CategoryNode[], out: CategoryNode[] = []): CategoryNode[] {
  for (const n of nodes) {
    out.push(n);
    flatten(n.children, out);
  }
  return out;
}

export function CategoryManager({ tree }: { tree: CategoryNode[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(closed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const all = flatten(tree);
  const parentChoices = all.filter((c) => c.depth < 2 && c.id !== dialog.id);

  function openNew(parentId = "") {
    setError(null);
    setDialog({ open: true, id: null, name: "", parentId, sortOrder: "0" });
  }

  function openEdit(node: CategoryNode) {
    setError(null);
    setDialog({ open: true, id: node.id, name: node.name, parentId: node.parentId ?? "", sortOrder: String(node.sortOrder) });
  }

  function save() {
    const name = dialog.name.trim();
    if (!name) {
      setError("Escribe el nombre de la categoría");
      return;
    }
    const input = { name, parentId: dialog.parentId || null, sortOrder: Number(dialog.sortOrder) || 0 };
    startTransition(async () => {
      const res = dialog.id ? await updateCategoryAction(dialog.id, input) : await createCategoryAction(input);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(dialog.id ? "Categoría actualizada" : "Categoría creada");
      setDialog(closed);
      router.refresh();
    });
  }

  function reactivate(node: CategoryNode) {
    startTransition(async () => {
      const res = await updateCategoryAction(node.id, { name: node.name, parentId: node.parentId, sortOrder: node.sortOrder, isActive: true });
      if (!res.ok) toast.error(res.error.message);
      else {
        toast.success("Categoría activada");
        router.refresh();
      }
    });
  }

  function Row({ node }: { node: CategoryNode }) {
    return (
      <li>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ marginLeft: node.depth * 20 }}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {node.name}
              {!node.isActive ? (
                <Badge variant="secondary" className="ml-2">
                  Inactiva
                </Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {node.productCount} producto(s) · orden {node.sortOrder}
            </p>
          </div>
          {node.depth < 2 ? (
            <Button variant="ghost" size="icon" aria-label="Nueva subcategoría" title="Nueva subcategoría" onClick={() => openNew(node.id)}>
              <FolderPlus />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Editar" title="Editar" onClick={() => openEdit(node)}>
            <Pencil />
          </Button>
          {node.isActive ? (
            <ConfirmButton
              title={`Eliminar "${node.name}"`}
              description={
                node.productCount > 0 || node.children.length > 0
                  ? "Tiene productos o subcategorías, así que solo se desactivará (deja de aparecer en los formularios)."
                  : "La categoría se eliminará. Esta acción no se puede deshacer."
              }
              confirmLabel={node.productCount > 0 || node.children.length > 0 ? "Desactivar" : "Eliminar"}
              destructive
              variant="ghost"
              size="icon"
              action={() => deleteCategoryAction(node.id)}
              onSuccess={() => router.refresh()}
              successMessage={node.productCount > 0 || node.children.length > 0 ? "Categoría desactivada" : "Categoría eliminada"}
            >
              <Trash2 />
              <span className="sr-only">Eliminar</span>
            </ConfirmButton>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Activar" title="Activar" disabled={pending} onClick={() => reactivate(node)}>
              <RotateCcw />
            </Button>
          )}
        </div>
        {node.children.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {node.children.map((child) => (
              <Row key={child.id} node={child} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="lg" onClick={() => openNew()}>
          <Plus /> Nueva categoría
        </Button>
      </div>
      {tree.length === 0 ? (
        <EmptyState title="Sin categorías" description="Crea la primera categoría, por ejemplo Refrigeración, y luego sus subcategorías." />
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <Row key={node.id} node={node} />
          ))}
        </ul>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => (open ? null : setDialog(closed))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.id ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
            <DialogDescription>Las categorías organizan el catálogo en dos o tres niveles.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <FormField label="Nombre" htmlFor="category-name" required error={error ?? undefined}>
              <Input id="category-name" autoFocus value={dialog.name} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} className={controlClass} />
            </FormField>
            <FormField label="Categoría padre" htmlFor="category-parent">
              <NativeSelect id="category-parent" className={selectWrapperClass} value={dialog.parentId} onChange={(e) => setDialog({ ...dialog, parentId: e.target.value })}>
                <NativeSelectOption value="">Ninguna (nivel principal)</NativeSelectOption>
                {parentChoices.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Orden" htmlFor="category-order" hint="Las de menor número aparecen primero">
              <Input id="category-order" inputMode="numeric" value={dialog.sortOrder} onChange={(e) => setDialog({ ...dialog, sortOrder: e.target.value })} className={controlClass} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(closed)} disabled={pending}>
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
