import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const DEFAULT_PAGE_SIZE = 25;

export function parsePage(value: string | string[] | undefined, fallback = 1): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Server-rendered pager that preserves the other query parameters. */
export function Pagination({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize?: number;
  total: number;
  basePath: string;
  params?: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (k === "page" || v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3 py-2 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} render={page > 1 ? <Link href={href(page - 1)} /> : undefined}>
          <ChevronLeft /> Anterior
        </Button>
        <span className="text-muted-foreground px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} render={page < pages ? <Link href={href(page + 1)} /> : undefined}>
          Siguiente <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
