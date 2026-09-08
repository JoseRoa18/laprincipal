/**
 * Minimal HTTP session for smoke scripts: cookie jar + Auth.js credentials login.
 *
 *   const s = await createSession();          // logs in as the seeded admin
 *   const res = await s.get("/productos");     // follows nothing, returns Response
 *   await s.expectOk("/productos", "Productos");
 */
export interface SmokeSession {
  base: string;
  get(path: string, init?: RequestInit): Promise<Response>;
  post(path: string, body: URLSearchParams | FormData | string, init?: RequestInit): Promise<Response>;
  /** Asserts status 200 and optional text in the HTML; prints PASS/FAIL and returns ok. */
  expectOk(path: string, mustContain?: string): Promise<boolean>;
  failures: number;
}

export async function createSession(opts: { base?: string; email?: string; password?: string } = {}): Promise<SmokeSession> {
  const base = opts.base ?? process.env.APP_URL ?? "http://localhost:3000";
  const email = opts.email ?? process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com";
  const password = opts.password ?? process.env.ADMIN_PASSWORD ?? "Admin2050*";
  const jar = new Map<string, string>();

  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const store = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "" || /max-age=0/i.test(c)) jar.delete(name);
      else jar.set(name, value);
    }
  };
  const request = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
    });
    store(res);
    return res;
  };

  // Wait for the server.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/login`, { redirect: "manual" });
      if (res.status < 500) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const csrf = (await (await request("/api/auth/csrf")).json()) as { csrfToken: string };
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, redirectTo: "/inicio" }),
  });
  if (![...jar.keys()].some((k) => k.includes("authjs.session-token"))) {
    throw new Error("Login failed: no session cookie");
  }

  const session: SmokeSession = {
    base,
    failures: 0,
    get: (path, init) => request(path, init),
    post: (path, body, init) =>
      request(path, {
        ...init,
        method: "POST",
        body,
        headers: {
          ...(init?.headers ?? {}),
          ...(typeof body === "string" ? { "content-type": "application/json" } : {}),
        },
      }),
    async expectOk(path, mustContain) {
      const res = await request(path);
      const html = res.status === 200 ? await res.text() : "";
      const ok = res.status === 200 && !html.includes("Application error") && (!mustContain || html.includes(mustContain));
      if (!ok) session.failures++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${String(res.status).padEnd(4)} ${path}${mustContain && !html.includes(mustContain) && res.status === 200 ? `  (missing "${mustContain}")` : ""}`);
      return ok;
    },
  };
  return session;
}
