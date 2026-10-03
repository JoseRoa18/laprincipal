import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listDocumentSeries } from "@/modules/settings/infrastructure/catalogs";
import { SeriesTable } from "@/modules/settings/ui/series-table";

export const metadata = { title: "Series de documentos" };

export default async function SeriesPage() {
  await requireRole("admin");
  const series = await listDocumentSeries();

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/configuracion", label: "Volver a configuración" }} title="Series de documentos" description="Prefijo y numeración consecutiva de cada tipo de documento (ventas, cotizaciones, ajustes...)." />
      <SeriesTable series={series} />
    </div>
  );
}
