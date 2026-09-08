import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listCurrencies } from "@/modules/currency/infrastructure/rates";
import { listPaymentMethodsForSettings } from "@/modules/settings/infrastructure/catalogs";
import { PaymentMethodsTable } from "@/modules/settings/ui/payment-methods-table";

export const metadata = { title: "Métodos de pago" };

export default async function PaymentMethodsPage() {
  await requireRole("admin");
  const [methods, currencies] = await Promise.all([listPaymentMethodsForSettings(), listCurrencies()]);

  return (
    <div className="space-y-4">
      <Link href="/configuracion" className="tap-target text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" />
        Volver a configuración
      </Link>
      <PageHeader title="Métodos de pago" description="Formas de cobro disponibles al vender. Las de efectivo cuentan en la caja y pueden dar cambio." />
      <PaymentMethodsTable methods={methods} currencies={currencies.map((c) => ({ code: c.code, symbol: c.symbol }))} />
    </div>
  );
}
