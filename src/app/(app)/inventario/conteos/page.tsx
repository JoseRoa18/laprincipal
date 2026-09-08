import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { listCounts, type CountStatus } from "@/modules/inventory/infrastructure/counts";
import { COUNT_STATUS_LABEL } from "@/modules/inventory/infrastructure/labels";
import { UrlSelect } from "@/modules/inventory/ui/filters";
import { CountStatusBadge, countFilterLabel } from "@/modules/inventory/ui/status-badges";

export const metadata = { title: "Conteos físicos" };

type Params = Record<string, string | string[] | undefined>;
const STATUSES: CountStatus[] = ["open", "applied", "cancelled"];

export default async function CountsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const status = STATUSES.includes(params.status as CountStatus) ? (params.status as CountStatus) : "";
  const { rows, total } = await listCounts({ status, page });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conteos físicos"
        description="Cuenta desde el celular y ajusta las diferencias con un clic"
        actions={
          <Button render={<Link href="/inventario/conteos/nuevo" />}>
            <ClipboardList data-icon="inline-start" /> Nuevo conteo
          </Button>
        }
      />
      <UrlSelect param="status" placeholder="Todos los estados" options={STATUSES.map((s) => ({ value: s, label: COUNT_STATUS_LABEL[s] }))} />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={status ? "Sin conteos con ese estado" : "Todavía no hay conteos"}
          description="Crea un conteo por categoría o estante, cuenta con la cámara del celular y aplica las diferencias."
          action={<Button render={<Link href="/inventario/conteos/nuevo" />}>Nuevo conteo</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conteo</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Alcance</TableHead>
              <TableHead className="text-right">Progreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/inventario/conteos/${c.id}`} className="font-medium hover:underline">
                    {c.number ?? (c.status === "open" ? "En curso" : "Sin número")}
                  </Link>
                  {c.blind ? <span className="text-muted-foreground block text-xs">Ciego</span> : null}
                </TableCell>
                <TableCell className="tabular-nums">{formatDateTime(c.startedAt)}</TableCell>
                <TableCell>{countFilterLabel(c.filter, c.categoryName)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.countedItems} de {c.totalItems}
                </TableCell>
                <TableCell>
                  <CountStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{c.startedByName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/inventario/conteos" params={params} />
    </div>
  );
}
