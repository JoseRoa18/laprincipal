export type BarcodeType = "EAN13" | "UPC" | "CODE128" | "INTERNAL";

/** Internal (store) EAN-13 codes: "20" + 10-digit sequence + check digit. Prefix 20–29 is reserved for in-store use. */
export const INTERNAL_BARCODE_PREFIX = "20";
export const INTERNAL_SEQUENCE_DIGITS = 10;
export const MAX_INTERNAL_SEQUENCE = 9_999_999_999;

/** EAN-13 / GTIN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(digits: string): number {
  if (!/^\d{12}$/.test(digits)) throw new Error("Se necesitan 12 dígitos para calcular el verificador");
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = digits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** UPC-A check digit for the first 11 digits. */
export function upcCheckDigit(digits: string): number {
  if (!/^\d{11}$/.test(digits)) throw new Error("Se necesitan 11 dígitos para calcular el verificador");
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const n = digits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidUpc(code: string): boolean {
  return /^\d{12}$/.test(code) && upcCheckDigit(code.slice(0, 11)) === Number(code[11]);
}

/** Build the internal barcode for a sequence number (1 → 2000000000015). */
export function generateInternalBarcode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_INTERNAL_SEQUENCE) {
    throw new Error("La secuencia del código interno está fuera de rango");
  }
  const body = `${INTERNAL_BARCODE_PREFIX}${String(sequence).padStart(INTERNAL_SEQUENCE_DIGITS, "0")}`;
  return `${body}${ean13CheckDigit(body)}`;
}

/** Sequence encoded in an internal barcode, or null when the code is not one of ours. */
export function parseInternalSequence(code: string): number | null {
  if (!isValidEan13(code) || !code.startsWith(INTERNAL_BARCODE_PREFIX)) return null;
  return Number(code.slice(INTERNAL_BARCODE_PREFIX.length, INTERNAL_BARCODE_PREFIX.length + INTERNAL_SEQUENCE_DIGITS));
}

/** Remove whitespace; barcodes never contain spaces. */
export function normalizeBarcode(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

/** Manufacturer codes are stored as typed; the type is inferred from length and check digit. */
export function detectBarcodeType(code: string): BarcodeType {
  if (isValidEan13(code)) return "EAN13";
  if (isValidUpc(code)) return "UPC";
  return "CODE128";
}

/** Code 128 accepts printable ASCII. Keep codes between 3 and 48 characters. */
export function isValidBarcodeText(code: string): boolean {
  return code.length >= 3 && code.length <= 48 && /^[\x21-\x7e]+$/.test(code);
}
