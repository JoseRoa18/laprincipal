"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth-guards";
import { isNavActive, MOBILE_NAV_HREFS, navForRole } from "@/lib/navigation";
import { cn } from "cn";

/** Bottom navigation for phones. Hidden on md and up. */
export function MobileNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const items = navForRole(user.role).filter((i) => MOBILE_NAV_HREFS.includes(i.href));

  return (
    <nav
      aria-label="Navegación principal"
      className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={toggleSidebar}
            className="text-muted-foreground flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
          >
            <Ellipsis className="size-5" />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
