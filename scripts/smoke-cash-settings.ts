import "./load-env";
import { createSession } from "./lib/session";

/**
 * Smoke test for Paquete D (caja, clientes, configuración) against the running
 * dev server. Logs in as the seeded admin and requests every screen.
 *
 *   pnpm exec tsx scripts/smoke-cash-settings.ts [baseUrl]
 */
const PAGES: Array<[path: string, mustContain: string]> = [
  ["/caja", "Caja"],
  ["/caja/historial", "Historial de cajas"],
  ["/clientes", "Clientes"],
  ["/clientes/nuevo", "Nuevo cliente"],
  ["/configuracion", "Configuración"],
  ["/configuracion/empresa", "Empresa"],
  ["/configuracion/tasas", "Tasas de cambio"],
  ["/configuracion/impuestos", "Impuestos"],
  ["/configuracion/metodos-de-pago", "Métodos de pago"],
  ["/configuracion/motivos", "Motivos"],
  ["/configuracion/unidades", "Unidades"],
  ["/configuracion/series", "Series"],
  ["/configuracion/impresion", "Impresión"],
  ["/configuracion/politicas", "Políticas"],
  ["/configuracion/usuarios", "Usuarios"],
  ["/configuracion/mi-cuenta", "Mi cuenta"],
  ["/configuracion/respaldos", "Respaldos"],
];

async function main() {
  const session = await createSession({ base: process.argv[2] });
  for (const [path, text] of PAGES) {
    await session.expectOk(path, text);
  }

  // /caja/cerrar redirects to /caja when the drawer is closed; otherwise it renders the blind count.
  const close = await session.get("/caja/cerrar");
  const location = close.headers.get("location") ?? "";
  const closeOk = close.status === 200 || (close.status >= 300 && close.status < 400 && location.includes("/caja"));
  if (!closeOk) session.failures++;
  console.log(`${closeOk ? "PASS" : "FAIL"}  ${String(close.status).padEnd(4)} /caja/cerrar${location ? `  (-> ${location})` : ""}`);

  // Excel export must answer with a spreadsheet.
  const xlsx = await session.get("/api/backups/export?type=products");
  const xlsxOk = xlsx.status === 200 && (xlsx.headers.get("content-type") ?? "").includes("spreadsheetml");
  if (!xlsxOk) session.failures++;
  console.log(`${xlsxOk ? "PASS" : "FAIL"}  ${String(xlsx.status).padEnd(4)} /api/backups/export?type=products`);

  // Cron endpoint refuses requests without the secret (401), or 500 when CRON_SECRET is not configured.
  // Until src/proxy.ts excludes /api/cron from the auth matcher, anonymous requests are redirected to /login.
  const cron = await fetch(`${session.base}/api/cron/backup`, { redirect: "manual" });
  const cronLocation = cron.headers.get("location") ?? "";
  const cronOk = cron.status === 401 || cron.status === 500 || (cron.status >= 300 && cron.status < 400 && cronLocation.includes("/login"));
  if (!cronOk) session.failures++;
  console.log(`${cronOk ? "PASS" : "FAIL"}  ${String(cron.status).padEnd(4)} /api/cron/backup (sin token)${cronLocation ? `  (-> ${cronLocation})` : ""}`);

  console.log(session.failures === 0 ? "\nSmoke test passed" : `\n${session.failures} check(s) failed`);
  process.exit(session.failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
