"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProductPicker } from "./product-picker";

/** Kardex product filter: search box that resolves to `?product=<id>`. */
export function MovementProductFilter({ selected }: { selected: { id: string; name: string; sku: string } | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setProduct(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("product", id);
    else params.delete("product");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  if (selected) {
    return (
      <div className="bg-muted flex h-11 max-w-md items-center gap-2 rounded-lg px-3 text-sm">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{selected.name}</span> <span className="text-muted-foreground">· {selected.sku}</span>
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar filtro de producto" onClick={() => setProduct(null)}>
          <X />
        </Button>
      </div>
    );
  }
  return <ProductPicker onSelect={(p) => setProduct(p.id)} placeholder="Filtrar por producto" className="max-w-md" />;
}
