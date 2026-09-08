import "./load-env";
import { createSession } from "./lib/session";

/**
 * Smoke test for Paquete E (reports) against the running dev server:
 *   pnpm exec tsx scripts/smoke-reports.ts [baseUrl]
 */
async function main() {
  const base = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
  let failures = 0;
  const check = (ok: boolean, label: string, note = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${note ? `  (${note})` : ""}`);
  };

  // Unauthenticated: exports need a session (the proxy redirects to /login first; the route itself answers 401);
  // the cron needs its secret (or development mode).
  const anonExport = await fetch(`${base}/api/reports/export?report=sales`, { redirect: "manual" });
  const anonLocation = anonExport.headers.get("location") ?? "";
  const anonBlocked = anonExport.status === 401 || (anonExport.status >= 300 && anonExport.status < 400 && anonLocation.includes("/login"));
  check(anonBlocked, `anon GET /api/reports/export -> ${anonExport.status}`, "expected 401 or redirect to /login");

  const cron = await fetch(`${base}/api/cron/stats`, { redirect: "manual" });
  const cronExpected = process.env.CRON_SECRET ? 401 : 200;
  check(cron.status === cronExpected, `anon GET /api/cron/stats -> ${cron.status}`, `expected ${cronExpected}`);
  if (process.env.CRON_SECRET) {
    const withSecret = await fetch(`${base}/api/cron/stats`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const json = (await withSecret.json().catch(() => ({}))) as { ok?: boolean; products?: number };
    check(withSecret.status === 200 && json.ok === true, `GET /api/cron/stats with secret -> ${withSecret.status}`, `products=${json.products ?? "?"}`);
  } else {
    const json = (await cron.json().catch(() => ({}))) as { ok?: boolean; products?: number };
    check(json.ok === true, "cron response body", `products=${json.products ?? "?"}`);
  }

  const s = await createSession({ base });
  await s.expectOk("/inicio", "Resumen del día");
  await s.expectOk("/reportes", "Reportes");
  await s.expectOk("/reportes/ventas", "Ventas");
  await s.expectOk("/reportes/ventas?preset=last_30", "Últimos 30 días");
  await s.expectOk("/reportes/ventas?from=2026-01-01&to=2026-01-31", "Del 01/01/2026 al 31/01/2026");
  await s.expectOk("/reportes/inventario", "Inventario valorizado");
  await s.expectOk("/reportes/inventario?sort=name", "Inventario valorizado");
  await s.expectOk("/reportes/velocidad", "Velocidad de venta");
  await s.expectOk("/reportes/velocidad?status=buy_now&sort=cover", "Velocidad de venta");
  await s.expectOk("/reportes/margen", "Margen bruto");
  await s.expectOk("/reportes/sin-movimiento", "sin movimiento");
  await s.expectOk("/reportes/sin-movimiento?days=30", "30 días");

  for (const report of ["sales", "inventory", "velocity", "margin", "no_movement"]) {
    const res = await s.get(`/api/reports/export?report=${report}`);
    const type = res.headers.get("content-type") ?? "";
    const size = (await res.arrayBuffer()).byteLength;
    check(res.status === 200 && type.includes("spreadsheetml") && size > 1000, `GET /api/reports/export?report=${report} -> ${res.status}`, `${type.split(";")[0]} ${size} bytes`);
  }
  const bad = await s.get("/api/reports/export?report=nope");
  check(bad.status === 400, `GET /api/reports/export?report=nope -> ${bad.status}`, "expected 400");

  failures += s.failures;
  console.log(failures === 0 ? "\nReports smoke test passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
