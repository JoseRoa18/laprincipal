import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-6">
      <div className="bg-background w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <div className="mb-8 space-y-1 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">La Principal 2050</p>
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
