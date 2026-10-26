/**
 * The product form kept on the device while it is being filled, so a reload
 * (the phone closed the tab while the camera or WhatsApp was open, a new
 * version of the app, a session that expired) does not lose what was typed or
 * the photos already taken. Fields go to localStorage; photos (megabytes) to
 * IndexedDB. Saving the product clears it.
 */
import { idbDelete, idbGet, idbSet } from "@/lib/idb";
import type { ProductFormValues } from "../domain/product-schema";
import type { AcceptedPhoto } from "./photo-capture";

const PREFIX = "lp:product-draft:";
const PHOTOS_PREFIX = "product-draft-photos:";
/** A draft older than this is no longer offered. */
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;

export interface ProductDraft {
  v: 1;
  savedAt: number;
  /** The values the form started from (JSON). An edit draft is dropped once the product changed. */
  base: string;
  /** New product: the id it gets when saved, so saving again after a reload does not duplicate it. */
  clientId: string | null;
  values: ProductFormValues;
  techEdited: boolean;
  showMore: boolean;
}

/** One draft per user and product ("new" for the new-product form). */
export const productDraftKey = (userId: string, productId?: string) => `${PREFIX}${userId}:${productId ?? "new"}`;

export function readProductDraft(key: string): ProductDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ProductDraft;
    if (draft?.v !== 1 || typeof draft.savedAt !== "number" || Date.now() - draft.savedAt > MAX_AGE_MS) {
      clearProductDraft(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeProductDraft(key: string, draft: Omit<ProductDraft, "v" | "savedAt">) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: Date.now(), ...draft } satisfies ProductDraft));
  } catch {
    // Storage full or blocked (private mode): the form works the same, only without the safety net.
  }
}

export function clearProductDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
  void idbDelete(PHOTOS_PREFIX + key).catch(() => undefined);
}

export function readDraftPhotos(key: string): Promise<AcceptedPhoto[]> {
  return idbGet<AcceptedPhoto[]>(PHOTOS_PREFIX + key).then(
    (photos) => photos ?? [],
    () => [],
  );
}

export function writeDraftPhotos(key: string, photos: AcceptedPhoto[]): Promise<void> {
  return (photos.length > 0 ? idbSet(PHOTOS_PREFIX + key, photos) : idbDelete(PHOTOS_PREFIX + key)).catch(() => undefined);
}
