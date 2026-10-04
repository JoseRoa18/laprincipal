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
        {/* Keyboard users jump past the sidebar and header straight to the page. */}
        <a
          href="#contenido"
          className="bg-background ring-ring sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
        >
          Saltar al contenido
        </a>
        <AppHeader user={user} />
        <div id="contenido" tabIndex={-1} className="flex-1 p-3 pb-20 outline-none md:p-6 md:pb-6">
          {children}
        </div>
        <MobileNav user={user} />
      </SidebarInset>
    </SidebarProvider>
  );
}
