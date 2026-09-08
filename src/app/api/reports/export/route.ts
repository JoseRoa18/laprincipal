import { NextResponse, type NextRequest } from "next/server";
import { can, getSessionUser } from "@/lib/auth-guards";
import { businessDate } from "@/lib/format";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import type { AbcClass, StockStatus } from "@/modules/inventory/domain/velocity";
import { parseDateRange } from "@/modules/reporting/domain/date-range";
import { buildWorkbook, inventorySheets, marginSheets, noMovementSheets, salesSheets, velocitySheets, type Sheet } from "@/modules/reporting/infrastructure/excel";
import { getInventoryValuation, type InventorySort } from "@/modules/reporting/infrastructure/inventory-report";
import { getMarginReport } from "@/modules/reporting/infrastructure/margin-report";
import { getNoMovementReport } from "@/modules/reporting/infrastructure/no-movement-report";
import { getSalesReport } from "@/modules/reporting/infrastructure/sales-report";
import { getVelocityReport, STATUS_ORDER, type VelocitySort } from "@/modules/reporting/infrastructure/velocity-report";
import { getStatsSettings } from "@/modules/settings/infrastructure/settings";

export const maxDuration = 60;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * Excel export of a report with its current filters:
 *   /api/reports/export?report=sales&from=2026-09-01&to=2026-09-08
 *   report = sales | inventory | velocity | margin | no_movement
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!can(user.role, "reports")) return NextResponse.json({ error: "No tienes permiso para exportar reportes." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const params = Object.fromEntries(sp.entries());
  const today = businessDate();
  let sheets: Sheet[];
  let filename: string;

  try {
    switch (sp.get("report")) {
      case "sales": {
        const range = parseDateRange(params, today);
        sheets = salesSheets(await getSalesReport(range));
        filename = `ventas_${range.from}_${range.to}.xlsx`;
        break;
      }
      case "inventory": {
        const [valuation, rates] = await Promise.all([
          getInventoryValuation({ sort: oneOf<InventorySort>(sp.get("sort"), ["value", "qty", "name"]) }),
          getRatesSnapshot(),
        ]);
        sheets = inventorySheets(valuation, rates.rateSet);
        filename = `inventario_valorizado_${today}.xlsx`;
        break;
      }
      case "velocity": {
        const report = await getVelocityReport({
          status: oneOf<StockStatus>(sp.get("status"), STATUS_ORDER),
          abc: oneOf<AbcClass>(sp.get("abc"), ["A", "B", "C"]),
          categoryId: sp.get("category") || undefined,
          sort: oneOf<VelocitySort>(sp.get("sort"), ["velocity", "cover", "name"]),
          pageSize: 100_000,
        });
        sheets = velocitySheets(report.rows, report.computedAt);
        filename = `velocidad_de_venta_${today}.xlsx`;
        break;
      }
      case "margin": {
        const range = parseDateRange(params, today);
        sheets = marginSheets(await getMarginReport(range));
        filename = `margen_${range.from}_${range.to}.xlsx`;
        break;
      }
      case "no_movement": {
        const settings = await getStatsSettings();
        const requested = Number(sp.get("days"));
        const days = Number.isInteger(requested) && requested >= 7 && requested <= 730 ? requested : settings.noMovementDays;
        sheets = noMovementSheets(await getNoMovementReport({ days }));
        filename = `sin_movimiento_${days}d_${today}.xlsx`;
        break;
      }
      default:
        return NextResponse.json({ error: "Reporte desconocido." }, { status: 400 });
    }
    const body = await buildWorkbook(sheets);
    return new NextResponse(body, {
      headers: {
        "content-type": XLSX,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[reports/export]", err);
    return NextResponse.json({ error: "No se pudo generar el archivo." }, { status: 500 });
  }
}
