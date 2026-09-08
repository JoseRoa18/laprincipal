import { Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, parsePage } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { D } from "@/lib/money";
import { listCashSessions } from "@/modules/cash/infrastructure/queries";

export const metadata = { title: "Historial de cajas" };

export default async function CashHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const params = await searchParams;
  const page = parsePage(params.page);
  const { rows, total } = await listCashSessions({ page, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Historial de cajas"
        description={`${total} ${total === 1 ? "sesión" : "sesiones"}`}
        actions={
          <Button variant="outline" render={<Link href="/caja" />}>
            Volver a caja
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Todavía no hay sesiones de caja" description="Cuando abras y cierres la caja, cada sesión quedará registrada aquí con su cierre imprimible." />
      ) : (
        <>
          {/* Phones: one card per session */}
          <ul className="space-y-2 md:hidden">
            {rows.map((s) => {
              const diffs = s.differences.filter((d) => d.difference !== null);
              const balanced = diffs.length > 0 && diffs.every((d) => D(d.difference).isZero());
              const pending = diffs.filter((d) => !D(d.difference).isZero());
              return (
                <li key={s.id}>
                  <Link href={`/caja/historial/${s.id}`} className="bg-card active:bg-muted/50 block rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{s.number ?? "—"}</span>
                      <Badge variant={s.status === "open" ? "default" : "outline"}>{s.status === "open" ? "Abierta" : "Cerrada"}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Apertura {formatDateTime(s.openedAt)} · {s.openedByName}
                    </p>
                    {s.closedAt ? (
                      <p className="text-muted-foreground text-xs">
                        Cierre {formatDateTime(s.closedAt)} · {s.closedByName}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm">
                      {s.status === "open" ? (
                        <span className="text-muted-foreground">Sin cierre todavía</span>
                      ) : balanced ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Cuadró</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-3">
                          {pending.map((d) => (
                            <Money key={d.currencyCode} value={d.difference} currency={d.currencyCode} colored />
                          ))}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Wider screens: table */}
          <div className="hidden rounded-xl border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Apertura</TableHead>
                <TableHead>Cierre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Diferencias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const diffs = s.differences.filter((d) => d.difference !== null);
                const balanced = diffs.length > 0 && diffs.every((d) => D(d.difference).isZero());
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/caja/historial/${s.id}`} className="font-medium hover:underline">
                        {s.number ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{formatDateTime(s.openedAt)}</div>
                      <div className="text-muted-foreground text-xs">{s.openedByName}</div>
                    </TableCell>
                    <TableCell>
                      {s.closedAt ? (
                        <>
                          <div>{formatDateTime(s.closedAt)}</div>
                          <div className="text-muted-foreground text-xs">{s.closedByName}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === "open" ? "default" : "outline"}>{s.status === "open" ? "Abierta" : "Cerrada"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status === "open" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : balanced ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Cuadró</span>
                      ) : (
                        <div className="space-y-0.5">
                          {diffs
                            .filter((d) => !D(d.difference).isZero())
                            .map((d) => (
                              <div key={d.currencyCode}>
                                <Money value={d.difference} currency={d.currencyCode} colored />
                              </div>
                            ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      <Pagination page={page} total={total} basePath="/caja/historial" params={params} />
    </div>
  );
}
