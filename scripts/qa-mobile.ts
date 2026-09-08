import "./load-env";

/**
 * Mobile responsiveness crawler. Logs in as the seeded admin, visits every
 * screen at phone (390×844) and tablet (768×1024) sizes, opens the main
 * dialogs and reports, per screen:
 *
 *   - horizontal overflow (document wider than the viewport) and the elements
 *     that stick out of the right edge,
 *   - touch targets smaller than 40×40 px,
 *   - text smaller than 12 px and form controls with a font smaller than 16 px
 *     (iOS zooms into them on focus),
 *   - content hidden behind the bottom navigation or a fixed action bar.
 *
 * Screenshots go to qa/mobile/<viewport>/<route>.png and the report to
 * qa/mobile/report.md.
 *
 *   pnpm exec tsx scripts/qa-mobile.ts                 # everything
 *   pnpm exec tsx scripts/qa-mobile.ts --only=vender   # routes containing "vender"
 *   pnpm exec tsx scripts/qa-mobile.ts --viewport=phone --no-dialogs --no-screens
 *   pnpm exec tsx scripts/qa-mobile.ts --seed          # create a supplier and a customer through the
 *                                                      # real forms when the database has none (so the
 *                                                      # receipt form and detail pages get covered) and
 *                                                      # delete them at the end (--keep-seed keeps them)
 *
 * Requires the dev server (pnpm dev) and the local database.
 */
import { chromium, request as playwrightRequest, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin2050*";
const OUT_DIR = path.resolve("qa/mobile");
const TARGET_MIN = 40;

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, "").split("=");
  args.set(k, v ?? "1");
}
const ONLY = args.get("only") ?? "";
const VIEWPORT_FILTER = args.get("viewport") ?? "";
const SCREENSHOTS = !args.has("no-screens");
const DIALOGS = !args.has("no-dialogs");
const SEED = args.has("seed");
const KEEP_SEED = args.has("keep-seed");

type ViewportName = "phone" | "tablet";
const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
};

// ---------------------------------------------------------------------------
// In-page audit
// ---------------------------------------------------------------------------

interface AuditOptions {
  rootSelector: string | null;
  targetMin: number;
  /** Check content vs. bottom overlays (bottom nav, fixed action bars). */
  checkBottom: boolean;
  /**
   * Device width. Chrome's mobile emulation widens `window.innerWidth` to fit
   * overflowing content, so overflow is measured against this value instead.
   */
  deviceWidth: number;
}

interface AuditResult {
  innerWidth: number;
  scrollWidth: number;
  coarsePointer: boolean;
  pageOverflow: boolean;
  offenders: string[];
  smallTargets: Array<{ desc: string; w: number; h: number; inline: boolean }>;
  smallText: Array<{ desc: string; size: number }>;
  smallInputs: Array<{ desc: string; size: number }>;
  bottom: { overlayTop: number; contentBottom: number; covered: boolean; by: string; what: string } | null;
  notes: string[];
}

/** Runs inside the browser. Keep it self-contained (no outer-scope references). */
function auditInPage(opts: AuditOptions): AuditResult | null {
  const iw = opts.deviceWidth;
  const ih = window.innerHeight;
  const doc = document.documentElement;
  const root: Element | null = opts.rootSelector ? document.querySelector(opts.rootSelector) : document.body;
  if (!root) return null;

  const style = (el: Element) => getComputedStyle(el);
  const descOf = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === "nextjs-portal") return tag;
    const id = el.id ? `#${el.id}` : "";
    const rawClass = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : (el.getAttribute("class") ?? "");
    const cls = rawClass
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("data-") && c.length < 40)
      .slice(0, 5)
      .join(".");
    const role = el.getAttribute("role");
    const slot = el.getAttribute("data-slot");
    const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "";
    const text = ((el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${tag}${id}${cls ? `.${cls}` : ""}${slot ? ` slot=${slot}` : ""}${role ? ` role=${role}` : ""}${label ? ` [${label}]` : ""}${text ? ` "${text}"` : ""}`;
  };
  const isVisible = (el: Element): boolean => {
    const s = style(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 || r.height > 1;
  };
  const inHiddenSubtree = (el: Element): boolean => el.closest('[aria-hidden="true"],[inert],[hidden],nextjs-portal,[data-sonner-toaster]') !== null;
  const clippingAncestor = (el: Element): Element | null => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = style(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return p;
    }
    return null;
  };
  const insideFixed = (el: Element): boolean => {
    for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
      if (style(p).position === "fixed") return true;
    }
    return false;
  };

  // --- Horizontal overflow -------------------------------------------------
  const raw: Array<{ el: Element; right: number }> = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NEXTJS-PORTAL") continue;
    if (!isVisible(el) || inHiddenSubtree(el)) continue;
    const r = el.getBoundingClientRect();
    let right = r.right;
    // Text longer than its box counts only when the element itself does not clip it (`truncate` is fine).
    if (style(el).overflowX === "visible") {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rr = range.getBoundingClientRect();
          if (rr.width > 0) right = Math.max(right, rr.right);
        }
      }
    }
    if (right <= iw + 1) continue;
    const clip = clippingAncestor(el);
    if (clip && clip.getBoundingClientRect().right <= iw + 1) continue;
    if (style(el).position === "fixed" && r.left >= iw - 1) continue; // parked off-screen (closed sheet)
    raw.push({ el, right });
  }
  const deepest = raw.filter(({ el, right }) => !raw.some((o) => o.el !== el && el.contains(o.el) && o.right >= right - 1));
  deepest.sort((a, b) => b.right - a.right);
  const offenders = deepest.slice(0, 12).map(({ el, right }) => `${descOf(el)} → derecha ${Math.round(right)}px (+${Math.round(right - iw)})`);

  // --- Touch targets -------------------------------------------------------
  // The tappable box: the element, enlarged by an absolutely positioned ::after
  // (shadcn checkbox/radio/switch hit areas) or, for native checkboxes and
  // radios, the <label> that wraps them.
  const hitRect = (el: Element): DOMRect => {
    let r = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    if (after.content !== "none" && after.position === "absolute") {
      const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
      const t = px(after.top);
      const b = px(after.bottom);
      const l = px(after.left);
      const rt = px(after.right);
      // Only a box that extends past every edge is a hit area (not, say, a tab underline with a positive top).
      const expands = t <= 0 && b <= 0 && l <= 0 && rt <= 0 && (t < 0 || b < 0 || l < 0 || rt < 0);
      if (expands) r = new DOMRect(r.left + l, r.top + t, r.width - l - rt, r.height - t - b);
    }
    const input = el as HTMLInputElement;
    if (el.tagName === "INPUT" && (input.type === "checkbox" || input.type === "radio")) {
      const label = el.closest("label");
      if (label) r = label.getBoundingClientRect();
    }
    return r;
  };
  const smallTargets: AuditResult["smallTargets"] = [];
  const targetSel = 'button, a[href], input, select, textarea, summary, [role="button"], [role="option"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"]';
  for (const el of Array.from(root.querySelectorAll(targetSel))) {
    const input = el as HTMLInputElement;
    if (input.type === "hidden") continue;
    if ((el as HTMLButtonElement).disabled) continue;
    if (el.getAttribute("data-slot") === "sidebar-rail") continue; // desktop drag rail, not a control
    if (!isVisible(el) || inHiddenSubtree(el)) continue;
    const r = hitRect(el);
    if (r.width >= opts.targetMin && r.height >= opts.targetMin) continue;
    const inline = el.tagName === "A" && style(el).display === "inline";
    smallTargets.push({ desc: descOf(el), w: Math.round(r.width), h: Math.round(r.height), inline });
  }

  // --- Small text and small form controls ---------------------------------
  const smallText: AuditResult["smallText"] = [];
  const seenText = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent ?? "").trim()) continue;
    const el = node.parentElement;
    if (!el || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    if (!isVisible(el) || inHiddenSubtree(el) || el.classList.contains("sr-only")) continue;
    const size = parseFloat(style(el).fontSize);
    if (size >= 12) continue;
    const d = descOf(el);
    if (seenText.has(d)) continue;
    seenText.add(d);
    smallText.push({ desc: d, size: Math.round(size * 10) / 10 });
  }
  const smallInputs: AuditResult["smallInputs"] = [];
  const seenInputs = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("input, select, textarea"))) {
    const type = (el as HTMLInputElement).type;
    if (type === "hidden" || type === "checkbox" || type === "radio" || type === "range" || type === "file") continue;
    if (!isVisible(el) || inHiddenSubtree(el)) continue;
    const size = parseFloat(style(el).fontSize);
    if (size >= 16) continue;
    const d = descOf(el);
    if (seenInputs.has(d)) continue;
    seenInputs.add(d);
    smallInputs.push({ desc: d, size: Math.round(size * 10) / 10 });
  }

  // --- Bottom overlays vs. content ----------------------------------------
  let bottom: AuditResult["bottom"] = null;
  const notes: string[] = [];
  if (opts.checkBottom) {
    window.scrollTo(0, doc.scrollHeight);
    const overlays: Array<{ el: Element; top: number }> = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!isVisible(el) || inHiddenSubtree(el)) continue;
      const s = style(el);
      if (s.position !== "fixed" && s.position !== "sticky") continue;
      if (s.position === "sticky" && s.bottom === "auto") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < iw * 0.5) continue;
      if (r.bottom < ih - 2 || r.top < ih * 0.4) continue;
      if (s.pointerEvents === "none") continue;
      overlays.push({ el, top: r.top });
    }
    if (overlays.length > 0) {
      overlays.sort((a, b) => a.top - b.top);
      const overlay = overlays[0];
      let contentBottom = -Infinity;
      let what: Element | null = null;
      const bearsContent = (el: Element) =>
        el.children.length === 0 || Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (!isVisible(el) || inHiddenSubtree(el) || insideFixed(el) || !bearsContent(el)) continue;
        if (el.closest('nav[aria-label="Navegación principal"]')) continue;
        if (overlays.some((o) => o.el === el || o.el.contains(el))) continue;
        const s = style(el);
        if (s.position === "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.height <= 0) continue;
        if (r.bottom > contentBottom) {
          contentBottom = r.bottom;
          what = el;
        }
      }
      bottom = {
        overlayTop: Math.round(overlay.top),
        contentBottom: Math.round(contentBottom),
        covered: contentBottom > overlay.top + 1,
        by: descOf(overlay.el),
        what: what ? descOf(what) : "",
      };
    }
    window.scrollTo(0, 0);
  }

  // Sticky headers that would slide under the app header.
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const s = style(el);
    if (s.position !== "sticky" || s.top === "auto") continue;
    if (!isVisible(el) || inHiddenSubtree(el)) continue;
    if (el.tagName === "HEADER" || el.tagName === "TH") continue;
    const top = parseFloat(s.top);
    if (top < 56) notes.push(`sticky top ${Math.round(top)}px (queda bajo la cabecera de 56px): ${descOf(el)}`);
  }

  if (window.innerWidth > iw + 1) notes.push(`el navegador amplió el viewport a ${window.innerWidth}px para caber el contenido (desborde real)`);

  // Dialog-specific: must fit in the viewport and scroll internally.
  if (opts.rootSelector) {
    const r = root.getBoundingClientRect();
    if (r.left < -1 || r.right > iw + 1) notes.push(`el diálogo se sale horizontalmente (${Math.round(r.left)}..${Math.round(r.right)} de ${iw})`);
    if (r.top < -1 || r.bottom > ih + 1) notes.push(`el diálogo se sale verticalmente (${Math.round(r.top)}..${Math.round(r.bottom)} de ${ih})`);
    const oy = style(root).overflowY;
    if (root.scrollHeight > root.clientHeight + 2 && oy !== "auto" && oy !== "scroll") notes.push("el diálogo tiene contenido recortado sin scroll interno");
  }

  return {
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    pageOverflow: doc.scrollWidth > iw + 1 || window.innerWidth > iw + 1,
    offenders,
    smallTargets,
    smallText,
    smallInputs,
    bottom,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Routes and scenarios
// ---------------------------------------------------------------------------

/** A product line as the POS persists it (zustand `persist`), used to seed the cart without the search API. */
interface SeedProduct {
  id: string;
  sku: string;
  name: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  taxRate: string;
  priceUsd: string;
}

interface Ids {
  productId?: string;
  cartProduct?: SeedProduct;
  saleId?: string;
  returnableSaleId?: string;
  quoteId?: string;
  customerId?: string;
  supplierId?: string;
  receiptId?: string;
  adjustmentId?: string;
  countId?: string;
  cashSessionId?: string;
  cashOpen?: boolean;
}

interface Scenario {
  name: string;
  /** Runs before navigating (e.g. seed localStorage). */
  prepare?: (page: Page) => Promise<void>;
  /** Opens a dialog or changes the page; returns the dialog locator when one is expected. */
  run: (page: Page) => Promise<Locator | null>;
}

/** Seeds the persisted POS/quote cart with one line so the flows work even if /api/sales/products is down. */
function seedCart(storageKey: string, product: SeedProduct | undefined) {
  return async (page: Page) => {
    if (!product) return;
    const line = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      partNumber: product.partNumber,
      unitSymbol: product.unitSymbol,
      unitDecimals: product.unitDecimals,
      taxRate: product.taxRate,
      quantity: "2",
      unitPriceUsd: product.priceUsd,
      discountType: "pct",
      discountValue: "0",
      stockAvailable: "10",
      thumbUrl: null,
    };
    const state = { lines: [line], customer: null, globalDiscount: null, notes: "", heldSaleId: null, holdLabel: null, quoteId: null, quoteNumber: null, supervisor: null };
    const value = JSON.stringify({ state, version: 0 });
    await page.addInitScript(`try { localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(value)}); } catch (e) {}`);
  };
}

interface RouteSpec {
  path: string;
  /** Screenshot/report name (defaults to the path). */
  name?: string;
  anonymous?: boolean;
  print?: boolean;
  scenarios?: Scenario[];
  /** Skip the automatic "click every dialog trigger" pass. */
  noAutoDialogs?: boolean;
}

async function loadIds(): Promise<Ids> {
  const url = process.env.DATABASE_URL;
  if (!url) return {};
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const one = async (sql: string): Promise<string | undefined> => {
      try {
        const r = await client.query<{ id: string }>(sql);
        return r.rows[0]?.id;
      } catch {
        return undefined;
      }
    };
    const ids: Ids = {
      productId: await one("select id from products where is_active order by created_at desc limit 1"),
      saleId: await one("select id from sales where status <> 'held' order by created_at desc limit 1"),
      returnableSaleId: await one("select id from sales where status in ('completed','partially_refunded') order by (status = 'completed') desc, created_at desc limit 1"),
      quoteId: await one("select id from quotes order by created_at desc limit 1"),
      customerId: await one("select id from customers order by created_at desc limit 1"),
      supplierId: await one("select id from suppliers order by created_at desc limit 1"),
      receiptId: await one("select id from purchase_receipts order by created_at desc limit 1"),
      adjustmentId: await one("select id from inventory_adjustments order by created_at desc limit 1"),
      countId: await one("select id from stock_counts order by created_at desc limit 1"),
      cashSessionId: await one("select id from cash_sessions order by (status = 'closed') desc, opened_at desc limit 1"),
    };
    ids.cashOpen = Boolean(await one("select id from cash_sessions where status = 'open' limit 1"));
    if (!ids.productId) ids.productId = await one("select id from products order by created_at desc limit 1");
    try {
      const r = await client.query<{ id: string; sku: string; name: string; part_number: string | null; symbol: string; decimals: number; rate: string; price: string | null }>(
        `select p.id, p.sku, p.name, p.part_number, u.symbol, u.decimals, t.rate,
                (select pli.price_usd from price_list_items pli join price_lists pl on pl.id = pli.price_list_id
                  where pli.product_id = p.id order by pl.is_default desc limit 1) as price
           from products p join units u on u.id = p.unit_id join taxes t on t.id = p.tax_id
          where p.is_active and p.deleted_at is null order by p.created_at desc limit 1`,
      );
      const row = r.rows[0];
      if (row) {
        ids.cartProduct = { id: row.id, sku: row.sku, name: row.name, partNumber: row.part_number, unitSymbol: row.symbol, unitDecimals: row.decimals, taxRate: row.rate, priceUsd: row.price ?? "12.5" };
      }
    } catch {
      /* the POS scenarios fall back to the search box */
    }
    return ids;
  } catch (err) {
    console.warn(`No se pudo leer la base para elegir ids (${(err as Error).message}); se usarán solo rutas estáticas.`);
    return {};
  } finally {
    await client.end().catch(() => undefined);
  }
}

const dialogLocator = (page: Page) => page.locator('[role="dialog"], [role="alertdialog"]').filter({ visible: true }).last();

interface Seeded {
  supplierId?: string;
  customerId?: string;
}

/**
 * --seed: create a supplier and a customer through the real forms when the
 * database has none, so /compras/entradas/nueva renders the form and the
 * detail/edit pages get crawled. They are deleted afterwards (see removeSeed).
 */
const SEED_SUPPLIER = "Proveedor QA móvil";
const SEED_CUSTOMER = "Cliente QA móvil";

/** Seed rows left behind by an interrupted run: reuse them and delete them at the end. */
async function adoptExistingSeed(): Promise<Seeded> {
  const url = process.env.DATABASE_URL;
  if (!url) return {};
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const s = await client.query<{ id: string }>("select id from suppliers where name = $1 limit 1", [SEED_SUPPLIER]);
    const c = await client.query<{ id: string }>("select id from customers where name = $1 limit 1", [SEED_CUSTOMER]);
    return { supplierId: s.rows[0]?.id, customerId: c.rows[0]?.id };
  } catch {
    return {};
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function seedSampleData(browser: Browser, state: StorageState, ids: Ids): Promise<Seeded> {
  const created: Seeded = await adoptExistingSeed();
  if (created.supplierId) console.log(`Semilla: se reutiliza el proveedor ${created.supplierId}`);
  if (created.customerId) console.log(`Semilla: se reutiliza el cliente ${created.customerId}`);
  const context = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const idFromUrl = (re: RegExp) => page.url().match(re)?.[1];
  try {
    if (!ids.supplierId && !created.supplierId) {
      await page.goto(`${BASE}/compras/proveedores/nuevo`, { waitUntil: "load", timeout: 120_000 });
      await page.fill("#supplier-name", SEED_SUPPLIER);
      await page.getByRole("button", { name: /Crear proveedor/ }).click();
      await page.waitForURL(/\/compras\/proveedores\/[0-9a-f-]{36}$/, { timeout: 60_000 });
      created.supplierId = idFromUrl(/\/compras\/proveedores\/([0-9a-f-]{36})$/);
      console.log(`Semilla: proveedor ${created.supplierId}`);
    }
    if (!ids.customerId && !created.customerId) {
      await page.goto(`${BASE}/clientes/nuevo`, { waitUntil: "load", timeout: 120_000 });
      await page.fill("#name", SEED_CUSTOMER);
      await page.getByRole("button", { name: /^Guardar$/ }).click();
      await page.waitForURL(/\/clientes\/[0-9a-f-]{36}$/, { timeout: 60_000 });
      created.customerId = idFromUrl(/\/clientes\/([0-9a-f-]{36})$/);
      console.log(`Semilla: cliente ${created.customerId}`);
    }
  } catch (err) {
    console.warn(`No se pudo crear la semilla: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  return created;
}

async function removeSeed(created: Seeded) {
  if (!created.supplierId && !created.customerId) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    if (created.supplierId) await client.query("delete from suppliers where id = $1", [created.supplierId]);
    if (created.customerId) await client.query("delete from customers where id = $1", [created.customerId]);
    console.log("Semilla eliminada.");
  } catch (err) {
    console.warn(`No se pudo borrar la semilla (${(err as Error).message}); bórrala a mano: proveedor ${created.supplierId ?? "—"}, cliente ${created.customerId ?? "—"}.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function addFirstProductToCart(page: Page, inputSelector: string, term = "SMK"): Promise<boolean> {
  const input = page.locator(inputSelector).first();
  if (!(await input.isVisible().catch(() => false))) return false;
  await input.fill(term);
  const option = page.locator('[role="option"]').first();
  try {
    await option.waitFor({ state: "visible", timeout: 6_000 });
  } catch {
    await input.fill("");
    return false;
  }
  await option.click();
  await page.waitForTimeout(400);
  return true;
}

function posScenarios(mode: "sale" | "quote", product: SeedProduct | undefined): Scenario[] {
  const seed = seedCart(mode === "sale" ? "lp2050-pos-cart" : "lp2050-quote-cart", product);
  const list: Scenario[] = [
    {
      name: "carrito con producto",
      prepare: seed,
      run: async (page) => {
        // Also exercise the search box; with the cart already seeded this is optional.
        await addFirstProductToCart(page, "[data-pos-search]");
        return null;
      },
    },
    {
      name: mode === "sale" ? "cobrar" : "guardar cotizacion",
      prepare: seed,
      run: async (page) => {
        const label = mode === "sale" ? /^Cobrar/ : /^Guardar cotización/;
        await page.getByRole("button", { name: label }).filter({ visible: true }).first().click();
        const dialog = dialogLocator(page);
        await dialog.waitFor({ state: "visible", timeout: 5000 });
        if (mode === "sale") {
          // Add a payment so the amount rows, "faltan" and change blocks render.
          const method = dialog.locator("button:not([disabled])").filter({ hasText: /\$|Bs|COP/ }).first();
          if (await method.isVisible().catch(() => false)) {
            await method.click();
            await page.waitForTimeout(300);
          }
        }
        return dialog;
      },
    },
    {
      name: "editar linea",
      prepare: seed,
      run: async (page) => {
        await page.getByRole("button", { name: "Editar cantidad" }).first().click();
        return dialogLocator(page);
      },
    },
    {
      name: "descuento general",
      prepare: seed,
      run: async (page) => {
        await page.getByRole("button", { name: /Agregar descuento|Descuento general/ }).first().click();
        return dialogLocator(page);
      },
    },
    {
      name: "cliente",
      run: async (page) => {
        await page.getByRole("button", { name: /Consumidor final/ }).first().click();
        return dialogLocator(page);
      },
    },
  ];
  if (mode === "sale") {
    list.push(
      {
        name: "en espera",
        run: async (page) => {
          await page.getByRole("button", { name: /^En espera/ }).first().click();
          return dialogLocator(page);
        },
      },
      {
        name: "poner en espera",
        prepare: seed,
        run: async (page) => {
          await page.getByRole("button", { name: "Poner en espera" }).filter({ visible: true }).first().click();
          return dialogLocator(page);
        },
      },
      {
        name: "cambiar vendedor",
        run: async (page) => {
          await page.getByRole("button", { name: /Cambiar vendedor/ }).first().click();
          return dialogLocator(page);
        },
      },
    );
  }
  return list;
}

const pickerScenario: Scenario = {
  name: "con producto agregado",
  run: async (page) => {
    await addFirstProductToCart(page, '[role="combobox"]');
    return null;
  },
};

function buildRoutes(ids: Ids): RouteSpec[] {
  const routes: RouteSpec[] = [
    { path: "/login", anonymous: true },
    { path: "/inicio" },
    { path: "/vender", scenarios: posScenarios("sale", ids.cartProduct), noAutoDialogs: true },
    { path: "/ventas" },
    ...(ids.saleId ? [{ path: `/ventas/${ids.saleId}`, name: "/ventas/[id]" }] : []),
    ...(ids.returnableSaleId
      ? [
          {
            path: `/ventas/${ids.returnableSaleId}/devolver`,
            name: "/ventas/[id]/devolver",
            scenarios: [
              {
                name: "linea marcada",
                run: async (page: Page) => {
                  await page.getByRole("checkbox").first().click();
                  await page.waitForTimeout(200);
                  return null;
                },
              },
            ],
          },
        ]
      : []),
    { path: "/cotizaciones" },
    { path: "/cotizaciones/nueva", scenarios: posScenarios("quote", ids.cartProduct), noAutoDialogs: true },
    ...(ids.quoteId ? [{ path: `/cotizaciones/${ids.quoteId}`, name: "/cotizaciones/[id]" }] : []),
    { path: "/productos" },
    {
      path: "/productos/nuevo",
      scenarios: [
        {
          name: "secciones expandidas",
          run: async (page) => {
            await page.getByRole("button", { name: /Más opciones/ }).click();
            await page.getByRole("button", { name: /Agregar compatibilidad/ }).click();
            await page.getByRole("button", { name: /Agregar equivalencia/ }).click();
            await page.waitForTimeout(200);
            return null;
          },
        },
      ],
    },
    ...(ids.productId
      ? [
          { path: `/productos/${ids.productId}`, name: "/productos/[id]" },
          { path: `/productos/${ids.productId}/editar`, name: "/productos/[id]/editar" },
        ]
      : []),
    { path: "/productos/categorias" },
    { path: "/productos/etiquetas" },
    { path: "/productos/importar" },
    { path: "/inventario" },
    { path: "/inventario/movimientos" },
    { path: "/inventario/ajustes" },
    { path: "/inventario/ajustes/nuevo", scenarios: [pickerScenario] },
    ...(ids.adjustmentId ? [{ path: `/inventario/ajustes/${ids.adjustmentId}`, name: "/inventario/ajustes/[id]" }] : []),
    { path: "/inventario/conteos" },
    { path: "/inventario/conteos/nuevo" },
    ...(ids.countId ? [{ path: `/inventario/conteos/${ids.countId}`, name: "/inventario/conteos/[id]" }] : []),
    { path: "/inventario/alertas" },
    { path: "/compras" },
    { path: "/compras/proveedores" },
    { path: "/compras/proveedores/nuevo" },
    ...(ids.supplierId
      ? [
          { path: `/compras/proveedores/${ids.supplierId}`, name: "/compras/proveedores/[id]" },
          { path: `/compras/proveedores/${ids.supplierId}/editar`, name: "/compras/proveedores/[id]/editar" },
        ]
      : []),
    { path: "/compras/entradas" },
    { path: "/compras/entradas/nueva", scenarios: [pickerScenario] },
    ...(ids.receiptId ? [{ path: `/compras/entradas/${ids.receiptId}`, name: "/compras/entradas/[id]" }] : []),
    { path: "/compras/que-comprar" },
    { path: "/clientes" },
    { path: "/clientes/nuevo" },
    ...(ids.customerId
      ? [
          { path: `/clientes/${ids.customerId}`, name: "/clientes/[id]" },
          { path: `/clientes/${ids.customerId}/editar`, name: "/clientes/[id]/editar" },
        ]
      : []),
    { path: "/caja" },
    ...(ids.cashOpen
      ? [
          {
            path: "/caja/cerrar",
            scenarios: [
              {
                name: "conteo con diferencia",
                run: async (page: Page) => {
                  const helper = page.getByRole("button", { name: /Contar por billetes/ }).first();
                  if (await helper.isVisible().catch(() => false)) await helper.click();
                  const counted = page.locator('input[id^="counted-"]').first();
                  await counted.fill("1");
                  await counted.blur();
                  await page.waitForTimeout(200);
                  return null;
                },
              },
            ],
          },
        ]
      : []),
    { path: "/caja/historial" },
    ...(ids.cashSessionId ? [{ path: `/caja/historial/${ids.cashSessionId}`, name: "/caja/historial/[id]" }] : []),
    { path: "/reportes" },
    { path: "/reportes/ventas" },
    { path: "/reportes/inventario" },
    { path: "/reportes/velocidad" },
    { path: "/reportes/margen" },
    { path: "/reportes/sin-movimiento" },
    { path: "/configuracion" },
    { path: "/configuracion/empresa" },
    { path: "/configuracion/tasas" },
    { path: "/configuracion/impuestos" },
    { path: "/configuracion/metodos-de-pago" },
    { path: "/configuracion/motivos" },
    { path: "/configuracion/unidades" },
    { path: "/configuracion/series" },
    { path: "/configuracion/impresion" },
    { path: "/configuracion/politicas" },
    { path: "/configuracion/usuarios" },
    { path: "/configuracion/mi-cuenta" },
    { path: "/configuracion/respaldos" },
    { path: "/sin-acceso" },
    ...(ids.saleId ? [{ path: `/imprimir/ticket/${ids.saleId}`, name: "/imprimir/ticket/[id]", print: true }] : []),
  ];
  return ONLY ? routes.filter((r) => (r.name ?? r.path).includes(ONLY)) : routes;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface Finding {
  route: string;
  viewport: ViewportName;
  scenario: string | null;
  status: number | null;
  audit: AuditResult | null;
  errors: string[];
  screenshot: string | null;
}

const slug = (s: string) =>
  s
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9_[\]-]+/g, "_")
    .replace(/_+$/, "") || "root";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const hasSession = (state: StorageState) => state.cookies.some((c) => c.name.includes("authjs.session-token"));

/** Same flow as scripts/lib/session.ts: csrf token + credentials callback. */
async function loginViaApi(): Promise<StorageState | null> {
  const api = await playwrightRequest.newContext({ baseURL: BASE });
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const ok = await api
        .get("/login", { maxRedirects: 0 })
        .then((r) => r.status() < 500)
        .catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const csrfRes = await api.get("/api/auth/csrf");
    if (!csrfRes.ok()) return null;
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    await api.post("/api/auth/callback/credentials", {
      form: { csrfToken, email: EMAIL, password: PASSWORD, redirectTo: "/inicio" },
      maxRedirects: 0,
    });
    const state = await api.storageState();
    return hasSession(state) ? state : null;
  } catch {
    return null;
  } finally {
    await api.dispose();
  }
}

/** Fallback: the real login form (server action), independent of /api/auth/*. */
async function loginViaForm(browser: Browser): Promise<StorageState | null> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 120_000 });
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /Entrar/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }).catch(() => undefined);
    const state = await context.storageState();
    return hasSession(state) ? state : null;
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

async function login(browser: Browser): Promise<StorageState> {
  const viaApi = await loginViaApi();
  if (viaApi) return viaApi;
  console.warn("Aviso: /api/auth no respondió; iniciando sesión por el formulario de /login.");
  const viaForm = await loginViaForm(browser);
  if (viaForm) return viaForm;
  throw new Error(`No se pudo iniciar sesión como ${EMAIL}`);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(350);
}

async function runAudit(page: Page, rootSelector: string | null, checkBottom: boolean): Promise<AuditResult | null> {
  const deviceWidth = page.viewportSize()?.width ?? 390;
  return page.evaluate(auditInPage, { rootSelector, targetMin: TARGET_MIN, checkBottom, deviceWidth } satisfies AuditOptions);
}

async function screenshot(page: Page, file: string, fullPage: boolean): Promise<string | null> {
  if (!SCREENSHOTS) return null;
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage, animations: "disabled" }).catch(() => undefined);
  return path.relative(process.cwd(), file);
}

async function closeDialogs(page: Page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('[role="dialog"], [role="alertdialog"]').filter({ visible: true }).count();
    if (open === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

async function auditDialog(page: Page, dialog: Locator, viewport: ViewportName, base: string, name: string): Promise<{ audit: AuditResult | null; screenshot: string | null }> {
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
  await dialog.evaluate((el) => el.setAttribute("data-qa-root", "1"));
  const audit = await runAudit(page, '[data-qa-root="1"]', false);
  await dialog.evaluate((el) => el.removeAttribute("data-qa-root")).catch(() => undefined);
  const shot = await screenshot(page, path.join(OUT_DIR, viewport, `${base}--${slug(name)}.png`), false);
  return { audit, screenshot: shot };
}

async function visit(context: BrowserContext, route: RouteSpec, viewport: ViewportName, findings: Finding[]) {
  const name = route.name ?? route.path;
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`error JS: ${e.message.split("\n")[0]}`));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
  });
  let status: number | null = null;
  try {
    const res = await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 120_000 });
    status = res?.status() ?? null;
    await settle(page);
    if (await page.locator("text=Application error").count()) errors.push("Application error");
    const base = slug(name);
    const checkBottom = !route.print && !route.anonymous;
    const audit = await runAudit(page, null, checkBottom);
    const shot = await screenshot(page, path.join(OUT_DIR, viewport, `${base}.png`), true);
    findings.push({ route: name, viewport, scenario: null, status, audit, errors: [...errors], screenshot: shot });

    if (!DIALOGS) return;

    // Explicit scenarios.
    for (const scenario of route.scenarios ?? []) {
      const scenarioErrors: string[] = [];
      try {
        await scenario.prepare?.(page);
        await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 120_000 });
        await settle(page);
        const dialog = await scenario.run(page);
        if (dialog) {
          const r = await auditDialog(page, dialog, viewport, base, scenario.name);
          findings.push({ route: name, viewport, scenario: scenario.name, status, audit: r.audit, errors: scenarioErrors, screenshot: r.screenshot });
          await closeDialogs(page);
        } else {
          await page.waitForTimeout(200);
          const a = await runAudit(page, null, checkBottom);
          const s = await screenshot(page, path.join(OUT_DIR, viewport, `${base}--${slug(scenario.name)}.png`), true);
          findings.push({ route: name, viewport, scenario: scenario.name, status, audit: a, errors: scenarioErrors, screenshot: s });
        }
      } catch (err) {
        findings.push({ route: name, viewport, scenario: scenario.name, status, audit: null, errors: [`escenario falló: ${(err as Error).message.split("\n")[0]}`], screenshot: null });
        await closeDialogs(page).catch(() => undefined);
      }
    }

    // Every dialog trigger on the page (Base UI marks them with aria-haspopup="dialog").
    if (!route.noAutoDialogs && !route.print && !route.anonymous) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 120_000 });
      await settle(page);
      const triggers = page.locator('[aria-haspopup="dialog"]').filter({ visible: true });
      const count = Math.min(await triggers.count(), 8);
      const seen = new Set<string>();
      for (let i = 0; i < count; i++) {
        const trigger = page.locator('[aria-haspopup="dialog"]').filter({ visible: true }).nth(i);
        const label = ((await trigger.getAttribute("aria-label").catch(() => null)) ?? (await trigger.innerText().catch(() => "")) ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        try {
          await trigger.click({ timeout: 3000 });
          const dialog = dialogLocator(page);
          const r = await auditDialog(page, dialog, viewport, base, `dialogo ${label}`);
          findings.push({ route: name, viewport, scenario: `diálogo «${label}»`, status, audit: r.audit, errors: [], screenshot: r.screenshot });
        } catch (err) {
          findings.push({ route: name, viewport, scenario: `diálogo «${label}»`, status, audit: null, errors: [`no se pudo abrir: ${(err as Error).message.split("\n")[0]}`], screenshot: null });
        }
        await closeDialogs(page).catch(() => undefined);
      }
    }
  } catch (err) {
    findings.push({ route: name, viewport, scenario: null, status, audit: null, errors: [...errors, `falló: ${(err as Error).message.split("\n")[0]}`], screenshot: null });
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function summarize(f: Finding) {
  const a = f.audit;
  const targets = a ? a.smallTargets.filter((t) => !t.inline).length : 0;
  const inlineLinks = a ? a.smallTargets.filter((t) => t.inline).length : 0;
  const notes: string[] = [];
  if (f.status && f.status >= 400) notes.push(`HTTP ${f.status}`);
  if (a?.bottom?.covered) notes.push(`contenido tapado (${a.bottom.contentBottom - a.bottom.overlayTop}px) por ${a.bottom.by}`);
  if (a) notes.push(...a.notes);
  if (inlineLinks) notes.push(`${inlineLinks} enlace(s) en línea <40px`);
  notes.push(...f.errors);
  return { overflow: a ? a.pageOverflow || a.offenders.length > 0 : false, targets, text: a?.smallText.length ?? 0, inputs: a?.smallInputs.length ?? 0, notes };
}

function buildReport(findings: Finding[], ids: Ids): string {
  const lines: string[] = [];
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const coarse = findings.find((f) => f.audit)?.audit?.coarsePointer;
  lines.push("# QA móvil — reporte automático", "", `Generado: ${stamp} · base ${BASE} · umbral táctil ${TARGET_MIN}px · puntero grueso emulado: ${coarse === undefined ? "?" : coarse ? "sí" : "no"}`, "");
  lines.push(
    `Ids usados: ${Object.entries(ids)
      .filter(([k]) => k !== "cartProduct")
      .map(([k, v]) => `${k}=${v ?? "—"}`)
      .join(", ")}`,
    "",
  );
  const withOverflow = findings.filter((f) => summarize(f).overflow);
  const covered = findings.filter((f) => f.audit?.bottom?.covered);
  const failed = findings.filter((f) => f.errors.length > 0 || (f.status !== null && f.status >= 400));
  lines.push("## Resumen", "");
  lines.push(`- Vistas auditadas: ${findings.length}`);
  lines.push(`- Con desbordamiento horizontal: ${withOverflow.length}`);
  lines.push(`- Con contenido tapado por la barra inferior: ${covered.length}`);
  lines.push(`- Con errores o estados HTTP ≥ 400: ${failed.length}`);
  lines.push(`- Objetivos táctiles < ${TARGET_MIN}px (sin contar enlaces en línea): ${findings.reduce((n, f) => n + summarize(f).targets, 0)}`);
  lines.push(`- Textos < 12px: ${findings.reduce((n, f) => n + (f.audit?.smallText.length ?? 0), 0)}`);
  lines.push(`- Controles con fuente < 16px: ${findings.reduce((n, f) => n + (f.audit?.smallInputs.length ?? 0), 0)}`, "");

  lines.push("## Tabla por vista", "");
  lines.push("| Ruta | Vista | Escenario | HTTP | Desborde | Táctiles <40 | Texto <12 | Inputs <16 | Notas |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const f of findings) {
    const s = summarize(f);
    lines.push(
      `| ${f.route} | ${f.viewport} | ${f.scenario ?? "—"} | ${f.status ?? "—"} | ${s.overflow ? "**sí**" : "no"} | ${s.targets} | ${s.text} | ${s.inputs} | ${s.notes.join("; ").replace(/\|/g, "\\|") || "—"} |`,
    );
  }
  lines.push("", "## Detalle", "");
  for (const f of findings) {
    const a = f.audit;
    const s = summarize(f);
    const interesting = s.overflow || s.targets > 0 || s.text > 0 || s.inputs > 0 || s.notes.length > 0;
    if (!interesting) continue;
    lines.push(`### ${f.route} · ${f.viewport}${f.scenario ? ` · ${f.scenario}` : ""}`, "");
    if (f.screenshot) lines.push(`Captura: \`${f.screenshot.replace(/\\/g, "/")}\``, "");
    if (a && (a.pageOverflow || a.offenders.length > 0)) {
      lines.push(`- Desborde: documento ${a.scrollWidth}px en viewport ${a.innerWidth}px.`);
      for (const o of a.offenders) lines.push(`  - ${o.replace(/\|/g, "\\|")}`);
    }
    if (a && a.smallTargets.length > 0) {
      lines.push(`- Objetivos táctiles < ${TARGET_MIN}px:`);
      for (const t of a.smallTargets.slice(0, 25)) lines.push(`  - ${t.w}×${t.h} ${t.inline ? "(enlace en línea) " : ""}${t.desc.replace(/\|/g, "\\|")}`);
      if (a.smallTargets.length > 25) lines.push(`  - … y ${a.smallTargets.length - 25} más`);
    }
    if (a && a.smallText.length > 0) {
      lines.push("- Texto < 12px:");
      for (const t of a.smallText.slice(0, 15)) lines.push(`  - ${t.size}px ${t.desc.replace(/\|/g, "\\|")}`);
      if (a.smallText.length > 15) lines.push(`  - … y ${a.smallText.length - 15} más`);
    }
    if (a && a.smallInputs.length > 0) {
      lines.push("- Controles con fuente < 16px:");
      for (const t of a.smallInputs.slice(0, 15)) lines.push(`  - ${t.size}px ${t.desc.replace(/\|/g, "\\|")}`);
    }
    if (a?.bottom) lines.push(`- Barra inferior: borde superior ${a.bottom.overlayTop}px (${a.bottom.by}); último contenido ${a.bottom.contentBottom}px (${a.bottom.what}) → ${a.bottom.covered ? "**TAPADO**" : "ok"}`);
    for (const n of s.notes) lines.push(`- Nota: ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}

function printTable(findings: Finding[]) {
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  console.log("");
  console.log(`${pad("Ruta", 34)} ${pad("Vista", 7)} ${pad("Escenario", 22)} ${pad("HTTP", 5)} ${pad("Desb.", 6)} ${pad("Táct", 5)} ${pad("Txt", 4)} ${pad("Inp", 4)} Notas`);
  console.log("-".repeat(120));
  for (const f of findings) {
    const s = summarize(f);
    console.log(
      `${pad(f.route, 34)} ${pad(f.viewport, 7)} ${pad(f.scenario ?? "—", 22)} ${pad(String(f.status ?? "—"), 5)} ${pad(s.overflow ? "SÍ" : "no", 6)} ${pad(String(s.targets), 5)} ${pad(String(s.text), 4)} ${pad(String(s.inputs), 4)} ${s.notes.join("; ").slice(0, 60)}`,
    );
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const ids = await loadIds();
  const viewports = (Object.keys(VIEWPORTS) as ViewportName[]).filter((v) => !VIEWPORT_FILTER || v === VIEWPORT_FILTER);

  const browser: Browser = await chromium.launch();
  const findings: Finding[] = [];
  const started = Date.now();
  let seeded: Seeded = {};
  try {
    const state = await login(browser);
    if (SEED) {
      seeded = await seedSampleData(browser, state, ids);
      Object.assign(ids, seeded);
    }
    const routes = buildRoutes(ids);
    console.log(`Rutas: ${routes.length} · vistas: ${viewports.join(", ")} · salida: ${OUT_DIR}`);
    for (const viewport of viewports) {
      const size = VIEWPORTS[viewport];
      const contextOptions = { viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: "es-VE", reducedMotion: "reduce" as const };
      const authed = await browser.newContext({ ...contextOptions, storageState: state });
      const anon = await browser.newContext(contextOptions);
      // tsx (esbuild) injects a `__name` helper into serialized functions; provide it in the page.
      for (const ctx of [authed, anon]) await ctx.addInitScript("window.__name = window.__name || ((fn) => fn);");
      for (const route of routes) {
        const t0 = Date.now();
        await visit(route.anonymous ? anon : authed, route, viewport, findings);
        const last = findings[findings.length - 1];
        const s = summarize(last);
        console.log(`${viewport.padEnd(6)} ${route.name ?? route.path}  ${((Date.now() - t0) / 1000).toFixed(1)}s${s.overflow ? "  DESBORDE" : ""}${s.notes.length ? `  (${s.notes[0]})` : ""}`);
      }
      await authed.close();
      await anon.close();
    }
  } finally {
    await browser.close();
    if (!KEEP_SEED) await removeSeed(seeded);
  }

  printTable(findings);
  const report = buildReport(findings, ids);
  const reportPath = path.join(OUT_DIR, "report.md");
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(path.join(OUT_DIR, "findings.json"), JSON.stringify(findings, null, 2), "utf8");
  const overflow = findings.filter((f) => summarize(f).overflow).length;
  console.log(`\nReporte: ${path.relative(process.cwd(), reportPath)} · vistas ${findings.length} · con desborde ${overflow} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exitCode = overflow > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
