"use client";

import { usePathname } from "next/navigation";
import { sectionForPath } from "@/lib/navigation";

/** Phone header: the section you are in, since the sidebar that says it is hidden there. */
export function SectionTitle({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  // "Mi cuenta" lives under /configuracion but every role opens it.
  const ownAccount = pathname.startsWith("/configuracion/mi-cuenta");
  const section = ownAccount ? null : sectionForPath(pathname);
  const label = ownAccount ? "Mi cuenta" : (section?.label ?? fallback);
  return (
    <span className="flex min-w-0 items-center gap-2 md:hidden">
      <span className="bg-highlight text-highlight-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold">
        {section ? <section.icon className="size-4" /> : "LP"}
      </span>
      <span className="truncate text-base font-semibold">{label}</span>
    </span>
  );
}
