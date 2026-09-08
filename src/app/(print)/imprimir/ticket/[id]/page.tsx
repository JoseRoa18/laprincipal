import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-guards";
import { getSaleDetail } from "@/modules/sales/infrastructure/sales-queries";
import { PrintControls } from "@/modules/sales/ui/ticket/print-controls";
import { TicketView } from "@/modules/sales/ui/ticket/ticket-view";
import { getCompanySettings, getPrintingSettings } from "@/modules/settings/infrastructure/settings";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = /^[0-9a-f-]{36}$/i.test(id) ? await getSaleDetail(id) : null;
  return { title: sale?.number ? `Ticket ${sale.number}` : "Ticket" };
}

/** 58/80 mm receipt. `?auto=1` prints on load (used by the hidden frame after a sale). */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [sale, company, printing] = await Promise.all([getSaleDetail(id), getCompanySettings(), getPrintingSettings()]);
  if (!sale || sale.status === "held") notFound();
  const auto = sp.auto === "1";

  return (
    <>
      <style>{`@page { size: ${printing.ticketWidthMm}mm auto; margin: 2mm; } @media print { html, body { background: white; } }`}</style>
      <PrintControls auto={auto} backHref={`/ventas/${sale.id}`} />
      <TicketView sale={sale} company={company} printing={printing} />
    </>
  );
}
