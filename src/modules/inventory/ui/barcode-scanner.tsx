"use client";

import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Html5Qrcode } from "html5-qrcode";

const REGION_ID = "lp-barcode-scanner";

/**
 * Camera barcode reader (html5-qrcode, loaded on demand). Calls `onDetected`
 * once with the first code read and closes.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const [phase, setPhase] = useState<{ open: boolean; status: "starting" | "ready" | "error"; message?: string }>({ open: false, status: "starting" });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef(false);
  // Derived from the latest phase for this opening; a fresh open starts as "starting".
  const status = phase.open === open ? phase.status : "starting";
  const error = phase.open === open && phase.status === "error" ? (phase.message ?? null) : null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    detectedRef.current = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const F = mod.Html5QrcodeSupportedFormats;
        const scanner = new mod.Html5Qrcode(REGION_ID, {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.333 },
          (text) => {
            if (detectedRef.current) return;
            detectedRef.current = true;
            onDetected(text.trim());
            onOpenChange(false);
          },
          () => {
            /* no code in this frame */
          },
        );
        if (cancelled) await scanner.stop().catch(() => undefined);
        else setPhase({ open: true, status: "ready" });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setPhase({
          open: true,
          status: "error",
          message: /permission|denied|NotAllowed/i.test(msg) ? "No se pudo usar la cámara. Revisa el permiso en el navegador." : "No se pudo iniciar la cámara en este dispositivo.",
        });
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              /* already cleared */
            }
          });
      }
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>Apunta la cámara al código de barras del producto.</DialogDescription>
        </DialogHeader>
        <div id={REGION_ID} className="bg-muted min-h-56 w-full overflow-hidden rounded-lg [&_video]:rounded-lg" />
        {status === "starting" ? <p className="text-muted-foreground text-center text-sm">Iniciando cámara...</p> : null}
        {error ? (
          <p role="alert" className="text-destructive text-center text-sm">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Button that opens the camera scanner. */
export function ScanButton({
  onDetected,
  label = "Escanear",
  className,
  variant = "outline",
}: {
  onDetected: (code: string) => void;
  label?: string;
  className?: string;
  variant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="lg" className={className} onClick={() => setOpen(true)}>
        <ScanLine data-icon="inline-start" />
        {label}
      </Button>
      <BarcodeScannerDialog open={open} onOpenChange={setOpen} onDetected={onDetected} />
    </>
  );
}
