import { Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { CUSTOMER_TYPE_LABEL, formatDoc } from "@/modules/customers/domain/schema";
import { listCustomers } from "@/modules/customers/infrastructure/customers";
import { cn } from "cn";

export const metadata = { title: "Clientes" };

type Params = Record<string, string | string[] | undefined>;

function hrefWith(params: Params, overrides: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v === undefined || Array.isArray(v)) continue;
    sp.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "seller");
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = typeof params.q === "string" ? params.q : "";
  const type = params.tipo === "public" || params.tipo === "technician" ? params.tipo : "";
  const includeInactive = params.inactivos === "1";

  const { rows, total } = await listCustomers({ q, type, includeInactive, page, pageSize: DEFAULT_PAGE_SIZE });
  const filtering = Boolean(q) || Boolean(type) || includeInactive;

  const chips: Array<{ label: string; value: "" | "public" | "technician" }> = [
    { label: "Todos", value: "" },
    { label: "Público", value: "public" },
    { label: "Técnico", value: "technician" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        description={`${total} ${total === 1 ? "cliente" : "clientes"}`}
        actions={
          <Button size="lg" render={<Link href="/clientes/nuevo" />}>
            Nuevo cliente
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput placeholder="Nombre, documento o teléfono" className="md:max-w-md md:flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Link
              key={c.value}
              href={hrefWith(params, { tipo: c.value })}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3 text-sm",
                type === c.value ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted",
              )}
              aria-current={type === c.value ? "page" : undefined}
            >
              {c.label}
            </Link>
          ))}
          <Link
            href={hrefWith(params, { inactivos: includeInactive ? "" : "1" })}
            className="text-muted-foreground hover:text-foreground ml-1 text-sm underline-offset-4 hover:underline"
          >
            {includeInactive ? "Ocultar inactivos" : "Ver inactivos"}
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        filtering ? (
          <EmptyState icon={Users} title="Sin resultados" description="Prueba con otro nombre, documento o teléfono." />
        ) : (
          <EmptyState
            icon={Users}
            title="Todavía no hay clientes"
            description="Registra a tus técnicos y clientes frecuentes para asignarles su lista de precios y ver su historial."
            action={<Button render={<Link href="/clientes/nuevo" />}>Nuevo cliente</Button>}
          />
        )
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Lista de precios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {!c.isActive ? (
                      <Badge variant="secondary" className="ml-2">
                        Inactivo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDoc(c.docType, c.docNumber) || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="tabular-nums">{c.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={c.customerType === "technician" ? "default" : "outline"}>{CUSTOMER_TYPE_LABEL[c.customerType]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.priceListName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} total={total} basePath="/clientes" params={params} />
    </div>
  );
}
