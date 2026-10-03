import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReportKind = "sales" | "inventory" | "velocity" | "margin" | "no_movement" | "adjustments";

/** Links to the Excel and PDF exports of a report with its current filters. */
export function ExportButton({
  report,
  params = {},
  disabled,
}: {
  report: ReportKind;
  params?: Record<string, string | undefined>;
  disabled?: boolean;
}) {
  const href = (format: "xlsx" | "pdf") => {
    const sp = new URLSearchParams({ report });
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (format === "pdf") sp.set("format", "pdf");
    return `/api/reports/export?${sp.toString()}`;
  };
  return (
    <>
      <Button variant="outline" disabled={disabled} render={disabled ? undefined : <a href={href("xlsx")} />}>
        <Download data-icon="inline-start" />
        Exportar a Excel
      </Button>
      <Button variant="outline" disabled={disabled} render={disabled ? undefined : <a href={href("pdf")} />}>
        <FileText data-icon="inline-start" />
        PDF
      </Button>
    </>
  );
}
