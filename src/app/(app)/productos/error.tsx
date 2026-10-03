"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function ProductsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="No se pudo cargar esta pantalla"
      // In production `error.message` is a generic English text: show only the reference code.
      description={`Revisa la conexión e intenta de nuevo.${error.digest ? ` Código: ${error.digest}` : ""}`}
      action={
        <div className="flex gap-2">
          <Button onClick={() => retry()}>Reintentar</Button>
          <Button variant="outline" render={<Link href="/productos" />}>
            Ir a productos
          </Button>
        </div>
      }
    />
  );
}
