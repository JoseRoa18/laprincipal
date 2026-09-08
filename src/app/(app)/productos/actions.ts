"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { ALL_ROLES, assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { addBarcode, generateInternalBarcodeFor, removeBarcode, setPrimaryBarcode } from "@/modules/catalog/application/barcodes";
import { addProductImage, deleteProductImage, setPrimaryImage, type ImageFile } from "@/modules/catalog/application/images";
import { createProduct, deleteProduct, setProductActive, updateProduct } from "@/modules/catalog/application/products";
import { productFormSchema, toProductInput } from "@/modules/catalog/domain/product-schema";
import { searchProducts } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";

const idSchema = z.uuid("Identificador inválido");
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function revalidateProducts(productId?: string) {
  revalidatePath("/productos", "layout");
  if (productId) revalidatePath(`/productos/${productId}`);
  revalidatePath("/inventario", "layout");
}

export async function createProductAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const values = parseInput(productFormSchema, input);
    const result = await createProduct(toProductInput(values), user);
    revalidateProducts(result.id);
    return result;
  });
}

export async function updateProductAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const productId = parseInput(idSchema, id);
    const values = parseInput(productFormSchema, input);
    const result = await updateProduct(productId, toProductInput(values), user);
    revalidateProducts(productId);
    return result;
  });
}

export async function setProductActiveAction(id: string, active: boolean) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const productId = parseInput(idSchema, id);
    await setProductActive(productId, Boolean(active), user);
    revalidateProducts(productId);
    return { id: productId, isActive: Boolean(active) };
  });
}

export async function deleteProductAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const productId = parseInput(idSchema, id);
    const result = await deleteProduct(productId, user);
    revalidateProducts(productId);
    return result;
  });
}

async function toImageFile(value: FormDataEntryValue | null): Promise<ImageFile | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  return { data: Buffer.from(await value.arrayBuffer()), contentType: value.type || "application/octet-stream" };
}

/**
 * Upload one photo (original + optional processed/thumb produced in the browser).
 * FormData fields: productId, status ("processed" | "original_only"), original, processed?, thumb?.
 */
export async function uploadProductPhotoAction(formData: FormData) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const productId = parseInput(idSchema, formData.get("productId"));
    const status = formData.get("status") === "processed" ? "processed" : "original_only";
    let total = 0;
    for (const key of ["original", "processed", "thumb"]) {
      const v = formData.get(key);
      if (v instanceof File) total += v.size;
    }
    if (total > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "La foto es demasiado grande (máximo 12 MB).");
    const original = await toImageFile(formData.get("original"));
    if (!original) throw new AppError("VALIDATION", "Falta la foto.");
    const processed = status === "processed" ? await toImageFile(formData.get("processed")) : null;
    const thumb = await toImageFile(formData.get("thumb"));
    const row = await addProductImage({ productId, original, processed, thumb, status: processed ? "processed" : "original_only" }, user);
    revalidateProducts(productId);
    const storage = getStorage();
    return {
      id: row.id,
      isPrimary: row.isPrimary,
      url: storage.publicUrl("product-photos", row.processedPath ?? row.originalPath),
      thumbUrl: storage.publicUrl("product-photos", row.thumbPath ?? row.processedPath ?? row.originalPath),
    };
  });
}

export async function setPrimaryImageAction(productId: string, imageId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await setPrimaryImage(parseInput(idSchema, productId), parseInput(idSchema, imageId), user);
    revalidateProducts(productId);
    return { ok: true };
  });
}

export async function deleteImageAction(productId: string, imageId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await deleteProductImage(parseInput(idSchema, productId), parseInput(idSchema, imageId), user);
    revalidateProducts(productId);
    return { ok: true };
  });
}

export async function addBarcodeAction(productId: string, code: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const id = parseInput(idSchema, productId);
    const value = parseInput(z.string().trim().min(3, "Escribe o escanea el código").max(48, "Máximo 48 caracteres"), code);
    const row = await addBarcode(id, value, user);
    revalidateProducts(id);
    return row;
  });
}

export async function generateInternalBarcodeAction(productId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const id = parseInput(idSchema, productId);
    const row = await generateInternalBarcodeFor(id, user);
    revalidateProducts(id);
    return row;
  });
}

export async function removeBarcodeAction(productId: string, barcodeId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const id = parseInput(idSchema, productId);
    await removeBarcode(id, parseInput(idSchema, barcodeId), user);
    revalidateProducts(id);
    return { ok: true };
  });
}

export async function setPrimaryBarcodeAction(productId: string, barcodeId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const id = parseInput(idSchema, productId);
    await setPrimaryBarcode(id, parseInput(idSchema, barcodeId), user);
    revalidateProducts(id);
    return { ok: true };
  });
}

/** Quick search for pickers (labels). Any signed-in user. */
export async function searchProductsAction(q: string) {
  return runAction(async () => {
    await assertRole(...ALL_ROLES);
    const term = parseInput(z.string().trim().max(120), q);
    if (!term) return [];
    const location = await getDefaultLocation();
    const rows = await searchProducts(term, { warehouseId: location.warehouseId, limit: 15, includeInactive: true });
    return rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, partNumber: r.partNumber, priceUsd: r.priceUsd, thumbUrl: r.thumbUrl, isActive: r.isActive }));
  });
}
