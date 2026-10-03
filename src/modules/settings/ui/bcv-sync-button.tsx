"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { syncBcvRateAction } from "@/app/(app)/configuracion/tasas/actions";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";

/** Queries the BCV now and saves the Bs rate under its value date. */
export function BcvSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncBcvRateAction();
          if (!result.ok) {
            toast.error(result.error.message);
            router.refresh();
            return;
          }
          const text = result.data.rates.map((r) => `${formatMoney(r.rate, "VES")} desde el ${formatDate(`${r.valueDate}T12:00:00`)}`).join(" · ");
          toast.success(result.data.changed ? `Tasa BCV guardada: ${text}` : `La tasa BCV ya estaba al día: ${text}`);
          router.refresh();
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Consultando el BCV..." : "Actualizar desde el BCV"}
    </Button>
  );
}
