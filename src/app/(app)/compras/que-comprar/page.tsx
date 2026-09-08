import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { getPurchaseSuggestions } from "@/modules/purchasing/infrastructure/suggestions";
import { SuggestionsTable } from "@/modules/purchasing/ui/suggestions-table";

export const metadata = { title: "Qué comprar" };

export default async function WhatToBuyPage() {
  await requireRole("admin", "warehouse");
  const groups = await getPurchaseSuggestions();
  const total = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Qué comprar"
        description={total > 0 ? `${total} ${total === 1 ? "producto" : "productos"} por debajo de su punto de reorden o por agotarse, agrupados por proveedor` : "Sugerencia de compra agrupada por proveedor"}
        actions={
          <Button variant="outline" render={<Link href="/inventario/alertas" />}>
            Ver alertas
          </Button>
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No hay nada que comprar por ahora"
          description="Aquí aparecen los productos en 'Comprar ya' o 'Pronto'. Configura mínimos en Existencias (Editar mínimos) o espera a que la velocidad de venta calcule el punto de reorden."
          action={<Button render={<Link href="/inventario" />}>Ir a existencias</Button>}
        />
      ) : (
        <SuggestionsTable groups={groups} />
      )}
    </div>
  );
}
