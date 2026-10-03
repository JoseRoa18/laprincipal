"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * On phones the filters fold behind a "Filtros" button that says how many are
 * on, so the list starts near the top; from md up they are always shown.
 */
export function MobileFilters({ activeCount, children, className }: { activeCount: number; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <Button type="button" variant="outline" className="h-10 w-full justify-between md:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-2">
          <SlidersHorizontal /> Filtros
          {activeCount > 0 ? <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{activeCount}</Badge> : null}
        </span>
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <div className={cn(open ? "mt-2 block" : "hidden", "md:mt-0 md:block")}>{children}</div>
    </div>
  );
}
