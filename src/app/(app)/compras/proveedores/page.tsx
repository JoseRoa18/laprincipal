import { Truck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { UrlToggle } from "@/modules/inventory/ui/filters";
import { listSuppliers } from "@/modules/purchasing/infrastructure/suppliers";

export const metadata = { title: "Proveedores" };

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = str(params.q);
  const includeInactive = str(params.inactivos) === "1";
  const { rows, total } = await listSuppliers({ q, includeInactive, page });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proveedores"
        description="A quién le compras, en qué moneda y cuánto tarda"
        actions={
          <Button render={<Link href="/compras/proveedores/nuevo" />}>
            <Truck data-icon="inline-start" /> Nuevo proveedor
          </Button>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput placeholder="Nombre, RIF o contacto" className="sm:w-80" />
        <UrlToggle param="inactivos" label="Incluir inactivos" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={q ? "Sin resultados" : "Todavía no hay proveedores"}
          description={q ? "Prueba con otro nombre o RIF." : "Registra a quién le compras para agrupar el reporte de qué comprar y registrar entradas."}
          action={q ? undefined : <Button render={<Link href="/compras/proveedores/nuevo" />}>Nuevo proveedor</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Entrega</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/compras/proveedores/${s.id}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  {s.taxId ? <span className="text-muted-foreground block text-xs">{s.taxId}</span> : null}
                </TableCell>
                <TableCell>
                  {s.contactName ?? "—"}
                  {s.phone ? <span className="text-muted-foreground block text-xs">{s.phone}</span> : null}
                </TableCell>
                <TableCell>{s.currencyCode}</TableCell>
                <TableCell className="text-right tabular-nums">{s.leadTimeDays} días</TableCell>
                <TableCell className="text-right tabular-nums">{s.productCount}</TableCell>
                <TableCell>{s.isActive ? <Badge variant="outline">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/compras/proveedores" params={params} />
    </div>
  );
}
