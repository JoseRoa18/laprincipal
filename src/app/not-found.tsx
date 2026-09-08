import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground text-sm">Error 404</p>
      <h1 className="text-2xl font-semibold">Esta página no existe</h1>
      <p className="text-muted-foreground max-w-sm text-sm">Puede que el enlace esté mal escrito o que el registro haya sido eliminado.</p>
      <Button render={<Link href="/inicio" />}>Ir al inicio</Button>
    </main>
  );
}
