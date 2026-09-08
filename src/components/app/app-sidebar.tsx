"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth-guards";
import { isNavActive, navForRole } from "@/lib/navigation";
import { UserMenu } from "./user-menu";

export function AppSidebar({ user, companyName }: { user: SessionUser; companyName: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = navForRole(user.role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/inicio"
          className="flex h-10 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:justify-center"
          onClick={() => setOpenMobile(false)}
        >
          <span className="bg-highlight text-highlight-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold">
            LP
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">{companyName}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isNavActive(item, pathname)}
                    tooltip={item.label}
                    size="lg"
                    className="transition-[background-color,box-shadow,color] duration-200 data-active:shadow-[inset_3px_0_0_var(--highlight)]"
                    render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
