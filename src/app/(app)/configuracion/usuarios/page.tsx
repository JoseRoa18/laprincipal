import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { listUsers } from "@/modules/auth/infrastructure/users";
import { UsersTable } from "@/modules/auth/ui/users-table";

export const metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const user = await requireRole("admin");
  const users = await listUsers();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Cuentas para entrar a la app, su rol y el PIN para cambiar de vendedor en el mostrador."
        actions={
          <Button variant="outline" render={<Link href="/configuracion" />}>
            Volver a configuración
          </Button>
        }
      />

      <UsersTable users={users} currentUserId={user.id} />
    </div>
  );
}
