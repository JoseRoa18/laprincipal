import { PageHeader } from "@/components/app/page-header";
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
        back={{ href: "/configuracion", label: "Volver a configuración" }}
        title="Usuarios"
        description="Cuentas para entrar a la app, su rol y el PIN para cambiar de vendedor en el mostrador."
      />

      <UsersTable users={users} currentUserId={user.id} />
    </div>
  );
}
