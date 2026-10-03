import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { D } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getSessionSummary } from "@/modules/cash/application/session-summary";
import { computeDifference } from "@/modules/cash/domain/summary";
import { CloseSessionForm } from "@/modules/cash/ui/close-session-form";

export const metadata = { title: "Cerrar caja" };

export default async function CloseCashPage() {
  await requireRole("admin", "seller");
  const session = await getOpenCashSession();
  if (!session) redirect("/caja");
  const summary = await getSessionSummary(session.id);

  // Blind count: the expected cash only reaches the browser once a count is
  // registered, and only while no sale or movement has changed it since.
  const registered = summary.balances.map((b) => {
    const stored = summary.session.balances.find((x) => x.currencyCode === b.currencyCode);
    return stored?.countedAmount != null && stored.expectedAmount != null && D(stored.expectedAmount).eq(b.expected)
      ? { currencyCode: b.currencyCode, expected: b.expected, counted: stored.countedAmount, difference: computeDifference(b.expected, stored.countedAmount) }
      : null;
  });
  const initialCount = registered.every((r) => r !== null) && registered.length > 0 ? registered.filter((r) => r !== null) : null;
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
      <CloseSessionForm
        sessionNumber={summary.session.number ?? ""}
        currencies={summary.currencies}
        methods={methods}
        references={references}
        initialCount={initialCount}
      />
    </div>
  );
}
