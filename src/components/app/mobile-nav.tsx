"use client";

import { Ellipsis, KeyRound, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { logoutAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SessionUser } from "@/lib/auth-guards";
import { isNavActive, mobileNavForRole, type NavItem } from "@/lib/navigation";
import { cn } from "cn";

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  admin: "Administrador",
  seller: "Vendedor",
  warehouse: "Almacén",
};

/**
 * Bottom navigation for phones (hidden on md and up): the role's four most
 * used sections, plus "Más", a bottom sheet with the other sections and the
 * account. "Más" lights up while the current page is one of its sections.
 */
export function MobileNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { bar, more } = mobileNavForRole(user.role);
  const moreActive = more.some((item) => isNavActive(item, pathname)) || pathname.startsWith("/configuracion/mi-cuenta");

  return (
    <nav
      aria-label="Navegación principal"
      className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${bar.length + 1}, minmax(0, 1fr))` }}>
        {bar.map((item) => (
          <li key={item.href}>
            <BarLink item={item} active={isNavActive(item, pathname)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn("flex h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium", moreActive ? "text-primary" : "text-muted-foreground")}
          >
            <BarIcon active={moreActive}>
              <Ellipsis className="size-5" />
            </BarIcon>
            Más
          </button>
        </li>
      </ul>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="pb-2">
            <SheetTitle>Más opciones</SheetTitle>
            <SheetDescription className="sr-only">Otras secciones y tu cuenta</SheetDescription>
          </SheetHeader>
          {more.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 px-4">
              {more.map((item) => {
                const active = isNavActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-center text-xs font-medium transition-colors active:scale-[0.98]",
                        active ? "border-primary/40 bg-primary/10 text-primary" : "bg-card hover:bg-muted",
                      )}
                    >
                      <item.icon className="size-6" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mx-4 mt-4 mb-4 rounded-xl border">
            <div className="flex items-center gap-3 p-3">
              <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                <UserRound className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {ROLE_LABEL[user.role]} · {user.email}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t p-3">
              <Button variant="outline" className="h-11" render={<Link href="/configuracion/mi-cuenta" onClick={() => setOpen(false)} />}>
                <KeyRound /> Mi cuenta y PIN
              </Button>
              <Button variant="outline" className="text-destructive h-11" disabled={pending} onClick={() => startTransition(() => logoutAction())}>
                <LogOut /> {pending ? "Saliendo..." : "Cerrar sesión"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function BarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}
    >
      <BarIcon active={active}>
        <item.icon className="size-5" />
      </BarIcon>
      {item.label}
    </Link>
  );
}

/** Icon in a pill that fills in when its section is open, so the current place is obvious at a glance. */
function BarIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/12")}>{children}</span>;
}
