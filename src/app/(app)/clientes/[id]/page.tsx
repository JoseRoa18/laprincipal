import { FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setCustomerActiveAction } from "@/app/(app)/clientes/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatDateTime } from "@/lib/format";
import { CUSTOMER_TYPE_LABEL, formatDoc } from "@/modules/customers/domain/schema";
import { getCustomer, getCustomerHistory } from "@/modules/customers/infrastructure/customers";

export const metadata = { title: "Cliente" };

const SALE_STATUS: Record<string, string> = {
  held: "En espera",
  completed: "Completada",
  voided: "Anulada",
  refunded: "Devuelta",
  partially_refunded: "Devolución parcial",
};

const QUOTE_STATUS: Record<string, string> = {
  open: "Abierta",
  accepted: "Aceptada",
  converted: "Convertida",
  expired: "Vencida",
  cancelled: "Cancelada",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "seller");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const history = await getCustomerHistory(id);

  const doc = formatDoc(customer.docType, customer.docNumber);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={[doc, customer.kind === "company" ? "Empresa" : "Persona"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" render={<Link href={`/clientes/${customer.id}/editar`} />}>
              Editar
            </Button>
            <ConfirmButton
              title={customer.isActive ? "¿Desactivar cliente?" : "¿Activar cliente?"}
              description={
                customer.isActive
                  ? "No aparecerá en las búsquedas del punto de venta. Su historial se conserva."
                  : "Volverá a aparecer en las búsquedas del punto de venta."
              }
              confirmLabel={customer.isActive ? "Desactivar" : "Activar"}
              destructive={customer.isActive}
              variant={customer.isActive ? "destructive" : "default"}
              action={setCustomerActiveAction.bind(null, customer.id, !customer.isActive)}
              successMessage={customer.isActive ? "Cliente desactivado" : "Cliente activado"}
            >
              {customer.isActive ? "Desactivar" : "Activar"}
            </ConfirmButton>
          </>
        }
      />

      {!customer.isActive ? <Badge variant="secondary">Cliente inactivo</Badge> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Item label="Tipo de cliente">
                <Badge variant={customer.customerType === "technician" ? "default" : "outline"}>{CUSTOMER_TYPE_LABEL[customer.customerType]}</Badge>
              </Item>
              <Item label="Lista de precios">{customer.priceListName ?? "—"}</Item>
              <Item label="Teléfono">{customer.phone || "—"}</Item>
              <Item label="Correo">{customer.email || "—"}</Item>
              <Item label="Dirección">{customer.address || "—"}</Item>
              <Item label="Registrado">{formatDate(customer.createdAt)}</Item>
              {customer.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Notas</dt>
                  <dd className="whitespace-pre-line text-sm">{customer.notes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                <Money value={history.totals.totalUsd} currency="USD" />
              </p>
              <p className="text-muted-foreground text-xs">
                {history.totals.salesCount} {history.totals.salesCount === 1 ? "venta" : "ventas"}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Última compra: {history.totals.lastSaleAt ? formatDateTime(history.totals.lastSaleAt) : "ninguna todavía"}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Historial de compras</h2>
        {history.sales.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin compras" description="Las ventas a este cliente aparecerán aquí." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="hidden md:table-cell">Vendedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/ventas/${s.id}`} className="font-medium hover:underline">
                        {s.number ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDateTime(s.saleDate)}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.sellerName}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "completed" ? "outline" : "secondary"}>{SALE_STATUS[s.status] ?? s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={s.totalUsd} currency="USD" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Cotizaciones</h2>
        {history.quotes.length === 0 ? (
          <EmptyState icon={FileText} title="Sin cotizaciones" description="Las cotizaciones de este cliente aparecerán aquí." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="hidden md:table-cell">Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link href={`/cotizaciones/${q.id}`} className="font-medium hover:underline">
                        {q.number ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDateTime(q.createdAt)}</TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(q.validUntil)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{QUOTE_STATUS[q.status] ?? q.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={q.totalUsd} currency="USD" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
