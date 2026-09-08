"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/**
 * Search box bound to the `q` query parameter (debounced). Resets `page`.
 * Server pages read `q` from searchParams and filter on the server.
 */
export function SearchInput({
  placeholder = "Buscar...",
  param = "q",
  className,
  autoFocus,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? "";
  const [value, setValue] = useState(current);
  const [lastCurrent, setLastCurrent] = useState(current);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes from outside (back button, links).
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setValue(current);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set(param, next.trim());
    else params.delete(param);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 300);
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            commit(value);
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-10 pl-9 pr-9"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setValue("");
            commit("");
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
