import { cookies } from "next/headers";
import { AppHeader } from "@/components/app/app-header";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth-guards";
import { getCompanySettings } from "@/modules/settings/infrastructure/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, cookieStore, company] = await Promise.all([requireUser(), cookies(), getCompanySettings()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} companyName={company.name} />
      <SidebarInset className="min-w-0">
        <AppHeader user={user} />
        <div className="flex-1 p-3 pb-20 md:p-6 md:pb-6">{children}</div>
        <MobileNav user={user} />
      </SidebarInset>
    </SidebarProvider>
  );
}
