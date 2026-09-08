import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { listAdjustments, type AdjustmentStatus } from "@/modules/inventory/infrastructure/adjustments";
import { ADJUSTMENT_STATUS_LABEL } from "@/modules/inventory/infrastructure/labels";
import { UrlSelect } from "@/modules/inventory/ui/filters";
import { AdjustmentStatusBadge } from "@/modules/inventory/ui/status-badges";

export const metadata = { title: "Ajustes de inventario" };

type Params = Record<string, string | string[] | undefined>;
const STATUSES: AdjustmentStatus[] = ["draft", "applied", "cancelled"];

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const status = STATUSES.includes(params.status as AdjustmentStatus) ? (params.status as AdjustmentStatus) : "";
  const { rows, total } = await listAdjustments({ status, page });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ajustes de inventario"
        description="Entradas y salidas manuales con motivo"
        actions={
          <Button render={<Link href="/inventario/ajustes/nuevo" />}>
            <SlidersHorizontal data-icon="inline-start" /> Nuevo ajuste
          </Button>
        }
      />
      <UrlSelect param="status" placeholder="Todos los estados" options={STATUSES.map((s) => ({ value: s, label: ADJUSTMENT_STATUS_LABEL[s] }))} />

      {rows.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={status ? "Sin ajustes con ese estado" : "Todavía no hay ajustes"}
          description="Usa un ajuste para cargar el inventario inicial, registrar mermas o corregir existencias."
          action={<Button render={<Link href="/inventario/ajustes/nuevo" />}>Nuevo ajuste</Button>}
        />
      ) : (
        <>
          {/* Phones: one card per adjustment */}
          <ul className="space-y-2 md:hidden">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={`/inventario/ajustes/${a.id}`} className="bg-card active:bg-muted/50 block rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{a.number ?? "Borrador"}</span>
                    <AdjustmentStatusBadge status={a.status} />
                  </div>
                  <p className="mt-0.5 text-sm">{a.reasonName}</p>
                  {a.notes ? <p className="text-muted-foreground truncate text-xs">{a.notes}</p> : null}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDateTime(a.appliedAt ?? a.createdAt)} · {a.itemCount} {a.itemCount === 1 ? "producto" : "productos"} · {a.createdByName}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* Wider screens: table */}
          <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link href={`/inventario/ajustes/${a.id}`} className="font-medium hover:underline">
                    {a.number ?? "Borrador"}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{formatDateTime(a.appliedAt ?? a.createdAt)}</TableCell>
                <TableCell>
                  {a.reasonName}
                  {a.notes ? <span className="text-muted-foreground block max-w-[20rem] truncate text-xs">{a.notes}</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.itemCount}</TableCell>
                <TableCell>
                  <AdjustmentStatusBadge status={a.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{a.createdByName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          </div>
        </>
      )}
      <Pagination page={page} total={total} basePath="/inventario/ajustes" params={params} />
    </div>
  );
}
