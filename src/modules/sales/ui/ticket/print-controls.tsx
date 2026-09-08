"use client";

import { Printer, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Print button and optional auto-print on load (hidden when printing). */
export function PrintControls({ auto, backHref }: { auto: boolean; backHref: string }) {
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <div className="print:hidden mx-auto flex max-w-md items-center justify-center gap-2 py-3">
      <Button size="lg" onClick={() => window.print()}>
        <Printer /> Imprimir
      </Button>
      <Button size="lg" variant="outline" render={<a href={backHref} />}>
        <X /> Cerrar
      </Button>
    </div>
  );
}
