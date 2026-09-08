"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function ProductsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="No se pudo cargar esta pantalla"
      description={error.message || "Ocurrió un error inesperado. Intenta de nuevo."}
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="outline" render={<Link href="/productos" />}>
            Ir a productos
          </Button>
        </div>
      }
    />
  );
}
