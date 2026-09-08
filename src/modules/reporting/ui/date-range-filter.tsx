"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_LABELS, type RangePreset } from "../domain/date-range";

export interface PresetOption {
  key: Exclude<RangePreset, "custom">;
  from: string;
  to: string;
}

/**
 * Period selector bound to `preset`, `from` and `to` in the URL. The server
 * computes the preset dates (business time zone) and passes them in; this
 * component only builds URLs, so server and client always agree on "today".
 */
export function DateRangeFilter({
  presets,
  active,
  from,
  to,
}: {
  presets: PresetOption[];
  active: RangePreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function navigate(next: { preset?: RangePreset; from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.preset && next.preset !== "custom") params.set("preset", next.preset);
    else params.delete("preset");
    params.set("from", next.from);
    params.set("to", next.to);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const customValid = customFrom !== "" && customTo !== "" && customFrom <= customTo;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={active === p.key ? "default" : "outline"}
            aria-pressed={active === p.key}
            onClick={() => navigate({ preset: p.key, from: p.from, to: p.to })}
          >
            {PRESET_LABELS[p.key]}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (customValid) navigate({ preset: "custom", from: customFrom, to: customTo });
        }}
      >
        <span className="text-muted-foreground text-sm">{active === "custom" ? "Personalizado:" : "Otro período:"}</span>
        <Input
          type="date"
          aria-label="Desde"
          value={customFrom}
          max={customTo || undefined}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="h-8 w-auto"
        />
        <span className="text-muted-foreground text-sm">a</span>
        <Input
          type="date"
          aria-label="Hasta"
          value={customTo}
          min={customFrom || undefined}
          onChange={(e) => setCustomTo(e.target.value)}
          className="h-8 w-auto"
        />
        <Button type="submit" size="sm" variant={active === "custom" ? "default" : "secondary"} disabled={!customValid}>
          Aplicar
        </Button>
      </form>
    </div>
  );
}
