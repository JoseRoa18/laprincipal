import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShieldAlert className="text-muted-foreground size-10" />
      <h1 className="text-xl font-semibold">No tienes acceso a esta pantalla</h1>
      <p className="text-muted-foreground text-sm">Pídele al administrador que ajuste tu rol si necesitas entrar aquí.</p>
      <Button render={<Link href="/inicio" />}>Volver al inicio</Button>
    </div>
  );
}
