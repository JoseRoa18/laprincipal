"use client";

import { Plus, Star, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addBarcodeAction, generateInternalBarcodeAction, removeBarcodeAction, setPrimaryBarcodeAction } from "@/app/(app)/productos/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanButton } from "./barcode-scanner";
import { BARCODE_TYPE_LABEL } from "./labels-es";

export interface BarcodeItem {
  id: string;
  code: string;
  type: "EAN13" | "UPC" | "CODE128" | "INTERNAL";
  isPrimary: boolean;
}

export function BarcodeManager({ productId, barcodes, canEdit }: { productId: string; barcodes: BarcodeItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const hasInternal = barcodes.some((b) => b.type === "INTERNAL");

  function add(value: string) {
    const v = value.trim();
    if (!v) return;
    startTransition(async () => {
      const res = await addBarcodeAction(productId, v);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Código ${res.data.code} agregado`);
      setCode("");
      router.refresh();
    });
  }

  function generate() {
    startTransition(async () => {
      const res = await generateInternalBarcodeAction(productId);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Código interno ${res.data.code} generado`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {barcodes.length === 0 ? <p className="text-muted-foreground text-sm">Este producto no tiene códigos de barras.</p> : null}
      <ul className="space-y-3">
        {barcodes.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/products/barcode?code=${encodeURIComponent(b.code)}&type=${b.type}`} alt={`Código ${b.code}`} className="h-12 w-auto max-w-40 bg-white" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium">{b.code}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">{BARCODE_TYPE_LABEL[b.type] ?? b.type}</Badge>
                {b.isPrimary ? <Badge>Principal</Badge> : null}
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-1">
                {!b.isPrimary ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Hacer principal"
                    title="Hacer principal"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setPrimaryBarcodeAction(productId, b.id);
                        if (!res.ok) toast.error(res.error.message);
                        else router.refresh();
                      })
                    }
                  >
                    <Star />
                  </Button>
                ) : null}
                <ConfirmButton
                  title="Quitar código de barras"
                  description={`Se quitará el código ${b.code} de este producto. Las etiquetas ya impresas con ese código dejarán de encontrarlo.`}
                  confirmLabel="Quitar"
                  destructive
                  variant="ghost"
                  size="icon"
                  action={() => removeBarcodeAction(productId, b.id)}
                  successMessage="Código quitado"
                  onSuccess={() => router.refresh()}
                >
                  <Trash2 />
                  <span className="sr-only">Quitar</span>
                </ConfirmButton>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="space-y-2">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              add(code);
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Escanea o escribe el código del fabricante"
              autoComplete="off"
              className="h-11 flex-1 md:h-10"
              aria-label="Nuevo código de barras"
            />
            <div className="flex gap-2">
              <ScanButton size="default" className="h-11 md:h-10" disabled={pending} onDetected={(c) => add(c)} />
              <Button type="submit" size="lg" className="h-11 md:h-10" disabled={pending || code.trim().length < 3}>
                <Plus /> Agregar
              </Button>
            </div>
          </form>
          {!hasInternal ? (
            <Button type="button" variant="outline" size="lg" className="h-11 md:h-10" disabled={pending} onClick={generate}>
              <Wand2 /> Generar código interno
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
