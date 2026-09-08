import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  DatabaseBackup,
  Hash,
  KeyRound,
  ListChecks,
  Percent,
  Printer,
  Ruler,
  Shield,
  TriangleAlert,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth-guards";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";

export const metadata = { title: "Configuración" };

const SECTIONS: Array<{ href: string; title: string; description: string; icon: LucideIcon }> = [
  { href: "/configuracion/empresa", title: "Empresa", description: "Nombre, RIF, dirección, teléfono y logo para los tickets.", icon: Building2 },
  { href: "/configuracion/tasas", title: "Tasas de cambio", description: "Bs y COP por 1 USD, con historial de quién y cuándo.", icon: BadgeDollarSign },
  { href: "/configuracion/impuestos", title: "Impuestos", description: "IVA y exentos. El impuesto por defecto se aplica a productos nuevos.", icon: Percent },
  { href: "/configuracion/metodos-de-pago", title: "Métodos de pago", description: "Efectivo, Zelle, Binance, Punto de venta y Pago Móvil.", icon: CreditCard },
  { href: "/configuracion/motivos", title: "Motivos de ajuste", description: "Merma, daño, garantía y otros motivos de ajustes y devoluciones.", icon: ListChecks },
  { href: "/configuracion/unidades", title: "Unidades", description: "Unidad, par, metro, kilogramo y sus decimales.", icon: Ruler },
  { href: "/configuracion/series", title: "Series de documentos", description: "Prefijo y numeración de ventas, cotizaciones, devoluciones y cierres.", icon: Hash },
  { href: "/configuracion/impresion", title: "Impresión", description: "Ancho del ticket, pie de página y monedas mostradas.", icon: Printer },
  { href: "/configuracion/politicas", title: "Políticas", description: "Stock negativo, descuentos por rol, ventana de anulación y vigencia de cotizaciones.", icon: Shield },
  { href: "/configuracion/usuarios", title: "Usuarios", description: "Cuentas, roles, contraseñas y PIN del personal.", icon: UserCog },
  { href: "/configuracion/respaldos", title: "Respaldos", description: "Copia completa de los datos y exportación a Excel.", icon: DatabaseBackup },
  { href: "/configuracion/mi-cuenta", title: "Mi cuenta", description: "Cambia tu contraseña y tu PIN.", icon: KeyRound },
];

export default async function SettingsPage() {
  await requireRole("admin");
  const rates = await getRatesSnapshot();
  const rateProblem = rates.missing.length > 0 ? `Falta la tasa de ${rates.missing.join(" y ")}.` : rates.stale.length > 0 ? `La tasa de ${rates.stale.join(" y ")} no es de hoy.` : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Ajustes del negocio. Solo el administrador puede cambiarlos." />

      {rateProblem ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <TriangleAlert className="size-5 shrink-0 text-amber-600" />
              <p className="text-sm font-medium">{rateProblem}</p>
            </div>
            <Button size="sm" render={<Link href="/configuracion/tasas" />}>
              Cargar tasa de hoy
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3">
            <Card className="hover:bg-muted/50 h-full transition-colors">
              <CardContent className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <s.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-muted-foreground text-sm">{s.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
