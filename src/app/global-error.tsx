"use client";

/**
 * Last-resort screen when even the app layout fails (for example the database
 * is briefly unreachable). It replaces the root layout, so it carries its own
 * html, body and inline styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9", color: "#111827" }}>
        <title>La Principal 2050</title>
        <main style={{ maxWidth: 420, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>No se pudo cargar la aplicación</h1>
          <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>
            Puede ser la conexión a internet o el servidor por un momento. Espera unos segundos y vuelve a intentar.
            {error.digest ? <span style={{ display: "block", marginTop: 8, fontFamily: "monospace", fontSize: 12 }}>Código: {error.digest}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: 0, background: "#1d4ed8", color: "white", fontSize: 15, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
