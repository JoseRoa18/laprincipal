"use client";

import { ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Scanner = { stop: () => Promise<void>; clear: () => void };

/** Button that opens the camera (html5-qrcode) and returns the first barcode read. */
export function ScanButton({ onDetected, disabled, size = "lg", className }: { onDetected: (code: string) => void; disabled?: boolean; size?: "lg" | "default" | "sm"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "");
  const elementId = `scanner-${id}`;
  const scannerRef = useRef<Scanner | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const formats = [
          mod.Html5QrcodeSupportedFormats.EAN_13,
          mod.Html5QrcodeSupportedFormats.EAN_8,
          mod.Html5QrcodeSupportedFormats.UPC_A,
          mod.Html5QrcodeSupportedFormats.UPC_E,
          mod.Html5QrcodeSupportedFormats.CODE_128,
          mod.Html5QrcodeSupportedFormats.CODE_39,
          mod.Html5QrcodeSupportedFormats.QR_CODE,
        ];
        const scanner = new mod.Html5Qrcode(elementId, { formatsToSupport: formats, verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (text) => {
            onDetected(text.trim());
            setOpen(false);
          },
          () => undefined,
        );
      } catch (err) {
        setError(err instanceof Error && /NotAllowed|Permission/i.test(err.message) ? "Permite el acceso a la cámara para escanear." : "No se pudo abrir la cámara. Escribe el código a mano.");
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              s.clear();
            } catch {
              /* already cleared */
            }
          });
      }
    };
  }, [open, elementId, onDetected]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <ScanLine /> Escanear
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setError(null);
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear código de barras</DialogTitle>
            <DialogDescription>Apunta la cámara al código; se lee solo.</DialogDescription>
          </DialogHeader>
          <div id={elementId} className="min-h-64 w-full overflow-hidden rounded-lg bg-black" />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
