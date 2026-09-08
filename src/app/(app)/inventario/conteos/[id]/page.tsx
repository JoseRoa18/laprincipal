import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { can, requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { getCount } from "@/modules/inventory/infrastructure/counts";
import { CountSheet } from "@/modules/inventory/ui/count-sheet";
import { CountStatusBadge, countFilterLabel } from "@/modules/inventory/ui/status-badges";

export const metadata = { title: "Conteo físico" };

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "warehouse");
  const { id } = await params;
  const count = await getCount(id);
  if (!count) notFound();

  const title = count.number ? `Conteo ${count.number}` : "Conteo en curso";
  const description =
    count.status === "open"
      ? `${countFilterLabel(count.filter, count.categoryName)} · iniciado por ${count.startedByName} el ${formatDateTime(count.startedAt)}${count.blind ? " · ciego" : ""}`
      : count.status === "applied"
        ? `${countFilterLabel(count.filter, count.categoryName)} · aplicado por ${count.appliedByName ?? count.startedByName} el ${formatDateTime(count.appliedAt)}`
        : `${countFilterLabel(count.filter, count.categoryName)} · cancelado`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <CountStatusBadge status={count.status} />
            <Button variant="outline" render={<Link href="/inventario/conteos" />}>
              Volver a conteos
            </Button>
          </>
        }
      />
      {count.notes ? <p className="text-muted-foreground text-sm">{count.notes}</p> : null}
      <CountSheet
        key={`${count.id}-${count.status}`}
        countId={count.id}
        status={count.status}
        blind={count.blind}
        items={count.items}
        canApply={can(user.role, "count_stock")}
        showCosts={can(user.role, "view_costs")}
      />
    </div>
  );
}
