"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <TriangleAlert className="text-destructive size-10" />
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground text-sm">
        No se pudo completar la operación. Intenta de nuevo; si el problema sigue, avisa al administrador.
        {error.digest ? <span className="mt-2 block font-mono text-xs">Código: {error.digest}</span> : null}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
