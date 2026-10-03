import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseImportWorkbook } from "./excel";

async function workbook(rows: Array<Record<string, ExcelJS.CellValue>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Productos");
  ws.columns = [
    { header: "Nombre*", key: "name" },
    { header: "Precio público USD*", key: "publicPrice" },
    { header: "Costo USD", key: "cost" },
    { header: "Stock inicial", key: "initialStock" },
    { header: "Código de barras", key: "barcode" },
  ];
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseImportWorkbook", () => {
  it("reads numbers as Excel stored them, not as thousands", async () => {
    const parsed = await parseImportWorkbook(await workbook([{ name: "Cable", publicPrice: 2.375, cost: 1.125, initialStock: 13.608, barcode: "7591234567890" }]));
    // "1,125" and friends: the decimal comma the number parser reads as a decimal.
    expect(parsed.rows[0].values).toMatchObject({ publicPrice: "2,375", cost: "1,125", initialStock: "13,608" });
  });

  it("restores the leading zero of a UPC stored as a number", async () => {
    const parsed = await parseImportWorkbook(await workbook([{ name: "Relé", publicPrice: 5, barcode: 36000291452 }]));
    expect(parsed.rows[0].values.barcode).toBe("036000291452");
  });
});
