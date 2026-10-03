import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión" };

const NOTICES: Record<string, string> = {
  sesion: "Tu sesión se cerró porque cambió tu acceso. Vuelve a entrar.",
  clave: "Contraseña cambiada. Entra con la nueva.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; aviso?: string }> }) {
  const { next, aviso } = await searchParams;
  const notice = aviso ? NOTICES[aviso] : undefined;
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-6">
      <div className="bg-background w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <div className="mb-8 space-y-1 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">La Principal 2050</p>
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        </div>
        {notice ? <p className="bg-muted mb-5 rounded-lg p-3 text-sm">{notice}</p> : null}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
