import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { D } from "@/lib/money";
import { formatDateOnly } from "@/modules/sales/application/labels";
import { expireOverdueQuotes } from "@/modules/sales/application/quotes";
import { listQuotes, type QuoteStatus } from "@/modules/sales/infrastructure/quotes-queries";
import { QuoteStatusBadge } from "@/modules/sales/ui/status-badge";
import { cn } from "cn";

export const metadata = { title: "Cotizaciones" };

const TABS: { value: QuoteStatus | "all"; label: string }[] = [
  { value: "open", label: "Abiertas" },
  { value: "converted", label: "Convertidas" },
  { value: "expired", label: "Vencidas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin", "seller");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const statusRaw = typeof params.estado === "string" ? params.estado : "open";
  const status = TABS.some((t) => t.value === statusRaw) ? (statusRaw as QuoteStatus | "all") : "open";
  const page = parsePage(params.page);
  await expireOverdueQuotes(db);
  const { rows, total } = await listQuotes({ q, status, page, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        description="Presupuestos con vigencia que se convierten en venta desde el punto de venta."
        actions={
          <Button render={<Link href="/cotizaciones/nueva" />}>
            <Plus /> Nueva cotización
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Número o cliente" className="w-full sm:w-72" />
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/cotizaciones?estado=${t.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("tap-target inline-flex items-center rounded-lg border px-3 py-1.5 text-sm", status === t.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q ? "Sin resultados" : "No hay cotizaciones aquí"}
          description={q ? "Prueba con otro número o nombre." : "Crea una desde el punto de venta con “Cotizar” o con el botón Nueva cotización."}
        />
      ) : (
        <>
          {/* Phones: one card per quote */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/cotizaciones/${r.id}`} className="bg-card active:bg-muted/50 block rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">
                      {r.number ?? "—"}
                      {r.reservesStock ? <span className="text-muted-foreground ml-2 text-xs font-normal">reserva stock</span> : null}
                    </span>
                    <QuoteStatusBadge status={r.status} />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDateTime(r.createdAt)} · {r.customerName ?? "Consumidor final"} · {r.sellerName}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2 text-sm">
                    <span className="text-muted-foreground text-xs">Válida hasta {formatDateOnly(r.validUntil)}</span>
                    <span className="shrink-0 text-right">
                      <Money value={r.totalUsd} currency="USD" className="font-semibold" />
                      {D(r.rateVes).gt(0) ? (
                        <span className="text-muted-foreground block text-xs">
                          <Money value={D(r.totalUsd).mul(r.rateVes)} currency="VES" />
                        </span>
                      ) : null}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Wider screens: table */}
          <div className="hidden rounded-xl border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Válida hasta</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/cotizaciones/${r.id}`} className="font-medium hover:underline">
                      {r.number ?? "—"}
                    </Link>
                    {r.reservesStock ? <span className="text-muted-foreground block text-xs">reserva stock</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell className="max-w-48 truncate">{r.customerName ?? "Consumidor final"}</TableCell>
                  <TableCell className="max-w-40 truncate">{r.sellerName}</TableCell>
                  <TableCell className="tabular-nums">{formatDateOnly(r.validUntil)}</TableCell>
                  <TableCell className="text-right">
                    <Money value={r.totalUsd} currency="USD" className="font-medium" />
                    {D(r.rateVes).gt(0) ? (
                      <span className="text-muted-foreground block text-xs">
                        <Money value={D(r.totalUsd).mul(r.rateVes)} currency="VES" />
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </>
      )}
      <Pagination page={page} total={total} basePath="/cotizaciones" params={params} />
    </div>
  );
}
