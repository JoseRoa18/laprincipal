import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/format";
import { getOwnProfile, ROLE_LABEL } from "@/modules/auth/infrastructure/users";
import { ChangePasswordForm, ChangePinForm } from "@/modules/auth/ui/my-account-forms";

export const metadata = { title: "Mi cuenta" };

export default async function MyAccountPage() {
  const user = await requireUser();
  const profile = await getOwnProfile(user.id);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi cuenta"
        description="Tus datos de acceso, tu contraseña y tu PIN de mostrador."
        actions={
          <Button variant="outline" render={<Link href="/inicio" />}>
            Volver al inicio
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Para cambiar tu nombre, correo o rol, pídeselo a un administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Nombre">{profile.name}</Item>
            <Item label="Correo">{profile.email}</Item>
            <Item label="Rol">{ROLE_LABEL[profile.role]}</Item>
            <Item label="PIN de mostrador">
              <Badge variant={profile.hasPin ? "outline" : "secondary"}>{profile.hasPin ? "Configurado" : "Sin PIN"}</Badge>
            </Item>
            <Item label="Último acceso">{profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "Nunca"}</Item>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>Es la que usas para entrar a la app.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm email={profile.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{profile.hasPin ? "Cambiar PIN" : "Crear PIN"}</CardTitle>
            <CardDescription>De 4 a 6 dígitos. Sirve para cambiar de vendedor en el mostrador sin cerrar sesión.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePinForm hasPin={profile.hasPin} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
