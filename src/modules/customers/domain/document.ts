/** Identity documents a customer can be invoiced with. "NONE" only exists on old records. */
export const DOC_TYPES = [
  { value: "V", label: "V", hint: "Cédula venezolana" },
  { value: "E", label: "E", hint: "Cédula extranjera" },
  { value: "J", label: "J", hint: "RIF de empresa" },
  { value: "G", label: "G", hint: "RIF de gobierno" },
  { value: "P", label: "P", hint: "Pasaporte" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];

/** J and G belong to companies and institutions: they have a razón social, not a first and last name. */
export function isCompanyDoc(docType: string): boolean {
  return docType === "J" || docType === "G";
}

/**
 * Upper case, without spaces, dots or dashes. For cédulas and RIF a leading
 * letter typed with the number is dropped: "V-12.345.678" → "12345678",
 * "J-12345678-9" → "123456789". Passports keep their letters.
 */
export function normalizeDocNumber(raw: string | null | undefined, docType?: string): string {
  const n = (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return docType && docType !== "P" ? n.replace(/^[VEJG](?=\d)/, "") : n;
}

/** Error message for a document number, or null when it is valid for its type. */
export function docNumberError(docType: string, docNumber: string): string | null {
  const n = normalizeDocNumber(docNumber, docType);
  if (!n) return "Escribe el número de cédula o RIF";
  switch (docType) {
    case "V":
    case "E":
      return /^\d{4,9}$/.test(n) ? null : "La cédula lleva solo números (entre 4 y 9)";
    case "J":
    case "G":
      return /^\d{9}$/.test(n) ? null : `El RIF lleva 9 números, por ejemplo ${docType}-12345678-9`;
    case "P":
      return /^[0-9A-Z]{5,15}$/.test(n) ? null : "El pasaporte lleva entre 5 y 15 letras o números";
    default:
      return "Elige el tipo de documento";
  }
}

/** "V-12345678", "J-12345678-9"; empty for old records without a document. */
export function formatDoc(docType: string, docNumber: string | null): string {
  if (docType === "NONE" || !docNumber) return "";
  const n = normalizeDocNumber(docNumber, docType);
  if (isCompanyDoc(docType) && /^\d{9}$/.test(n)) return `${docType}-${n.slice(0, 8)}-${n.slice(8)}`;
  return `${docType}-${n || docNumber}`;
}
