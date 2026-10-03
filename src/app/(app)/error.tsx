"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** `retry` (Next 16.3) fetches the page again, so a short database or network blip recovers. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <TriangleAlert className="text-destructive size-10" />
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground text-sm">
        No se pudo completar la operación. Revisa la conexión e intenta de nuevo; si el problema sigue, avisa al administrador.
        {error.digest ? <span className="mt-2 block font-mono text-xs">Código: {error.digest}</span> : null}
      </p>
      <Button onClick={() => retry()}>Reintentar</Button>
    </div>
  );
}
