import { Package } from "lucide-react";
import { cn } from "cn";

/** Product thumbnail or a placeholder icon. Works in server and client components. */
export function ProductThumb({ url, alt, size = 48, className }: { url: string | null; alt: string; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} width={size} height={size} loading="lazy" style={style} className={cn("shrink-0 rounded-md border bg-white object-cover", className)} />
    );
  }
  return (
    <span aria-hidden="true" style={style} className={cn("bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md border", className)}>
      <Package className="size-5" />
    </span>
  );
}
