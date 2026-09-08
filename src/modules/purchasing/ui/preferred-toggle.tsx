"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setPreferredSupplierAction } from "@/app/(app)/compras/proveedores/actions";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/** Star button: marks this supplier as the preferred one for the product. */
export function PreferredToggle({ productId, supplierId, isPreferred }: { productId: string; supplierId: string; isPreferred: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-pressed={isPreferred}
      aria-label={isPreferred ? "Quitar como proveedor preferido" : "Marcar como proveedor preferido"}
      title={isPreferred ? "Proveedor preferido" : "Marcar como preferido"}
      onClick={() =>
        startTransition(async () => {
          const result = await setPreferredSupplierAction({ productId, supplierId, preferred: !isPreferred });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success(isPreferred ? "Ya no es el proveedor preferido" : "Proveedor preferido");
          router.refresh();
        })
      }
    >
      <Star className={cn("size-4", isPreferred ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
    </Button>
  );
}
