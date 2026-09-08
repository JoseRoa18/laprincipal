import { LockOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { reopenCashSessionAction } from "@/app/(app)/caja/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getSessionSummary } from "@/modules/cash/application/session-summary";
import { getCashSessionDetail, getLatestSession } from "@/modules/cash/infrastructure/queries";
import { ClosingReport, type ReportData } from "@/modules/cash/ui/closing-report";
import { PrintButton } from "@/modules/cash/ui/print-button";
import { getCompanySettings } from "@/modules/settings/infrastructure/settings";

export const metadata = { title: "Cierre de caja" };

export default async function CashSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "seller");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getCashSessionDetail(id);
  if (!detail) notFound();
  const company = await getCompanySettings();
  const isAdmin = user.role === "admin";

  let data: ReportData;
  if (detail.status === "closed" && detail.closingSummary) {
    const cs = detail.closingSummary;
    data = {
      companyName: company.name,
      number: detail.number,
      status: "closed",
      openedAt: detail.openedAt,
      openedByName: detail.openedBy.name,
      closedAt: detail.closedAt,
      closedByName: detail.closedBy?.name ?? null,
      notes: detail.notes,
      closingNotes: detail.closingNotes,
      balances: cs.balances,
      methods: cs.methods,
      totals: cs.totals,
      references: cs.references,
      movements: detail.movements,
      reconciled: cs.counts?.reconciled ?? {},
    };
  } else {
    const live = await getSessionSummary(id);
    data = {
      companyName: company.name,
      number: detail.number,
      status: detail.status,
      openedAt: detail.openedAt,
      openedByName: detail.openedBy.name,
      closedAt: detail.closedAt,
      closedByName: detail.closedBy?.name ?? null,
      notes: detail.notes,
      closingNotes: detail.closingNotes,
      balances: live.balances.map((b) => {
        const stored = detail.balances.find((x) => x.currencyCode === b.currencyCode);
        return { ...b, counted: stored?.countedAmount ?? null, difference: stored?.difference ?? null, justification: stored?.justification ?? null };
      }),
      methods: live.methods,
      totals: live.totals,
      references: live.payments
        .filter((p) => !p.countsInDrawer)
        .map((p) => ({
          paymentMethodId: p.paymentMethodId,
          methodName: p.methodName,
          currencyCode: p.currencyCode,
          amount: String(p.amount),
          amountUsd: String(p.amountUsd),
          reference: p.reference ?? null,
          saleNumber: p.saleNumber ?? null,
          at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        })),
      movements: detail.movements,
      reconciled: {},
    };
  }

  let canReopen = false;
  if (isAdmin && detail.status === "closed") {
    const [latest, open] = await Promise.all([getLatestSession(detail.registerId), getOpenCashSession(undefined, detail.registerId)]);
    canReopen = latest?.id === detail.id && !open;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        className="no-print"
        title={`Cierre de caja ${detail.number ?? ""}`}
        description={detail.status === "open" ? "La sesión sigue abierta; estos totales cambian con cada venta." : undefined}
        actions={
          <>
            <Button variant="outline" render={<Link href={isAdmin ? "/caja/historial" : "/caja"} />}>
              {isAdmin ? "Historial" : "Volver a caja"}
            </Button>
            {detail.status === "closed" ? <PrintButton /> : null}
            {canReopen ? (
              <ConfirmButton
                title="¿Reabrir esta caja?"
                description="La sesión volverá a estar abierta y el conteo de cierre se descartará (queda registrado en la auditoría). Solo se puede reabrir la última sesión."
                confirmLabel="Reabrir"
                variant="outline"
                action={reopenCashSessionAction.bind(null, detail.id)}
                successMessage="Caja reabierta"
              >
                <LockOpen />
                Reabrir
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      <ClosingReport data={data} />
    </div>
  );
}
