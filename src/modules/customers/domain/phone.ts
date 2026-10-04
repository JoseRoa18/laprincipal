/** Mobile prefixes in Venezuela: Digitel 0412 and 0422, Movistar 0414 and 0424, Movilnet 0416 and 0426. */
export const MOBILE_PREFIXES = ["0412", "0414", "0416", "0422", "0424", "0426"] as const;

/** Select value for a landline: the area code (0212, 0241...) is then typed by hand. */
export const LANDLINE = "fijo";

/** A mobile prefix, or a landline area code (02xx). */
export function isValidPrefix(prefix: string): boolean {
  return (MOBILE_PREFIXES as readonly string[]).includes(prefix) || /^02\d{2}$/.test(prefix);
}

/** The 7 digits after the prefix, without separators. */
export function normalizePhoneNumber(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function phoneError(prefix: string, number: string): string | null {
  if (!prefix) return "Elige el prefijo";
  if (!isValidPrefix(prefix)) return "Prefijo inválido: 0412, 0414, 0416, 0422, 0424, 0426 o un código de área como 0212";
  return /^\d{7}$/.test(normalizePhoneNumber(number)) ? null : "El número lleva 7 dígitos después del prefijo";
}

/** "0414-1234567". */
export function formatPhone(prefix: string, number: string): string {
  return `${prefix}-${normalizePhoneNumber(number)}`;
}

/**
 * Split a stored phone into prefix and number for editing. Old free-text
 * phones that do not fit come back with an empty prefix and their digits.
 */
export function splitPhone(phone: string | null | undefined): { prefix: string; number: string } {
  const digits = normalizePhoneNumber(phone);
  if (digits.length === 11 && isValidPrefix(digits.slice(0, 4))) return { prefix: digits.slice(0, 4), number: digits.slice(4) };
  // +58 414 1234567
  if (digits.length === 12 && digits.startsWith("58") && isValidPrefix(`0${digits.slice(2, 5)}`)) return { prefix: `0${digits.slice(2, 5)}`, number: digits.slice(5) };
  return { prefix: "", number: digits };
}
