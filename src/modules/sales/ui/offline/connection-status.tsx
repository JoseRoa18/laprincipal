"use client";

import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { useOfflineStore } from "./offline-store";

/**
 * Header pill: "Sin conexión", "N por enviar", "Enviando…" or nothing when
 * everything is online and sent. Links to the list of waiting sales.
 */
export function ConnectionStatus() {
  const loaded = useOfflineStore((s) => s.loaded);
  const online = useOfflineStore((s) => s.online);
  const syncing = useOfflineStore((s) => s.syncing);
  const waiting = useOfflineStore((s) => s.sales.length + s.customers.length);
  const failed = useOfflineStore((s) => s.sales.filter((x) => x.status === "error").length + s.customers.filter((x) => x.status === "error").length);
  if (!loaded || (online && waiting === 0)) return null;

  const label = !online ? (waiting > 0 ? `Sin conexión · ${waiting} por enviar` : "Sin conexión") : syncing ? "Enviando…" : failed > 0 ? `${failed} con error` : `${waiting} por enviar`;
  const Icon = !online ? CloudOff : failed > 0 ? TriangleAlert : RefreshCw;

  return (
    <Link
      href="/vender/pendientes"
      role="status"
      className={cn(
        "tap-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        !online || failed > 0
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
      )}
    >
      <Icon className={cn("size-3.5", syncing && "animate-spin")} aria-hidden="true" />
      <span className="max-sm:sr-only">{label}</span>
      {waiting > 0 ? <span className="tabular-nums sm:hidden">{waiting}</span> : null}
    </Link>
  );
}
