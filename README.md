# La Principal 2050

Aplicación de inventario y ventas de mostrador para un negocio de repuestos de electrodomésticos y refrigeración en Venezuela. Multi-moneda (USD base, Bs y COP), fotos de producto con fondo blanco automático, velocidad de venta y sugerencia de compra.

## Documentación

- `docs/01-contexto-y-alcance-mvp.md` — qué se construye y por qué
- `docs/02-arquitectura.md` — stack y decisiones
- `docs/03-modelo-de-datos.md` — tablas
- `docs/04-pantallas-y-navegacion.md` — pantallas y flujos
- `docs/05-progreso.md` — avance por módulo
- `docs/06-guia-de-desarrollo.md` — cómo programar en este repositorio
- `docs/07-despliegue.md` — Supabase y Vercel

## Desarrollo local

Requisitos: Node 22, pnpm 11. Sin Docker: PostgreSQL embebido.

```bash
pnpm install
cp .env.example .env.local        # y ajustar AUTH_SECRET
pnpm db:start                     # terminal 1: PostgreSQL en 5433
pnpm db:migrate && pnpm db:seed   # primera vez
pnpm dev                          # terminal 2: http://localhost:3000
```

Usuario inicial: `admin@laprincipal2050.com` / `Admin2050*` (PIN 1234). Cambiar al primer inicio.

Verificaciones: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec tsx scripts/smoke.ts`.
