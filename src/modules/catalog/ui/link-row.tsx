"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "cn";

/** Table row that navigates on click (links and buttons inside keep working). */
export function LinkRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableRow
      role="link"
      tabIndex={0}
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
