import { describe, expect, it } from "vitest";
import { businessDate } from "@/lib/format";
import { applyMovements } from "@/modules/inventory/application/stock";
import { getAdjustmentsReport } from "@/modules/reporting/infrastructure/adjustments-report";
import { adjustmentsSheets } from "@/modules/reporting/infrastructure/excel";
import { buildReportPdf } from "@/modules/reporting/infrastructure/report-pdf";
import { withFixtures } from "./inventory-fixtures";

const skip = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(skip)("adjustments report", () => {
  it("values losses and surpluses by reason and product, leaving out import corrections", async () => {
    await withFixtures(async (f) => {
      const a = await f.createProduct({ name: "Relé A" });
      const b = await f.createProduct({ name: "Termostato B" });
      const base = { warehouseId: f.warehouseId, userId: f.userId };
      await applyMovements(f.tx, [
        { ...base, productId: a.id, type: "initial", quantity: "10", unitCostUsd: "2" },
        { ...base, productId: b.id, type: "initial", quantity: "5", unitCostUsd: "4" },
      ]);
      await applyMovements(f.tx, [
        { ...base, productId: a.id, type: "adjust_out", quantity: "-3", unitCostUsd: "2", reasonId: f.reasons.decrease, referenceType: "adjustment" },
        { ...base, productId: b.id, type: "count_adjust", quantity: "1", unitCostUsd: "4", reasonId: f.reasons.count, referenceType: "count" },
        { ...base, productId: b.id, type: "count_adjust", quantity: "-2", unitCostUsd: "4", reasonId: f.reasons.count, referenceType: "count" },
        // Undoing an Excel import is a correction, not a loss.
        { ...base, productId: a.id, type: "adjust_out", quantity: "-1", unitCostUsd: "2", referenceType: "import_job" },
      ]);

      const today = businessDate();
      const report = await getAdjustmentsReport({ from: today, to: today, preset: "today" }, { db: f.tx, warehouseId: f.warehouseId });
      expect(report.totals).toMatchObject({ movements: 3, unitsOut: "5.000", unitsIn: "1.000", valueOut: "14.0000", valueIn: "4.0000", net: "-10.0000" });
      expect(report.byReason.find((r) => r.id === f.reasons.decrease)).toMatchObject({ movements: 1, valueOut: "6.0000", net: "-6.0000" });
      expect(report.byReason.find((r) => r.id === f.reasons.count)).toMatchObject({ movements: 2, valueIn: "4.0000", valueOut: "8.0000", net: "-4.0000" });
      // Worst net loss first.
      expect(report.byProduct.map((p) => p.id)).toEqual([a.id, b.id]);
      expect(report.products).toBe(2);
      expect(report.movements).toHaveLength(3);
      expect(report.movements.find((m) => m.productId === a.id)?.value).toBe("-6.0000");

      const pdf = await buildReportPdf(adjustmentsSheets(report), { companyName: "Prueba", title: "Ajustes y mermas" });
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    });
  });
});
