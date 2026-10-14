import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth-guards";
import { PendingList } from "@/modules/sales/ui/offline/pending-list";

export const metadata = { title: "Ventas por enviar" };

/** Sales and customers saved on this device without a connection, waiting to be sent. */
export default async function PendingPage() {
  const user = await requireRole("admin", "seller");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        back={{ href: "/vender", label: "Volver a vender" }}
        title="Ventas por enviar"
        description="Lo que se vendió o registró en este equipo sin conexión. Se envía solo cuando vuelve internet; aquí ves cómo va y lo que necesita revisión."
      />
      <PendingList canDiscard={user.role === "admin"} />
    </div>
  );
}
