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

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted-foreground text-sm whitespace-nowrap">
        {label}
      </label>
      <NativeSelect className="min-w-36">
        <select id={id} value={current} onChange={(e) => onChange(e.target.value)}>
          {hideAll ? null : <NativeSelectOption value="">{allLabel}</NativeSelectOption>}
          {options.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </select>
      </NativeSelect>
    </div>
  );
}
