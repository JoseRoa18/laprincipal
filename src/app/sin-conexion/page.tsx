import { CloudOff } from "lucide-react";

export const metadata = { title: "Sin conexión" };
export const dynamic = "force-static";

/**
 * Shown by the service worker when a page is opened without a connection and
 * there is no saved copy of it. Plain links: the client router needs the network.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <CloudOff className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="text-muted-foreground text-sm">
        Esta pantalla necesita internet. Sin conexión puedes seguir vendiendo y consultando precios con la última información guardada en este equipo; las ventas se envían
        solas cuando vuelve la conexión.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <a href="/vender" className="bg-primary text-primary-foreground inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium">
          Ir a Vender
        </a>
        <a href="/vender/consulta" className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-medium">
          Consultar precio
        </a>
      </div>
    </main>
  );
}
