import { DatabaseBackup, Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { getBackupDownloadUrl } from "@/modules/settings/application/backups";
import { BACKUP_KIND_LABEL, formatBytes, listBackups } from "@/modules/settings/infrastructure/backups";
import { BackupsPanel } from "@/modules/settings/ui/backups-panel";

export const metadata = { title: "Respaldos" };

const EXPORTS = [
  { type: "products", label: "Productos" },
  { type: "customers", label: "Clientes" },
  { type: "sales", label: "Ventas" },
] as const;

export default async function BackupsPage() {
  await requireRole("admin");
  const backups = await listBackups();
  // Signed links are valid for 10 minutes; they are computed here, per row.
  const downloadUrls = await Promise.all(backups.map((b) => getBackupDownloadUrl(b.filePath)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Respaldos"
        description="El plan gratuito de Supabase no incluye respaldos automáticos. Desde aquí puedes guardar una copia completa de los datos y exportarlos a Excel."
        actions={
          <Button variant="outline" render={<Link href="/configuracion" />}>
            Volver a configuración
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Respaldo completo</CardTitle>
            <CardDescription>
              Guarda todas las tablas (productos, inventario, ventas, clientes, caja y configuración) en un archivo JSON dentro del
              almacenamiento privado de la app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <BackupsPanel />
            <p className="text-muted-foreground text-sm">
              Además, cada semana se crea un respaldo programado de forma automática (tarea <code className="font-mono text-xs">/api/cron/backup</code>).
              Descarga una copia de vez en cuando y guárdala fuera de la app.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exportar a Excel</CardTitle>
            <CardDescription>Descarga listas completas para revisarlas o compartirlas con el contador.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.type} variant="outline" size="lg" render={<a href={`/api/backups/export?type=${e.type}`} download />}>
                <FileSpreadsheet data-icon="inline-start" /> {e.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Respaldos guardados</h2>
        {backups.length === 0 ? (
          <EmptyState
            icon={DatabaseBackup}
            title="Todavía no hay respaldos"
            description="Crea el primero con el botón de arriba. Los respaldos programados también aparecerán en esta lista."
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                  <TableHead className="hidden md:table-cell">Creado por</TableHead>
                  <TableHead className="text-right">Archivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b, i) => (
                  <TableRow key={b.id}>
                    <TableCell className="tabular-nums">{formatDateTime(b.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={b.kind === "scheduled" ? "secondary" : "outline"}>{BACKUP_KIND_LABEL[b.kind]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBytes(b.sizeBytes)}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.createdByName ?? "Sistema"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" render={<a href={downloadUrls[i]} download />}>
                        <Download data-icon="inline-start" /> Descargar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
