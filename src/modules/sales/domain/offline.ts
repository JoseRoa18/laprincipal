/**
 * What the counter keeps on the device to sell without a connection: the
 * catalog with both prices and stock, and the customers with a document.
 * Pure: the server builds it, the browser stores and searches it.
 */
import { normalizeSearch } from "@/modules/catalog/domain/search-text";
import { normalizeSku } from "@/modules/catalog/domain/sku";
import { normalizeDocNumber } from "@/modules/customers/domain/document";

export const OFFLINE_SNAPSHOT_VERSION = 1;

export interface OfflineProduct {
  id: string;
  sku: string;
  name: string;
  unitSymbol: string;
  unitDecimals: number;
  taxRate: string;
  publicPriceUsd: string | null;
  techPriceUsd: string | null;
  stockAvailable: string;
  stockPhysical: string;
  locationCode: string | null;
  thumbUrl: string | null;
  /** Normalized words of name, codes, brand, equivalences and models (products.search_text). */
  searchText: string;
  barcodes: string[];
}

export interface OfflineCustomer {
  id: string;
  name: string;
  docType: string;
  /** Normalized: no dots, dashes or letter. */
  docNumber: string;
  /** "V-12345678". */
  doc: string;
  phone: string | null;
  customerType: "public" | "technician";
  priceListId: string | null;
}

export interface OfflineSnapshot {
  version: number;
  generatedAt: string;
  /** Header of the provisional ticket printed offline. */
  company: { name: string; taxId: string; address: string; phone: string };
  publicListId: string;
  techListId: string | null;
  products: OfflineProduct[];
  customers: OfflineCustomer[];
}

/** Product as the POS cart and search list use it, priced for a customer type. */
export interface OfflinePricedProduct {
  id: string;
  sku: string;
  name: string;
  unitSymbol: string;
  unitDecimals: number;
  taxRate: string;
  priceUsd: string | null;
  priceListCode: string | null;
  stockAvailable: string;
  stockPhysical: string;
  locationCode: string | null;
  thumbUrl: string | null;
  isActive: boolean;
}

/** Technicians pay the technician price when there is one, like the server's list fallback. */
export function priceOffline(p: OfflineProduct, customerType: "public" | "technician" | null): OfflinePricedProduct {
  const tech = customerType === "technician" && p.techPriceUsd ? p.techPriceUsd : null;
  const price = tech ?? p.publicPriceUsd;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    unitSymbol: p.unitSymbol,
    unitDecimals: p.unitDecimals,
    taxRate: p.taxRate,
    priceUsd: price,
    priceListCode: price ? (tech ? "TECH" : "PUBLIC") : null,
    stockAvailable: p.stockAvailable,
    stockPhysical: p.stockPhysical,
    locationCode: p.locationCode,
    thumbUrl: p.thumbUrl,
    isActive: true,
  };
}

/**
 * The same search the server does, on the saved catalog: an exact barcode or
 * code first, then every typed word in any order ("compresor 1/3").
 */
export function searchOffline(products: OfflineProduct[], term: string, limit = 20): OfflineProduct[] {
  const q = term.trim();
  if (!q) return [];
  const code = normalizeSku(q);
  const exact = products.filter((p) => p.barcodes.includes(q) || (code !== null && p.sku === code));
  if (exact.length > 0) return exact.slice(0, limit);
  const words = normalizeSearch(q).split(" ").filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];
  return products.filter((p) => words.every((w) => p.searchText.includes(w))).slice(0, limit);
}

/** Exact barcode only (scanner). */
export function findByBarcodeOffline(products: OfflineProduct[], code: string): OfflineProduct | null {
  const q = code.trim();
  return products.find((p) => p.barcodes.includes(q)) ?? null;
}

export function findCustomerOffline(customers: OfflineCustomer[], docType: string, docNumber: string): OfflineCustomer | null {
  const n = normalizeDocNumber(docNumber, docType);
  if (!n) return null;
  return customers.find((c) => c.docType === docType && c.docNumber === n) ?? null;
}

/** "P-0007": a sale saved offline until the server gives it its real number. */
export function provisionalNumber(sequence: number): string {
  return `P-${String(sequence).padStart(4, "0")}`;
}
