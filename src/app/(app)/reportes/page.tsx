import { Boxes, ChartColumn, Clock, Gauge, PackageX, Percent, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { getStatsComputedAt } from "@/modules/reporting/application/product-stats";
import { RecomputeButton } from "@/modules/reporting/ui/recompute-button";

export const metadata = { title: "Reportes" };

const REPORTS = [
  {
    href: "/reportes/ventas",
    title: "Ventas",
    description: "Por día, producto, categoría, vendedor, método de pago y hora. Con gráfico y Excel.",
    icon: ChartColumn,
  },
  {
    href: "/reportes/velocidad",
    title: "Velocidad de venta y ABC",
    description: "Cuánto se vende por día, días de cobertura, semáforo y cuándo comprar.",
    icon: Gauge,
  },
  {
    href: "/reportes/inventario",
    title: "Inventario valorizado",
    description: "Cuánto vale el inventario a costo, por categoría y por producto.",
    icon: Boxes,
  },
  {
    href: "/reportes/margen",
    title: "Margen bruto",
    description: "Ingresos, costo y margen por producto y por categoría.",
    icon: Percent,
  },
  {
    href: "/reportes/sin-movimiento",
    title: "Sin movimiento",
    description: "Productos con existencia que llevan tiempo sin venderse y el dinero inmovilizado.",
    icon: PackageX,
  },
  {
    href: "/compras/que-comprar",
    title: "Qué comprar",
    description: "Sugerencia de compra agrupada por proveedor, en el módulo de Compras.",
    icon: ShoppingBag,
  },
];

export default async function ReportsPage() {
  await requireRole("admin");
  const computedAt = await getStatsComputedAt();

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Ventas, inventario, velocidad de venta y margen del negocio." />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Estadísticas de venta por producto</p>
              <p className="text-muted-foreground text-sm">
                {computedAt
                  ? `Último cálculo: ${formatDateTime(computedAt)}. Se recalculan solas cada día a las 3:00 a. m.`
                  : "Todavía no se han calculado. Se recalculan solas cada día a las 3:00 a. m., o ahora mismo con el botón."}
              </p>
            </div>
          </div>
          <RecomputeButton variant="outline" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <r.icon className="text-muted-foreground size-4" />
                  {r.title}
                </CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
