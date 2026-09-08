import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth-guards";
import { RateBadge } from "./rate-badge";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="hidden md:inline-flex" />
      <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />
      <div id="page-title" className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base" />
      <RateBadge canEdit={user.role === "admin"} />
    </header>
  );
}
