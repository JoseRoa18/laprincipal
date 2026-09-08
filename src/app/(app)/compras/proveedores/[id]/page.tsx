import { PackagePlus, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDate, formatQty } from "@/lib/format";
import { RECEIPT_STATUS_LABEL, currencyLabel } from "@/modules/purchasing/infrastructure/labels";
import { getSupplier, listSupplierProducts, listSupplierReceipts } from "@/modules/purchasing/infrastructure/suppliers";
import { PreferredToggle } from "@/modules/purchasing/ui/preferred-toggle";

export const metadata = { title: "Proveedor" };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "warehouse");
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  const [products, receipts] = await Promise.all([listSupplierProducts(id), listSupplierReceipts(id, 10)]);

  const info: Array<[string, string | null]> = [
    ["RIF", supplier.taxId],
    ["Contacto", supplier.contactName],
    ["Teléfono", supplier.phone],
    ["Correo", supplier.email],
    ["Dirección", supplier.address],
    ["Moneda", currencyLabel(supplier.currencyCode)],
    ["Tiempo de entrega", `${supplier.leadTimeDays} días`],
    ["Condiciones de pago", supplier.paymentTerms],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={supplier.isActive ? undefined : "Proveedor inactivo"}
        actions={
          <>
            {!supplier.isActive ? <Badge variant="secondary">Inactivo</Badge> : null}
            <Button variant="outline" render={<Link href={`/compras/proveedores/${id}/editar`} />}>
              <Pencil data-icon="inline-start" /> Editar
            </Button>
            <Button render={<Link href={`/compras/entradas/nueva?supplier=${id}`} />}>
              <PackagePlus data-icon="inline-start" /> Nueva entrada
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {info.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">{label}</dt>
                  <dd className="text-right">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {supplier.notes ? <p className="text-muted-foreground mt-3 border-t pt-3 text-sm whitespace-pre-line">{supplier.notes}</p> : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Últimas entradas</CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Todavía no hay entradas de este proveedor.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/compras/entradas/${r.id}`} className="font-medium hover:underline">
                          {r.number ?? "Borrador"}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(r.receiptDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.supplierDocument ?? "—"}</TableCell>
                      <TableCell>{RECEIPT_STATUS_LABEL[r.status]}</TableCell>
                      <TableCell className="text-right">
                        <Money value={r.totalUsd} currency="USD" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Productos que surte</h2>
        {products.length === 0 ? (
          <EmptyState title="Sin productos asociados" description="Al aplicar una entrada por compra, los productos recibidos quedan asociados a este proveedor con su último costo." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Pref.</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cód. proveedor</TableHead>
                <TableHead className="text-right">Existencia</TableHead>
                <TableHead className="text-right">Último costo</TableHead>
                <TableHead className="text-right">Último costo USD</TableHead>
                <TableHead>Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.productId}>
                  <TableCell>
                    <PreferredToggle productId={p.productId} supplierId={id} isPreferred={p.isPreferred} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/productos/${p.productId}`} className="font-medium hover:underline">
                      {p.productName}
                    </Link>
                    <span className="text-muted-foreground block text-xs">{[p.partNumber, p.sku].filter(Boolean).join(" · ")}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.supplierCode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(p.stock, p.unitDecimals)} {p.unitSymbol}
                  </TableCell>
                  <TableCell className="text-right">{p.lastCostAmount ? <Money value={p.lastCostAmount} currency={p.lastCostCurrency ?? "USD"} /> : "—"}</TableCell>
                  <TableCell className="text-right">{p.lastCostUsd ? <Money value={p.lastCostUsd} currency="USD" /> : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.lastPurchaseAt ? formatDate(p.lastPurchaseAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
