import { PackagePlus, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth-guards";
import { getPurchasingSummary } from "@/modules/purchasing/infrastructure/receipts";
import { countProductsToBuy } from "@/modules/purchasing/infrastructure/suggestions";
import { countActiveSuppliers } from "@/modules/purchasing/infrastructure/suppliers";

export const metadata = { title: "Compras" };

export default async function PurchasingPage() {
  await requireRole("admin", "warehouse");
  const [summary, suppliers, toBuy] = await Promise.all([getPurchasingSummary(), countActiveSuppliers(), countProductsToBuy()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras"
        description="Proveedores, entradas de mercancía y qué comprar"
        actions={
          <Button render={<Link href="/compras/entradas/nueva" />}>
            <PackagePlus data-icon="inline-start" /> Nueva entrada
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Entradas este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{summary.receiptsThisMonth}</p>
            <p className="text-muted-foreground text-xs">
              <Money value={summary.totalThisMonthUsd} currency="USD" /> recibidos
              {summary.drafts > 0 ? ` · ${summary.drafts} en borrador` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Proveedores activos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{suppliers}</p>
            <p className="text-muted-foreground text-xs">Con moneda y tiempo de entrega</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Productos por comprar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{toBuy}</p>
            <p className="text-muted-foreground text-xs">Por debajo del punto de reorden</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="size-4" /> Proveedores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">Datos de contacto, moneda en la que cotizan y productos que surten.</p>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" render={<Link href="/compras/proveedores" />}>
              Ver proveedores
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="size-4" /> Entradas por compra
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">Registra la mercancía con el documento del proveedor; el stock y el costo se actualizan solos.</p>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" render={<Link href="/compras/entradas" />}>
              Ver entradas
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="size-4" /> Qué comprar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">Sugerencia de compra por proveedor con cantidades editables y exportación a Excel.</p>
            <Button size="lg" className="w-full sm:w-auto" render={<Link href="/compras/que-comprar" />}>
              Ver qué comprar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
