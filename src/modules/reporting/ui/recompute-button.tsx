"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { recomputeStatsAction } from "@/app/(app)/reportes/actions";
import { Button } from "@/components/ui/button";

/** "Recalcular ahora": runs the product statistics and refreshes the page. */
export function RecomputeButton({
  variant = "default",
  size,
  className,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await recomputeStatsAction();
      if (result.ok) {
        toast.success(`Estadísticas actualizadas: ${result.data.products} productos en ${(result.data.durationMs / 1000).toFixed(1)} s`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={run} disabled={pending}>
      <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
      {pending ? "Calculando..." : "Recalcular ahora"}
    </Button>
  );
}
