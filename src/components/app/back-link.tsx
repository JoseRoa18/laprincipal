import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

export interface BackTarget {
  href: string;
  /** e.g. "Volver a configuración" */
  label: string;
}

/** "← Volver a …" link shown above the title of every sub page. */
export function BackLink({ href, label, className }: BackTarget & { className?: string }) {
  return (
    <Link
      href={href}
      className={cn("tap-target text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline", className)}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
