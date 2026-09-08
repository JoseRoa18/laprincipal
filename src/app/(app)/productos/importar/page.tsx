import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { listImportJobs } from "@/modules/catalog/application/import";
import { ImportWizard } from "@/modules/catalog/ui/import-wizard";

export const metadata = { title: "Importar productos" };

export default async function ImportPage() {
  await requireRole("admin");
  const jobs = await listImportJobs(10);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Importar productos desde Excel" description="Descarga la plantilla, llénala y súbela. Se validan todas las filas antes de guardar." />
      <ImportWizard jobs={jobs} />
    </div>
  );
}
