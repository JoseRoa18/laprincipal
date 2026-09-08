"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir cierre" }: { label?: string }) {
  return (
    <Button variant="outline" size="lg" className="no-print" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
