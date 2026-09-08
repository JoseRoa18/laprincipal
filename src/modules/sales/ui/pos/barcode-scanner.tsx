"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
}

type Scanner = { stop: () => Promise<void>; clear: () => void };

const CONTAINER_ID = "pos-barcode-scanner";

/** Camera barcode reader (html5-qrcode, loaded on demand). */
export function BarcodeScanner({ open, onOpenChange, onScan }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>Apunta la cámara al código de barras del producto.</DialogDescription>
        </DialogHeader>
        <ScannerView onScan={onScan} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open: starts the camera on mount, stops it on unmount. */
function ScannerView({ onScan }: { onScan: (code: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let scanner: Scanner | null = null;

    const start = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(CONTAINER_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scanner = instance;
        let done = false;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (text) => {
            if (done) return;
            done = true;
            onScanRef.current(text);
          },
          () => undefined,
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo abrir la cámara. Revisa los permisos del navegador.");
      }
    };
    void start();

    return () => {
      cancelled = true;
      const current = scanner;
      scanner = null;
      if (current) {
        current
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              current.clear();
            } catch {
              /* already cleared */
            }
          });
      }
    };
  }, []);

  return (
    <>
      <div id={CONTAINER_ID} className="bg-muted min-h-64 w-full overflow-hidden rounded-lg [&_video]:w-full" />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </>
  );
}
