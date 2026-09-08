/** Filters of the product list. Pure so client components can share the labels. */

export type StockFilter = "all" | "out" | "buy_now" | "soon" | "ok" | "excess" | "no_data";
export type ActiveFilter = "1" | "0" | "all";

export interface ProductListFilter {
  q: string;
  categoryId: string | null;
  brandId: string | null;
  stock: StockFilter;
  active: ActiveFilter;
}

export const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: "Todo el stock",
  out: "Agotados",
  buy_now: "Comprar ya",
  soon: "Pronto",
  ok: "OK",
  excess: "Exceso",
  no_data: "Sin datos",
};

export const ACTIVE_FILTER_LABELS: Record<ActiveFilter, string> = {
  "1": "Activos",
  "0": "Inactivos",
  all: "Activos e inactivos",
};

/** Read list filters from a page's searchParams or a query string object. */
export function parseListFilter(params: Record<string, string | string[] | undefined>): ProductListFilter {
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const stock = str("stock");
  const active = str("active");
  return {
    q: str("q").trim(),
    categoryId: str("category") || null,
    brandId: str("brand") || null,
    stock: (Object.keys(STOCK_FILTER_LABELS) as StockFilter[]).includes(stock as StockFilter) ? (stock as StockFilter) : "all",
    active: active === "0" || active === "all" ? active : "1",
  };
}
