import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { listCurrencies } from "@/modules/currency/infrastructure/rates";
import { listActivePaymentMethods } from "@/modules/sales/infrastructure/payment-methods";
import { getSaleDetail, listReturnReasons } from "@/modules/sales/infrastructure/sales-queries";
import { ReturnForm } from "@/modules/sales/ui/sales/return-form";

export const metadata = { title: "Devolución" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sale = await getSaleDetail(id);
  if (!sale || sale.status === "held") notFound();
  const returnable = sale.status === "completed" || sale.status === "partially_refunded";
  const [reasons, methods, currencies] = await Promise.all([listReturnReasons(), listActivePaymentMethods(), listCurrencies()]);
  const originalMethodIds = [...new Set(sale.payments.map((p) => methods.find((m) => m.code === p.methodCode)?.id).filter((x): x is string => Boolean(x)))];

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/ventas/${id}`, label: "Volver a la venta" }}
        title={`Devolver de la venta ${sale.number ?? ""}`}
        description={`${formatDateTime(sale.saleDate)} · ${sale.customer ? sale.customer.name : "Consumidor final"}`}
      />
      {!returnable ? (
        <Alert>
          <AlertTitle>Esta venta no admite devoluciones</AlertTitle>
          <AlertDescription>Solo las ventas completadas o con devolución parcial pueden devolverse.</AlertDescription>
        </Alert>
      ) : (
        <ReturnForm
          saleId={sale.id}
          saleNumber={sale.number}
          items={sale.items.map((i) => ({
            id: i.id,
            description: i.description,
            quantity: i.quantity,
            returnedQty: i.returnedQty,
            unitPriceUsd: i.unitPriceUsd,
            lineTotalUsd: i.lineTotalUsd,
            unitDecimals: i.unitDecimals,
            unitSymbol: i.unitSymbol,
          }))}
          reasons={reasons}
          methods={methods}
          originalMethodIds={originalMethodIds}
          rates={{ VES: sale.rateVes, COP: sale.rateCop }}
          currencies={currencies.map((c) => ({ ...c, cashRounding: String(c.cashRounding) }))}
        />
      )}
    </div>
  );
}
