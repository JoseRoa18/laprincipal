import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getSessionSummary } from "@/modules/cash/application/session-summary";
import { CloseSessionForm } from "@/modules/cash/ui/close-session-form";

export const metadata = { title: "Cerrar caja" };

export default async function CloseCashPage() {
  await requireRole("admin", "seller");
  const session = await getOpenCashSession();
  if (!session) redirect("/caja");
  const summary = await getSessionSummary(session.id);

  const currencies = summary.currencies.map((c) => ({
    ...c,
    expected: summary.balances.find((b) => b.currencyCode === c.code)?.expected ?? "0",
  }));
  const methods = summary.methods
    .filter((m) => !m.countsInDrawer)
    .map((m) => ({
      paymentMethodId: m.paymentMethodId,
      name: m.name,
      currencyCode: m.currencyCode,
      count: m.count,
      amount: m.amount,
      amountUsd: m.amountUsd,
      refundsAmount: m.refundsAmount,
    }));
  const references = summary.payments
    .filter((p) => !p.countsInDrawer)
    .map((p) => ({
      paymentMethodId: p.paymentMethodId,
      methodName: p.methodName,
      currencyCode: p.currencyCode,
      amount: String(p.amount),
      reference: p.reference ?? null,
      saleNumber: p.saleNumber ?? null,
      at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Cerrar caja"
        description={`${summary.session.number ?? ""} · abierta por ${summary.session.openedBy.name} el ${formatDateTime(summary.session.openedAt)}`}
        actions={
          <Button variant="outline" render={<Link href="/caja" />}>
            Volver a caja
          </Button>
        }
      />
      <CloseSessionForm sessionNumber={summary.session.number ?? ""} currencies={currencies} methods={methods} references={references} />
    </div>
  );
}
