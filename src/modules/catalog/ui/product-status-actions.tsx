"use client";

import { Ban, CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteProductAction, setProductActiveAction } from "@/app/(app)/productos/actions";
import { ConfirmButton } from "@/components/app/confirm-button";

export function ProductStatusActions({ productId, isActive, movementCount }: { productId: string; isActive: boolean; movementCount: number }) {
  const router = useRouter();
  return (
    <>
      {isActive ? (
        <ConfirmButton
          title="Desactivar producto"
          description="Dejará de aparecer en el punto de venta y en las listas, pero conserva su historial. Puedes reactivarlo cuando quieras."
          confirmLabel="Desactivar"
          variant="outline"
          action={() => setProductActiveAction(productId, false)}
          successMessage="Producto desactivado"
          onSuccess={() => router.refresh()}
        >
          <Ban /> Desactivar
        </ConfirmButton>
      ) : (
        <ConfirmButton
          title="Reactivar producto"
          description="Volverá a aparecer en el punto de venta y en las listas."
          confirmLabel="Reactivar"
          variant="outline"
          action={() => setProductActiveAction(productId, true)}
          successMessage="Producto reactivado"
          onSuccess={() => router.refresh()}
        >
          <CheckCircle2 /> Reactivar
        </ConfirmButton>
      )}
      <ConfirmButton
        title="Eliminar producto"
        description={
          movementCount > 0
            ? `Este producto tiene ${movementCount} movimiento(s) de inventario, así que no se puede borrar: solo se desactivará.`
            : "El producto se eliminará del catálogo. Esta acción no se puede deshacer."
        }
        confirmLabel={movementCount > 0 ? "Desactivar" : "Eliminar"}
        destructive
        action={() => deleteProductAction(productId)}
        onSuccess={() => {
          if (movementCount > 0) router.refresh();
          else router.push("/productos");
        }}
        successMessage={movementCount > 0 ? "Producto desactivado" : "Producto eliminado"}
      >
        <Trash2 /> Eliminar
      </ConfirmButton>
    </>
  );
}
