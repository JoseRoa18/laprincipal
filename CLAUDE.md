# La Principal 2050 — app de inventario y ventas de mostrador

Negocio nuevo de repuestos de electrodomésticos y refrigeración en Venezuela. Una sucursal, un almacén, 2 o 3 usuarios. Monedas: USD (base), Bs (VES) y COP. Sin crédito. Sin factura fiscal por ahora.

## Documentos (leer antes de diseñar o programar)

- `docs/01-contexto-y-alcance-mvp.md`: decisiones D1 a D10, alcance de la Fase 1, reglas multi-moneda, velocidad de venta, fotos con IA.
- `docs/02-arquitectura.md`: stack, capas, seguridad, consistencia, ADRs.
- `docs/03-modelo-de-datos.md`: tablas y reglas verificadas con pruebas.
- `docs/04-pantallas-y-navegacion.md`: rutas, pantallas, flujos.
- `docs/05-progreso.md`: avance por módulo y pendientes.
- `docs/00-prompt-maestro.md`: referencia extensa; no es alcance obligatorio.

## Stack

Next.js 16 (App Router, Turbopack, `src/proxy.ts` en lugar de `middleware.ts`), React 19, TypeScript estricto, Tailwind 4, shadcn/ui v4 (estilo base-nova sobre Base UI, no Radix), Drizzle ORM + pg (node-postgres), Auth.js v5 (credenciales, JWT), decimal.js, Vitest. PostgreSQL embebido en desarrollo (`pnpm db:start`), Supabase PostgreSQL + Storage y Vercel en producción.

## Comandos

- `pnpm db:start`: PostgreSQL local en el puerto 5433 (datos en `./data/pg`). Déjalo corriendo en una terminal.
- `pnpm db:generate` / `pnpm db:migrate`: genera y aplica migraciones Drizzle (`./drizzle`).
- `pnpm db:seed`: datos base (monedas, impuestos, métodos de pago, series, categorías, usuario admin).
- `pnpm dev`: app en http://localhost:3000. `pnpm dev:all` levanta base y app juntas.
- `pnpm test`: Vitest (dominio e integración). `pnpm typecheck`, `pnpm lint`.

## Convenciones

- Código, identificadores, tablas y commits en inglés. Interfaz, mensajes y docs de usuario en español (es-VE).
- Dinero con `decimal.js`; columnas `numeric(18,4)` para montos, `numeric(18,3)` para cantidades, `numeric(18,6)` para tasas. Drizzle devuelve `numeric` como `string`: convertir con `D()` de `src/lib/money.ts` y guardar con `toMoneyDb()` / `toQtyDb()`.
- Precios y costos base en USD. Toda venta y pago guarda la tasa usada.
- Operaciones que tocan stock, caja o numeración: transacción Drizzle + `SELECT ... FOR UPDATE` sobre `stock_levels` y `document_series`.
- `inventory_movements` y `audit_logs` son de solo inserción (trigger en la base).
- Estructura por módulo en `src/modules/<dominio>/{domain,application,infrastructure,ui}`. `domain/` es TypeScript puro sin base de datos ni React, con pruebas al lado (`*.test.ts`).
- Server Actions: `assertRole()` de `src/lib/auth-guards.ts` antes de actuar, validación con Zod, y devuelven `ActionResult` (`src/lib/errors.ts`), nunca lanzan al cliente.
- Páginas: `requireUser()` / `requireRole()`. `params` y `searchParams` son promesas.
- Simplicidad primero: cada pantalla usable sin manual; campos avanzados ocultos por defecto; estados de carga, vacío, error y sin resultados en toda lista.
- Los componentes de `src/components/ui` vienen de shadcn v4 sobre Base UI: revisar su API en el archivo antes de usarlos (difieren de Radix).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
