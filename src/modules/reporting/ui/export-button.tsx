import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReportKind = "sales" | "inventory" | "velocity" | "margin" | "no_movement";

/** Link to the Excel export of a report with its current filters. */
export function ExportButton({
  report,
  params = {},
  label = "Exportar a Excel",
  disabled,
}: {
  report: ReportKind;
  params?: Record<string, string | undefined>;
  label?: string;
  disabled?: boolean;
}) {
  const sp = new URLSearchParams({ report });
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return (
    <Button variant="outline" disabled={disabled} render={disabled ? undefined : <a href={`/api/reports/export?${sp.toString()}`} />}>
      <Download data-icon="inline-start" />
      {label}
    </Button>
  );
}
