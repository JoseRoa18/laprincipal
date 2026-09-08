import { ArrowRight, Pencil, Tags } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StockStatusBadge } from "@/components/app/stock-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireUser } from "@/lib/auth-guards";
import { formatDate, formatDateTime, formatPct, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import { priceMargin } from "@/modules/catalog/domain/pricing";
import { getProductDetail } from "@/modules/catalog/infrastructure/product-detail";
import { BarcodeManager } from "@/modules/catalog/ui/barcode-manager";
import { MOVEMENT_TYPE_LABEL, STOCK_MODE_LABEL } from "@/modules/catalog/ui/labels-es";
import { ProductGallery } from "@/modules/catalog/ui/product-gallery";
import { ProductStatusActions } from "@/modules/catalog/ui/product-status-actions";
import { getDefaultLocation } from "@/modules/core/application/context";
import { displayAmounts } from "@/modules/currency/domain/conversion";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getDefaultLocation();
  const product = await getProductDetail(id, location.warehouseId);
  return { title: product ? product.name : "Producto" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const location = await getDefaultLocation();
  const [product, rates] = await Promise.all([getProductDetail(id, location.warehouseId), getRatesSnapshot()]);
  if (!product || product.deletedAt) notFound();

  const canManage = can(user.role, "manage_products");
  const showCosts = can(user.role, "view_costs");
  const amounts = (usd: string | null) => (usd ? displayAmounts(usd, rates.rateSet, rates.currencies) : null);
  const publicAmounts = amounts(product.prices.publicUsd);
  const techAmounts = amounts(product.prices.techUsd);
  const margin = priceMargin(product.prices.publicUsd ?? "", product.costAvgUsd);
  const techMargin = priceMargin(product.prices.techUsd ?? "", product.costAvgUsd);

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.name}
        description={[product.partNumber ? `N.º de parte ${product.partNumber}` : null, product.sku, product.brand?.name].filter(Boolean).join(" · ")}
        actions={
          canManage ? (
            <>
              <Button variant="outline" render={<Link href={`/productos/etiquetas?add=${product.id}`} />}>
                <Tags /> Etiqueta
              </Button>
              <ProductStatusActions productId={product.id} isActive={product.isActive} movementCount={product.movementCount} />
              <Button size="lg" render={<Link href={`/productos/${product.id}/editar`} />}>
                <Pencil /> Editar
              </Button>
            </>
          ) : undefined
        }
      />
      {!product.isActive ? <Badge variant="secondary">Producto inactivo: no aparece en el punto de venta</Badge> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductGallery productId={product.id} productName={product.name} images={product.images} canEdit={canManage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Precios</CardTitle>
            <CardDescription>Con IVA incluido ({formatPct(D(product.tax.rate).mul(100), 0)}). {rates.missing.length > 0 ? `Sin tasa para ${rates.missing.join(" y ")}.` : "Tasa del día."}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <div className="py-2">
                <p className="text-muted-foreground text-xs">Precio público</p>
                <p className="text-2xl font-semibold tabular-nums">{product.prices.publicUsd ? <Money value={product.prices.publicUsd} /> : "—"}</p>
                {publicAmounts ? (
                  <p className="text-muted-foreground text-sm">
                    {Object.entries(publicAmounts)
                      .filter(([code]) => code !== "USD")
                      .map(([code, value]) => (
                        <span key={code} className="mr-3">
                          <Money value={value} currency={code} />
                        </span>
                      ))}
                  </p>
                ) : null}
              </div>
              <div className="py-2">
                <p className="text-muted-foreground text-xs">Precio técnico</p>
                <p className="text-xl font-semibold tabular-nums">{product.prices.techUsd ? <Money value={product.prices.techUsd} /> : "—"}</p>
                {techAmounts ? (
                  <p className="text-muted-foreground text-sm">
                    {Object.entries(techAmounts)
                      .filter(([code]) => code !== "USD")
                      .map(([code, value]) => (
                        <span key={code} className="mr-3">
                          <Money value={value} currency={code} />
                        </span>
                      ))}
                  </p>
                ) : null}
              </div>
              {showCosts ? (
                <>
                  <Row label="Costo promedio">
                    <Money value={product.costAvgUsd} />
                  </Row>
                  {product.costLastUsd ? (
                    <Row label="Último costo">
                      <Money value={product.costLastUsd} />
                    </Row>
                  ) : null}
                  <Row label="Margen público / técnico">
                    <span className={margin.belowCost ? "text-destructive" : undefined}>{margin.marginPct ? formatPct(margin.marginPct) : "—"}</span>
                    {" / "}
                    <span className={techMargin.belowCost ? "text-destructive" : undefined}>{techMargin.marginPct ? formatPct(techMargin.marginPct) : "—"}</span>
                  </Row>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Stock <StockStatusBadge status={product.stock.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatQty(product.stock.available, product.unit.decimals)} <span className="text-muted-foreground text-base font-normal">{product.unit.symbol} disponibles</span>
            </p>
            <dl className="mt-2 divide-y">
              {D(product.stock.reserved).gt(0) ? (
                <Row label="Físico / reservado">
                  {formatQty(product.stock.physical, product.unit.decimals)} / {formatQty(product.stock.reserved, product.unit.decimals)}
                </Row>
              ) : null}
              <Row label="Mínimo / máximo">
                {formatQty(product.stock.minStock, product.unit.decimals)} / {formatQty(product.stock.maxStock, product.unit.decimals)}
              </Row>
              <Row label="Punto de reorden">{formatQty(product.stock.reorderPoint, product.unit.decimals)}</Row>
              <Row label="Modo">{STOCK_MODE_LABEL[product.stock.mode]}</Row>
              <Row label="Ubicación">{product.locationCode ?? "—"}</Row>
              {product.stats ? (
                <>
                  <Row label="Velocidad de venta">{formatQty(product.stats.velocity, 2)} / día</Row>
                  <Row label="Días de cobertura">{product.stats.daysOfCover ? formatQty(product.stats.daysOfCover, 0) : "—"}</Row>
                  <Row label="Clase ABC">{product.stats.abcClass ?? "—"}</Row>
                  <Row label="Sugerencia de compra">{formatQty(product.stats.suggestedQty, product.unit.decimals)}</Row>
                  <Row label="Última venta">{product.stats.lastSaleAt ? formatDate(product.stats.lastSaleAt) : "—"}</Row>
                </>
              ) : (
                <p className="text-muted-foreground pt-2 text-xs">Sin estadísticas de venta todavía; se usan el mínimo y el máximo manuales.</p>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="SKU">{product.sku}</Row>
              <Row label="Número de parte">{product.partNumber ?? "—"}</Row>
              <Row label="Categoría">{product.category ? (product.category.parentName ? `${product.category.parentName} > ${product.category.name}` : product.category.name) : "—"}</Row>
              <Row label="Marca">{product.brand?.name ?? "—"}</Row>
              <Row label="Unidad">{product.unit.name}</Row>
              <Row label="Impuesto">{product.tax.name}</Row>
              <Row label="Garantía">{product.warrantyDays > 0 ? `${product.warrantyDays} días` : "Sin garantía"}</Row>
              <Row label="Creado">{formatDate(product.createdAt)}</Row>
            </dl>
            {product.description ? <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">{product.description}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compatible con</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product.compatibilities.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin compatibilidades registradas.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {product.compatibilities.map((c) => (
                  <li key={c.id}>
                    <Badge variant="outline" className="text-sm font-normal">
                      {[c.applianceType, c.brand, c.model].filter(Boolean).join(" ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium">Códigos equivalentes</p>
            {product.equivalences.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin equivalencias registradas.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {product.equivalences.map((e) => (
                  <li key={e.id}>
                    <Badge variant="secondary" className="font-mono text-sm font-normal">
                      {e.code}
                      {e.brand ? <span className="text-muted-foreground ml-1 font-sans">({e.brand})</span> : null}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Códigos de barras</CardTitle>
            <CardDescription>Escanea o escribe los del fabricante; si no trae, genera uno interno para imprimirlo en etiquetas.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarcodeManager productId={product.id} barcodes={product.barcodes} canEdit={canManage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proveedores</CardTitle>
          </CardHeader>
          <CardContent>
            {product.suppliers.length === 0 ? (
              <p className="text-muted-foreground text-sm">Se llenará con las entradas por compra.</p>
            ) : (
              <ul className="divide-y">
                {product.suppliers.map((s) => (
                  <li key={s.supplierId} className="py-2 text-sm">
                    <p className="font-medium">
                      {s.name} {s.isPreferred ? <Badge variant="secondary">Preferido</Badge> : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {s.supplierCode ? `Código ${s.supplierCode} · ` : ""}
                      {showCosts && s.lastCostUsd ? (
                        <>
                          Último costo <Money value={s.lastCostUsd} />
                          {" · "}
                        </>
                      ) : null}
                      {s.lastPurchaseAt ? `Última compra ${formatDate(s.lastPurchaseAt)} · ` : ""}
                      Entrega {s.leadTimeDays} días
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Últimos movimientos
              <Button variant="ghost" size="sm" render={<Link href={`/inventario/movimientos?product=${product.id}`} />}>
                Ver kardex completo <ArrowRight />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {product.movements.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin movimientos de inventario.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    {showCosts ? <TableHead className="text-right">Costo</TableHead> : null}
                    <TableHead>Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
                      <TableCell>
                        {MOVEMENT_TYPE_LABEL[m.type] ?? m.type}
                        {m.reasonName ? <span className="text-muted-foreground text-xs"> · {m.reasonName}</span> : null}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${D(m.quantity).lt(0) ? "text-destructive" : "text-emerald-700"}`}>
                        {D(m.quantity).gt(0) ? "+" : ""}
                        {formatQty(m.quantity, product.unit.decimals)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(m.balanceAfter, product.unit.decimals)}</TableCell>
                      {showCosts ? (
                        <TableCell className="text-right">
                          <Money value={m.unitCostUsd} />
                        </TableCell>
                      ) : null}
                      <TableCell className="text-muted-foreground">{m.userName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial de precios</CardTitle>
          </CardHeader>
          <CardContent>
            {product.priceHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin cambios de precio.</p>
            ) : (
              <ul className="divide-y">
                {product.priceHistory.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{h.listName}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(h.changedAt)}
                        {h.changedBy ? ` · ${h.changedBy}` : ""}
                      </p>
                    </div>
                    <p className="tabular-nums">
                      {h.oldPriceUsd ? (
                        <span className="text-muted-foreground line-through">
                          <Money value={h.oldPriceUsd} />
                        </span>
                      ) : null}{" "}
                      <Money value={h.newPriceUsd} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
