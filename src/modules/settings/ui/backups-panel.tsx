"use client";

import { DatabaseBackup } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { createBackupAction } from "@/app/(app)/configuracion/respaldos/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function formatKb(bytes: number): string {
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)));
}

/** "Crear respaldo ahora" button: runs the backup and refreshes the list. */
export function BackupsPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await createBackupAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const tableCount = Object.keys(result.data.tables).length;
      toast.success(`Respaldo creado: ${tableCount} tablas, ${formatKb(result.data.sizeBytes)} KB`);
      router.refresh();
    });
  }

  return (
    <Button size="lg" onClick={run} disabled={pending} aria-busy={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <DatabaseBackup data-icon="inline-start" />}
      {pending ? "Creando respaldo..." : "Crear respaldo ahora"}
    </Button>
  );
}
