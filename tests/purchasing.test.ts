import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { applyMovements } from "@/modules/inventory/application/stock";
import { upsertStockSettings } from "@/modules/inventory/application/stock-settings";
import { listMovements } from "@/modules/inventory/infrastructure/movements";
import { applyReceipt, deleteReceiptDraft, saveReceiptDraft, voidReceipt } from "@/modules/purchasing/application/receipts";
import { createSupplier, setPreferredSupplier, updateSupplier } from "@/modules/purchasing/application/suppliers";
import { getReceipt } from "@/modules/purchasing/infrastructure/receipts";
import { getPurchaseSuggestions } from "@/modules/purchasing/infrastructure/suggestions";
import { listSupplierProducts } from "@/modules/purchasing/infrastructure/suppliers";
import { withFixtures } from "./inventory-fixtures";

const skip = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(skip)("purchase receipts", () => {
  it("applies a receipt: weighted average, last cost, supplier link and consecutive numbers", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const product = await f.createProduct({ costAvgUsd: "5" });
      const supplier = await f.createSupplier({ currencyCode: "VES" });
      await applyMovements(f.tx, [{ productId: product.id, warehouseId: f.warehouseId, type: "initial", quantity: "10", unitCostUsd: "5", userId: f.userId }]);

      const draft = await saveReceiptDraft(
        {
          supplierId: supplier.id,
          supplierDocument: "F-100",
          receiptDate: "2026-09-08",
          currencyCode: "VES",
          exchangeRate: "36.5",
          extraCostsUsd: "0",
          lines: [{ productId: product.id, quantity: "10", unitCostAmount: "255.5" }], // 7 USD
        },
        actor,
        f.tx,
      );
      const before = (await getReceipt(draft.id, f.tx))!;
      expect(before.status).toBe("draft");
      expect(before.items[0].unitCostUsd).toBe("7.0000");
      expect(before.totalUsd).toBe("70.0000");

      const applied = await applyReceipt(draft.id, actor, f.tx);
      expect(applied.number).toMatch(/^E-\d{6}$/);

      const [p] = await f.tx.select().from(s.products).where(eq(s.products.id, product.id));
      expect(p.costAvgUsd).toBe("6.0000"); // (10×5 + 10×7) / 20
      expect(p.costLastUsd).toBe("7.0000");
      const [stock] = await f.tx.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, product.id), eq(s.stockLevels.warehouseId, f.warehouseId)));
      expect(stock.quantity).toBe("20.000");

      const [link] = await f.tx.select().from(s.productSuppliers).where(and(eq(s.productSuppliers.productId, product.id), eq(s.productSuppliers.supplierId, supplier.id)));
      expect(link).toMatchObject({ lastCostAmount: "255.5000", lastCostCurrency: "VES", lastCostUsd: "7.0000", isPreferred: true });
      expect(link.lastPurchaseAt).not.toBeNull();

      const kardex = await listMovements({ productId: product.id, dbx: f.tx });
      expect(kardex.rows[0]).toMatchObject({ type: "purchase_in", quantity: "10.000", balanceAfter: "20.000", unitCostUsd: "7.0000", referenceType: "purchase_receipt", referenceId: draft.id });

      // Consecutive numbering across receipts.
      const numbers = [applied.number];
      for (let i = 0; i < 2; i++) {
        const d = await saveReceiptDraft(
          { supplierId: supplier.id, receiptDate: "2026-09-08", currencyCode: "USD", exchangeRate: "1", extraCostsUsd: "0", lines: [{ productId: product.id, quantity: "1", unitCostAmount: "6" }] },
          actor,
          f.tx,
        );
        numbers.push((await applyReceipt(d.id, actor, f.tx)).number);
      }
      const nums = numbers.map((n) => Number(n.slice(2)));
      expect(nums[1]).toBe(nums[0] + 1);
      expect(nums[2]).toBe(nums[1] + 1);

      await expect(applyReceipt(draft.id, actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  it("prorates extra costs into the landed unit cost used by the kardex", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const a = await f.createProduct({ name: "A" });
      const b = await f.createProduct({ name: "B" });
      const supplier = await f.createSupplier();
      const draft = await saveReceiptDraft(
        {
          supplierId: supplier.id,
          receiptDate: "2026-09-08",
          currencyCode: "USD",
          exchangeRate: "1",
          extraCostsUsd: "12",
          lines: [
            { productId: a.id, quantity: "10", unitCostAmount: "10" }, // 100
            { productId: b.id, quantity: "1", unitCostAmount: "20" }, // 20
          ],
        },
        actor,
        f.tx,
      );
      const detail = (await getReceipt(draft.id, f.tx))!;
      expect(detail.subtotalUsd).toBe("120.0000");
      expect(detail.extraCostsUsd).toBe("12.0000");
      expect(detail.totalUsd).toBe("132.0000");
      const lineA = detail.items.find((i) => i.productId === a.id)!;
      const lineB = detail.items.find((i) => i.productId === b.id)!;
      expect(lineA.extraCostShareUsd).toBe("10.0000");
      expect(lineA.unitCostFinalUsd).toBe("11.0000");
      expect(lineB.unitCostFinalUsd).toBe("22.0000");

      await applyReceipt(draft.id, actor, f.tx);
      const [pa] = await f.tx.select().from(s.products).where(eq(s.products.id, a.id));
      expect(pa.costAvgUsd).toBe("11.0000");
      const kardex = await listMovements({ productId: b.id, dbx: f.tx });
      expect(kardex.rows[0].unitCostUsd).toBe("22.0000");
    });
  });

  it("voids a receipt restoring stock and average cost, only when nothing moved afterwards", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const product = await f.createProduct({ costAvgUsd: "5" });
      const supplier = await f.createSupplier();
      await applyMovements(f.tx, [{ productId: product.id, warehouseId: f.warehouseId, type: "purchase_in", quantity: "10", unitCostUsd: "5", userId: f.userId }]);

      const draft = await saveReceiptDraft(
        { supplierId: supplier.id, receiptDate: "2026-09-08", currencyCode: "USD", exchangeRate: "1", extraCostsUsd: "0", lines: [{ productId: product.id, quantity: "10", unitCostAmount: "7" }] },
        actor,
        f.tx,
      );
      await applyReceipt(draft.id, actor, f.tx);
      let [p] = await f.tx.select().from(s.products).where(eq(s.products.id, product.id));
      expect(p.costAvgUsd).toBe("6.0000");
      expect(p.costLastUsd).toBe("7.0000");

      await voidReceipt(draft.id, "Factura equivocada", actor, f.tx);
      const detail = (await getReceipt(draft.id, f.tx))!;
      expect(detail.status).toBe("voided");
      expect(detail.voidReason).toBe("Factura equivocada");
      [p] = await f.tx.select().from(s.products).where(eq(s.products.id, product.id));
      expect(p.costAvgUsd).toBe("5.0000");
      expect(p.costLastUsd).toBe("5.0000"); // previous purchase cost
      const [stock] = await f.tx.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, product.id), eq(s.stockLevels.warehouseId, f.warehouseId)));
      expect(stock.quantity).toBe("10.000");
      const kardex = await listMovements({ productId: product.id, dbx: f.tx });
      expect(kardex.rows[0]).toMatchObject({ type: "purchase_void_out", quantity: "-10.000", balanceAfter: "10.000", unitCostUsd: "7.0000" });
      await expect(voidReceipt(draft.id, "otra vez", actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });

      // A later movement blocks the void.
      const second = await saveReceiptDraft(
        { supplierId: supplier.id, receiptDate: "2026-09-08", currencyCode: "USD", exchangeRate: "1", extraCostsUsd: "0", lines: [{ productId: product.id, quantity: "4", unitCostAmount: "8" }] },
        actor,
        f.tx,
      );
      await applyReceipt(second.id, actor, f.tx);
      await applyMovements(f.tx, [{ productId: product.id, warehouseId: f.warehouseId, type: "sale_out", quantity: "-1", unitCostUsd: "5", userId: f.userId }]);
      await expect(voidReceipt(second.id, "tarde", actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });
      const [unchanged] = await f.tx.select().from(s.purchaseReceipts).where(eq(s.purchaseReceipts.id, second.id));
      expect(unchanged.status).toBe("applied");
    });
  });

  it("validates the header and can delete drafts", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const product = await f.createProduct();
      const supplier = await f.createSupplier();
      const base = { supplierId: supplier.id, receiptDate: "2026-09-08", extraCostsUsd: "0", lines: [{ productId: product.id, quantity: "1", unitCostAmount: "1" }] };
      await expect(saveReceiptDraft({ ...base, currencyCode: "USD", exchangeRate: "36" }, actor, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(saveReceiptDraft({ ...base, currencyCode: "XXX", exchangeRate: "1" }, actor, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });

      const draft = await saveReceiptDraft({ ...base, currencyCode: "USD", exchangeRate: "1" }, actor, f.tx);
      // Editing replaces the lines.
      await saveReceiptDraft({ ...base, id: draft.id, currencyCode: "USD", exchangeRate: "1", lines: [{ productId: product.id, quantity: "3", unitCostAmount: "2" }] }, actor, f.tx);
      const detail = (await getReceipt(draft.id, f.tx))!;
      expect(detail.items).toHaveLength(1);
      expect(detail.totalUsd).toBe("6.0000");

      await deleteReceiptDraft(draft.id, actor, f.tx);
      expect(await getReceipt(draft.id, f.tx)).toBeNull();
    });
  });
});

describe.skipIf(skip)("suppliers and suggestions", () => {
  it("creates, updates and links suppliers; groups suggestions by preferred supplier", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const created = await createSupplier(
        { name: "Refripartes", taxId: "J-123", currencyCode: "USD", leadTimeDays: 5, isActive: true, email: "", contactName: "Ana" },
        actor,
        f.tx,
      );
      const updated = await updateSupplier(created.id, { name: "Refripartes CA", currencyCode: "COP", leadTimeDays: 10, isActive: true }, actor, f.tx);
      expect(updated.name).toBe("Refripartes CA");
      expect(updated.currencyCode).toBe("COP");
      await expect(createSupplier({ name: "X", currencyCode: "ZZZ", leadTimeDays: 1, isActive: true }, actor, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });

      const other = await f.createSupplier({ name: "Otro" });
      const product = await f.createProduct({ costAvgUsd: "3" });
      await applyMovements(f.tx, [{ productId: product.id, warehouseId: f.warehouseId, type: "initial", quantity: "2", unitCostUsd: "3", userId: f.userId }]);
      await upsertStockSettings({ productId: product.id, minStock: "5", maxStock: "0", reorderPoint: "0", reorderQty: "12", mode: "manual" }, f.userId, f.tx);

      // Link the product to both suppliers; "Otro" becomes preferred.
      await f.tx.insert(s.productSuppliers).values([
        { productId: product.id, supplierId: created.id, lastCostUsd: "2.5", isPreferred: true },
        { productId: product.id, supplierId: other.id, lastCostUsd: "2.8", packSize: 5 },
      ]);
      await setPreferredSupplier(product.id, other.id, true, actor, f.tx);
      const links = await listSupplierProducts(other.id, f.tx);
      expect(links.find((l) => l.productId === product.id)?.isPreferred).toBe(true);
      const first = await listSupplierProducts(created.id, f.tx);
      expect(first.find((l) => l.productId === product.id)?.isPreferred).toBe(false);

      const groups = await getPurchaseSuggestions(f.tx);
      const group = groups.find((g) => g.supplierId === other.id)!;
      expect(group).toBeDefined();
      const item = group.items.find((i) => i.productId === product.id)!;
      expect(item.status).toBe("buy_now");
      expect(item.suggestedQty).toBe("15.000"); // reorder_qty 12 rounded up to packs of 5
      expect(item.unitCostUsd).toBe("2.8000");
    });
  });
});
