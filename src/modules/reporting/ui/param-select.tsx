"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** Native select bound to one query parameter. Resets `page` on change. */
export function ParamSelect({
  param,
  label,
  options,
  allLabel = "Todos",
  hideAll = false,
  defaultValue = "",
}: {
  param: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  hideAll?: boolean;
  /** Value to treat as selected when the parameter is absent. */
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();
  const current = searchParams.get(param) ?? defaultValue;

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== defaultValue) params.set(param, value);
    else params.delete(param);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // NativeSelect renders its own <select>; passing the options directly avoids a nested
  // <select> (invalid HTML that the browser rewrote, causing a hydration mismatch).
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted-foreground text-sm whitespace-nowrap">
        {label}
      </label>
      <NativeSelect id={id} value={current} onChange={(e) => onChange(e.target.value)} className="min-w-36 max-w-full">
        {hideAll ? null : <NativeSelectOption value="">{allLabel}</NativeSelectOption>}
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
