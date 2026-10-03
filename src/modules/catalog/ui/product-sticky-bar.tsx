"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { codeLabel } from "../domain/sku";
import { ProductThumb } from "./product-thumb";

/**
 * Compact product identity (photo, name, part number and barcode) pinned under
 * the app header once the page title scrolls away, so a long page never loses
 * which product it is about. Takes no space: it overlays the content while shown.
 */
export function ProductStickyBar({
  watchId,
  name,
  sku,
  barcode,
  thumbUrl,
  fullWidth = false,
  children,
}: {
  /** Id of the page title block: the bar shows while that block is hidden. */
  watchId: string;
  name: string;
  sku: string;
  barcode: string | null;
  thumbUrl: string | null;
  /** The page uses the whole width (no centered max-w-5xl column). */
  fullWidth?: boolean;
  /** Right side: price, stock, actions. */
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target) return;
    // The app header (h-14) covers the top 56 px: the title counts as hidden once under it.
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  return (
    <div className="sticky top-14 z-20 h-0">
      <div
        aria-hidden={!visible}
        className={cn(
          "bg-background/95 absolute inset-x-0 top-0 -mx-3 border-b px-3 py-2 backdrop-blur transition-[opacity,translate] duration-150 md:-mx-6 md:px-6",
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className={cn("flex items-center gap-3", !fullWidth && "mx-auto max-w-5xl")}>
          <ProductThumb url={thumbUrl} alt="" size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-muted-foreground truncate text-xs tabular-nums">
              {codeLabel(sku)} <span className="text-foreground font-medium">{sku}</span>
              {barcode ? ` · Cód. barras ${barcode}` : ""}
            </p>
          </div>
          {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
