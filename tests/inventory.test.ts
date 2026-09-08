import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { AppError } from "@/lib/errors";
import { applyAdjustment, cancelAdjustment, saveAdjustmentDraft } from "@/modules/inventory/application/adjustments";
import { addCountItem, applyCount, createCount, recordCountItem } from "@/modules/inventory/application/counts";
import { applyMovements } from "@/modules/inventory/application/stock";
import { upsertStockSettings } from "@/modules/inventory/application/stock-settings";
import { getAlerts } from "@/modules/inventory/infrastructure/alerts";
import { getCount } from "@/modules/inventory/infrastructure/counts";
import { listMovements } from "@/modules/inventory/infrastructure/movements";
import { listStock } from "@/modules/inventory/infrastructure/stock-query";
import { withFixtures } from "./inventory-fixtures";

const skip = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(skip)("inventory adjustments", () => {
  it("applies an adjustment: stock, kardex balance, cost and consecutive number", async () => {
    await withFixtures(async (f) => {
      const product = await f.createProduct();
      const actor = { id: f.userId };

      const draft = await saveAdjustmentDraft(
        { reasonId: f.reasons.increase, notes: "Carga inicial", lines: [{ productId: product.id, quantity: "10", direction: "in", unitCostUsd: "5" }] },
        actor,
        f.tx,
      );
      const applied = await applyAdjustment(draft.id, actor, f.tx);
      expect(applied.number).toMatch(/^A-\d{6}$/);

      const [stock] = await f.tx.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, product.id), eq(s.stockLevels.warehouseId, f.warehouseId)));
      expect(stock.quantity).toBe("10.000");
      const [p] = await f.tx.select().from(s.products).where(eq(s.products.id, product.id));
      expect(p.costAvgUsd).toBe("5.0000");

      const kardex = await listMovements({ productId: product.id, dbx: f.tx });
      expect(kardex.total).toBe(1);
      expect(kardex.rows[0]).toMatchObject({ type: "adjust_in", quantity: "10.000", balanceAfter: "10.000", unitCostUsd: "5.0000", referenceType: "adjustment", referenceId: draft.id });

      // A decrease uses the average cost and keeps the running balance.
      const out = await saveAdjustmentDraft({ reasonId: f.reasons.decrease, lines: [{ productId: product.id, quantity: "3", direction: "out" }] }, actor, f.tx);
      const appliedOut = await applyAdjustment(out.id, actor, f.tx);
      expect(Number(appliedOut.number.slice(2))).toBe(Number(applied.number.slice(2)) + 1);
      const after = await listMovements({ productId: product.id, dbx: f.tx });
      expect(after.rows[0]).toMatchObject({ type: "adjust_out", quantity: "-3.000", balanceAfter: "7.000", unitCostUsd: "5.0000" });

      // Applied documents cannot be applied or cancelled twice.
      await expect(applyAdjustment(draft.id, actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });
      await expect(cancelAdjustment(draft.id, actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  it("rejects negative stock unless the policy allows it", async () => {
    await withFixtures(async (f) => {
      const product = await f.createProduct();
      const actor = { id: f.userId };
      await applyMovements(f.tx, [{ productId: product.id, warehouseId: f.warehouseId, type: "initial", quantity: "2", unitCostUsd: "1", userId: f.userId }]);

      const draft = await saveAdjustmentDraft({ reasonId: f.reasons.decrease, lines: [{ productId: product.id, quantity: "5", direction: "out" }] }, actor, f.tx);
      const err = await applyAdjustment(draft.id, actor, f.tx).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("INSUFFICIENT_STOCK");

      // The failed attempt left nothing behind: still a draft, stock untouched.
      const [adj] = await f.tx.select().from(s.inventoryAdjustments).where(eq(s.inventoryAdjustments.id, draft.id));
      expect(adj.status).toBe("draft");
      expect(adj.number).toBeNull();

      await f.setPolicies({ allowNegativeStock: true });
      await applyAdjustment(draft.id, actor, f.tx);
      const [stock] = await f.tx.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, product.id), eq(s.stockLevels.warehouseId, f.warehouseId)));
      expect(stock.quantity).toBe("-3.000");
    });
  });

  it("forces the sign from the reason kind and validates the reason", async () => {
    await withFixtures(async (f) => {
      const product = await f.createProduct();
      const actor = { id: f.userId };
      // "Merma" is a decrease: direction "in" is ignored.
      const draft = await saveAdjustmentDraft({ reasonId: f.reasons.decrease, lines: [{ productId: product.id, quantity: "1", direction: "in" }] }, actor, f.tx);
      const [item] = await f.tx.select().from(s.inventoryAdjustmentItems).where(eq(s.inventoryAdjustmentItems.adjustmentId, draft.id));
      expect(item.quantityDelta).toBe("-1.000");

      await expect(
        saveAdjustmentDraft({ reasonId: "00000000-0000-0000-0000-000000000000", lines: [{ productId: product.id, quantity: "1", direction: "in" }] }, actor, f.tx),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });
});

describe.skipIf(skip)("stock counts", () => {
  it("creates count_adjust movements only for the differences", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const a = await f.createProduct({ name: "A", costAvgUsd: "2" });
      const b = await f.createProduct({ name: "B", costAvgUsd: "3" });
      const c = await f.createProduct({ name: "C", costAvgUsd: "4" });
      await applyMovements(f.tx, [
        { productId: a.id, warehouseId: f.warehouseId, type: "initial", quantity: "5", unitCostUsd: "2", userId: f.userId },
        { productId: b.id, warehouseId: f.warehouseId, type: "initial", quantity: "8", unitCostUsd: "3", userId: f.userId },
        { productId: c.id, warehouseId: f.warehouseId, type: "initial", quantity: "1", unitCostUsd: "4", userId: f.userId },
      ]);

      const created = await createCount({ categoryId: f.categoryId, blind: true }, actor, f.tx);
      expect(created.itemCount).toBe(3);
      const detail = (await getCount(created.id, f.tx))!;
      expect(detail.status).toBe("open");
      expect(detail.items.map((i) => i.expectedQty).sort()).toEqual(["1.000", "5.000", "8.000"]);

      const itemA = detail.items.find((i) => i.productId === a.id)!;
      const itemB = detail.items.find((i) => i.productId === b.id)!;
      await recordCountItem({ countId: created.id, itemId: itemA.id, countedQty: "5" }, actor, f.tx); // no difference
      await recordCountItem({ countId: created.id, itemId: itemB.id, countedQty: "10" }, actor, f.tx); // +2
      // C is not counted.

      const applied = await applyCount(created.id, actor, f.tx);
      expect(applied.number).toMatch(/^I-\d{6}$/);
      expect(applied.adjusted).toBe(1);

      const movements = await listMovements({ referenceType: "count", referenceId: created.id, dbx: f.tx });
      expect(movements.total).toBe(1);
      expect(movements.rows[0]).toMatchObject({ type: "count_adjust", productId: b.id, quantity: "2.000", balanceAfter: "10.000", unitCostUsd: "3.0000", reasonName: "Error de conteo" });

      const stocks = await f.tx.select().from(s.stockLevels).where(eq(s.stockLevels.warehouseId, f.warehouseId));
      const qty = (id: string) => stocks.find((r) => r.productId === id)!.quantity;
      expect(qty(a.id)).toBe("5.000");
      expect(qty(b.id)).toBe("10.000");
      expect(qty(c.id)).toBe("1.000");

      const after = (await getCount(created.id, f.tx))!;
      expect(after.status).toBe("applied");
      expect(after.differences).toBe(1);
      expect(after.differenceValueUsd).toBe("6.0000");
      await expect(recordCountItem({ countId: created.id, itemId: itemA.id, countedQty: "1" }, actor, f.tx)).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  it("can add a product found during the count and refuses to apply an empty count", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const a = await f.createProduct({ name: "A" });
      const other = await f.createProduct({ name: "Fuera de categoría", categoryId: null });
      await applyMovements(f.tx, [{ productId: a.id, warehouseId: f.warehouseId, type: "initial", quantity: "5", unitCostUsd: "1", userId: f.userId }]);

      const created = await createCount({ categoryId: f.categoryId, blind: false }, actor, f.tx);
      expect(created.itemCount).toBe(1);
      await expect(applyCount(created.id, actor, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });

      const added = await addCountItem({ countId: created.id, productId: other.id }, actor, f.tx);
      expect(added.expectedQty).toBe("0.000");
      await recordCountItem({ countId: created.id, itemId: added.id, countedQty: "2" }, actor, f.tx);
      const applied = await applyCount(created.id, actor, f.tx);
      expect(applied.adjusted).toBe(1);
      const [stock] = await f.tx.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, other.id), eq(s.stockLevels.warehouseId, f.warehouseId)));
      expect(stock.quantity).toBe("2.000");
    });
  });

  it("rejects a count with no matching products", async () => {
    await withFixtures(async (f) => {
      await expect(createCount({ locationPrefix: "ZZZ-NO-EXISTE", blind: true }, { id: f.userId }, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });
});

describe.skipIf(skip)("stock list, settings and alerts", () => {
  it("computes the manual traffic light and the inventory value", async () => {
    await withFixtures(async (f) => {
      const actor = { id: f.userId };
      const low = await f.createProduct({ name: "Bajo", costAvgUsd: "2.5" });
      const fine = await f.createProduct({ name: "Bien", costAvgUsd: "1" });
      const over = await f.createProduct({ name: "Exceso", costAvgUsd: "1" });
      const empty = await f.createProduct({ name: "Agotado", costAvgUsd: "9" });
      await applyMovements(f.tx, [
        { productId: low.id, warehouseId: f.warehouseId, type: "initial", quantity: "2", unitCostUsd: "2.5", userId: f.userId },
        { productId: fine.id, warehouseId: f.warehouseId, type: "initial", quantity: "10", unitCostUsd: "1", userId: f.userId },
        { productId: over.id, warehouseId: f.warehouseId, type: "initial", quantity: "50", unitCostUsd: "1", userId: f.userId },
      ]);
      const base = { minStock: "5", maxStock: "20", reorderPoint: "0", reorderQty: "10", mode: "manual" as const };
      await upsertStockSettings({ productId: low.id, ...base }, f.userId, f.tx);
      await upsertStockSettings({ productId: fine.id, ...base }, f.userId, f.tx);
      await upsertStockSettings({ productId: over.id, ...base }, f.userId, f.tx);
      await upsertStockSettings({ productId: empty.id, ...base }, f.userId, f.tx);
      await expect(upsertStockSettings({ productId: low.id, ...base, maxStock: "4" }, f.userId, f.tx)).rejects.toMatchObject({ code: "VALIDATION" });

      const list = await listStock({ dbx: f.tx, warehouseId: f.warehouseId, categoryId: f.categoryId });
      const status = (id: string) => list.rows.find((r) => r.productId === id)!.status;
      expect(status(low.id)).toBe("buy_now");
      expect(status(fine.id)).toBe("ok");
      expect(status(over.id)).toBe("excess");
      expect(status(empty.id)).toBe("buy_now");
      // 2 × 2.5 + 10 × 1 + 50 × 1 = 65
      expect(list.totalValueUsd).toBe("65.0000");

      const onlyLow = await listStock({ dbx: f.tx, warehouseId: f.warehouseId, categoryId: f.categoryId, status: "buy_now" });
      expect(onlyLow.rows.map((r) => r.productId).sort()).toEqual([low.id, empty.id].sort());

      const alerts = await getAlerts(f.tx);
      expect(alerts.buyNow.some((r) => r.productId === low.id)).toBe(true);
      expect(alerts.excess.some((r) => r.productId === over.id)).toBe(true);
      expect(alerts.outOfStock.some((r) => r.productId === empty.id)).toBe(true);
      expect(alerts.noMovement.some((r) => r.productId === fine.id)).toBe(true);
      void actor;
    });
  });
});
