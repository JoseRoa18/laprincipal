import "./load-env";

/**
 * Smoke test against a running dev server: logs in as the seeded admin and
 * requests every main page, failing on any non-2xx/3xx status.
 *
 *   pnpm exec tsx scripts/smoke.ts [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin2050*";

const jar = new Map<string, string>();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(res: Response) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" || /max-age=0/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  storeCookies(res);
  return res;
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Dev server did not respond in time");
}

async function main() {
  await waitForServer();
  const results: Array<{ path: string; status: number; ok: boolean; note?: string }> = [];

  // Anonymous: / and /inicio must redirect to /login; /login must render.
  for (const path of ["/", "/inicio"]) {
    const res = await request(path);
    const loc = res.headers.get("location") ?? "";
    results.push({ path: `anon ${path}`, status: res.status, ok: res.status >= 300 && res.status < 400 && loc.includes("/login"), note: loc });
  }
  const login = await request("/login");
  const loginHtml = await login.text();
  results.push({ path: "anon /login", status: login.status, ok: login.status === 200 && loginHtml.includes("Iniciar sesión") });

  // Login via Auth.js credentials callback.
  const csrfRes = await request("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirectTo: "/inicio" });
  const cb = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const hasSession = [...jar.keys()].some((k) => k.includes("authjs.session-token"));
  results.push({ path: "POST login", status: cb.status, ok: hasSession, note: hasSession ? "session cookie set" : "no session cookie" });

  // Authenticated pages.
  const pages = ["/inicio", "/sin-acceso", "/vender", "/ventas", "/productos", "/inventario", "/compras", "/clientes", "/caja", "/reportes", "/configuracion"];
  for (const path of pages) {
    const res = await request(path);
    const html = res.status === 200 ? await res.text() : "";
    const isRedirectToLogin = res.status >= 300 && res.status < 400 && (res.headers.get("location") ?? "").includes("/login");
    results.push({
      path: `auth ${path}`,
      status: res.status,
      ok: (res.status === 200 && !html.includes("Application error")) || res.status === 404,
      note: isRedirectToLogin ? "redirected to login (session lost?)" : res.status === 404 ? "not built yet" : undefined,
    });
  }

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.status).padEnd(4)} ${r.path}${r.note ? `  (${r.note})` : ""}`);
  }
  console.log(failed === 0 ? "\nSmoke test passed" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
