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
      <PageHeader back={{ href: "/configuracion", label: "Volver a configuración" }} title="Métodos de pago" description="Formas de cobro disponibles al vender. Las de efectivo cuentan en la caja y pueden dar cambio." />
      <PaymentMethodsTable methods={methods} currencies={currencies.map((c) => ({ code: c.code, symbol: c.symbol }))} />
    </div>
  );
}
