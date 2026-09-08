import bwipjs from "bwip-js/node";
import type { BarcodeType } from "../domain/barcodes";

export interface BarcodePngOptions {
  scale?: number;
  /** Bar height in millimetres. */
  height?: number;
  includetext?: boolean;
}

/** PNG buffer for a barcode. EAN-13/UPC render with their symbology, anything else as Code 128. */
export async function barcodePng(code: string, type: BarcodeType | null, opts: BarcodePngOptions = {}): Promise<Buffer> {
  const bcid = type === "EAN13" || type === "INTERNAL" ? "ean13" : type === "UPC" ? "upca" : "code128";
  const base = { text: code, scale: opts.scale ?? 3, height: opts.height ?? 9, includetext: opts.includetext ?? true, textxalign: "center" as const, textsize: 9 };
  try {
    return await bwipjs.toBuffer({ bcid, ...base });
  } catch {
    // Wrong check digit or unsupported characters: Code 128 accepts anything printable.
    return bwipjs.toBuffer({ bcid: "code128", ...base });
  }
}
