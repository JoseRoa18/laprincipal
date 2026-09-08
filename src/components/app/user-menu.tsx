"use client";

import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { useTransition } from "react";
import { logoutAction } from "@/app/(app)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth-guards";

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  admin: "Administrador",
  seller: "Vendedor",
  warehouse: "Almacén",
};

export function UserMenu({ user }: { user: SessionUser }) {
  const [pending, startTransition] = useTransition();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" tooltip={user.name} className="data-open:bg-sidebar-accent" />}
          >
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
              <UserRound className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{ROLE_LABEL[user.role]}</span>
            </span>
            <ChevronDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<a href="/configuracion/mi-cuenta" />}>
              <KeyRound />
              Mi cuenta y PIN
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => logoutAction())}
            >
              <LogOut />
              {pending ? "Saliendo..." : "Cerrar sesión"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
