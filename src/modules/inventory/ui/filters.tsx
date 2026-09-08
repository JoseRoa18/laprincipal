"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "cn";

/** Small helpers to bind list filters to the URL (server pages read searchParams). */
function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const set = useCallback(
    (changes: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === "") params.delete(k);
        else params.set(k, v);
      }
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );
  return { searchParams, set };
}

export interface FilterOption {
  value: string;
  label: string;
}

export function UrlSelect({
  param,
  options,
  placeholder = "Todos",
  label,
  className,
}: {
  param: string;
  options: FilterOption[];
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const { searchParams, set } = useUrlParams();
  const value = searchParams.get(param) ?? "";
  return (
    <NativeSelect
      aria-label={label ?? placeholder}
      value={value}
      onChange={(e) => set({ [param]: e.target.value })}
      className={cn("w-full sm:w-auto [&>select]:h-10", className)}
    >
      <NativeSelectOption value="">{placeholder}</NativeSelectOption>
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function UrlToggle({ param, label, className }: { param: string; label: string; className?: string }) {
  const { searchParams, set } = useUrlParams();
  const checked = searchParams.get(param) === "1";
  return (
    <Label className={cn("h-10 cursor-pointer gap-2 rounded-lg border px-3 font-normal", checked && "bg-muted", className)}>
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => set({ [param]: e.target.checked ? "1" : null })} />
      {label}
    </Label>
  );
}

export function UrlDateRange({
  fromParam = "from",
  toParam = "to",
  defaultFrom,
  defaultTo,
  className,
}: {
  fromParam?: string;
  toParam?: string;
  defaultFrom?: string;
  defaultTo?: string;
  className?: string;
}) {
  const { searchParams, set } = useUrlParams();
  const from = searchParams.get(fromParam) ?? defaultFrom ?? "";
  const to = searchParams.get(toParam) ?? defaultTo ?? "";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input type="date" aria-label="Desde" value={from} onChange={(e) => set({ [fromParam]: e.target.value })} className="h-10 w-auto" />
      <span className="text-muted-foreground text-sm">a</span>
      <Input type="date" aria-label="Hasta" value={to} onChange={(e) => set({ [toParam]: e.target.value })} className="h-10 w-auto" />
    </div>
  );
}
