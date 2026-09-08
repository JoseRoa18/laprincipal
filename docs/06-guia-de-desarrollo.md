# Guía de desarrollo (para personas y agentes)

Lee primero `CLAUDE.md`, `docs/01-contexto-y-alcance-mvp.md`, `docs/03-modelo-de-datos.md` y `docs/04-pantallas-y-navegacion.md`. Esta guía explica cómo se construye un módulo en este repositorio.

## 1. Entorno

- PostgreSQL local ya corre en `localhost:5433` (`pnpm db:start`, no lo reinicies). Base de desarrollo `lp2050`, base de pruebas `lp2050_test` (`pnpm exec tsx scripts/ensure-test-db.ts` si falta).
- El servidor de desarrollo corre en http://localhost:3000 con recarga en caliente. No lo reinicies ni lances otro `pnpm dev` (Next bloquea instancias duplicadas).
- Usuario admin: `jose.stylishkb@gmail.com` / `Stylish2026*`, PIN `1234`.
- Verificación obligatoria antes de dar por terminado: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec tsx scripts/smoke.ts` (agrega tus rutas a `scripts/smoke.ts` si son nuevas).
- No cambies `src/db/schema/*` ni generes migraciones. Si tu módulo necesita un cambio de esquema, anótalo en `docs/05-progreso.md` en "Pendientes" con la justificación y sigue con una solución que no lo requiera.
- No hagas commits ni cambies dependencias sin necesidad real. Si agregas una dependencia, dilo en tu reporte.

## 2. Estructura de un módulo

```
src/modules/<dominio>/
  domain/          # tipos y cálculos puros + *.test.ts (sin BD ni React)
  application/     # casos de uso: transacciones, servicios (usa Drizzle)
  infrastructure/  # consultas de lectura (listas, detalle), adaptadores
  ui/              # componentes cliente del módulo (formularios, tablas)
src/app/(app)/<ruta>/page.tsx       # páginas (Server Components)
src/app/(app)/<ruta>/actions.ts     # "use server": acciones del módulo
src/app/(app)/<ruta>/loading.tsx    # esqueleto de carga
```

## 3. Servicios compartidos (ya existen, úsalos)

| Necesidad | Función | Archivo |
|---|---|---|
| Sesión y rol en página | `requireUser()`, `requireRole("admin", ...)` | `src/lib/auth-guards.ts` |
| Sesión y rol en acción | `assertRole(...)` (lanza `AppError`) | `src/lib/auth-guards.ts` |
| Permisos finos | `can(role, "void_sale")` | `src/lib/auth-guards.ts` |
| Envolver una acción | `runAction(async () => {...})` → `ActionResult` | `src/lib/action.ts` |
| Validar entrada | `parseInput(schema, data)` (Zod, lanza `AppError` con `details.fields`) | `src/lib/action.ts` |
| Errores de negocio | `new AppError("INSUFFICIENT_STOCK", "mensaje en español")` | `src/lib/errors.ts` |
| Dinero | `D()`, `roundTo`, `toMoneyDb`, `toQtyDb`, `toRateDb`, `splitTaxIncluded` | `src/lib/money.ts` |
| Formato | `formatMoney`, `formatQty`, `formatDate`, `formatDateTime`, `businessDate`, `parseLocalizedNumber` | `src/lib/format.ts` |
| Número de documento | `nextDocumentNumber(tx, "sale")` dentro de la transacción | `src/modules/core/application/numbering.ts` |
| Auditoría | `writeAudit(tx, { userId, action, entityType, entityId, before, after })` | `src/modules/core/application/audit.ts` |
| Almacén y caja por defecto | `getDefaultLocation()`, `getDefaultCashRegister()` | `src/modules/core/application/context.ts` |
| Mover stock | `lockStock`, `applyMovement`, `applyMovements`, `adjustReserved` | `src/modules/inventory/application/stock.ts` |
| Sesión de caja abierta | `getOpenCashSession()` | `src/modules/cash/application/session.ts` |
| Tasas y monedas | `getRatesSnapshot()`, `listCurrencies()`, `upsertRate()`, `listRateHistory()` | `src/modules/currency/infrastructure/rates.ts` |
| Conversión | `fromUsd`, `toUsd`, `toCash`, `displayAmounts` | `src/modules/currency/domain/conversion.ts` |
| Precios e IVA | `computeLine`, `computeTotals`, `effectiveDiscountPct` | `src/modules/sales/domain/pricing.ts` |
| Pagos mixtos y cambio | `computePaymentState`, `remainingIn` | `src/modules/sales/domain/payments.ts` |
| Costo promedio y prorrateo | `weightedAverageCost`, `prorateExtraCosts` | `src/modules/inventory/domain/costing.ts` |
| Velocidad, ABC, semáforo | `velocity`, `weightedVelocity`, `safetyStock`, `reorderPoint`, `suggestedQty`, `abcClassify`, `stockStatus` | `src/modules/inventory/domain/velocity.ts` |
| Configuración | `getSetting("policies")`, `saveSetting(...)`, `getCompanySettings()` | `src/modules/settings/infrastructure/settings.ts` |
| Archivos | `getStorage().put/get/delete/publicUrl/signedUrl` | `src/lib/storage/index.ts` |

## 4. Patrón de una acción de servidor

```ts
"use server";
import { z } from "zod";
import { db } from "@/db/client";
import { runAction, parseInput } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { writeAudit } from "@/modules/core/application/audit";

const schema = z.object({ name: z.string().trim().min(1, "El nombre es obligatorio") });

export async function createBrandAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(schema, input);
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(brands).values(data).returning();
      await writeAudit(tx, { userId: user.id, action: "brand.create", entityType: "brand", entityId: row.id, after: row });
      return row;
    });
  });
}
```

- Las acciones reciben objetos simples (no `FormData`) cuando se llaman desde componentes cliente; usa `formToObject(formData)` si vienen de un `<form action>`.
- Nunca uses `redirect()` dentro de `runAction`; devuelve `{ ok: true, data }` y navega en el cliente con `router.push`. Llama `revalidatePath("/ruta")` antes de devolver cuando cambies datos que otras páginas muestran.
- Toda operación que toque stock, caja o numeración va en `db.transaction` y usa `lockStock` / `nextDocumentNumber` dentro de la transacción.

## 5. Patrón de una página de lista

```tsx
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = typeof params.q === "string" ? params.q : "";
  const { rows, total } = await listProducts({ q, page, pageSize: DEFAULT_PAGE_SIZE });
  return (
    <div className="space-y-4">
      <PageHeader title="Productos" actions={<Button render={<Link href="/productos/nuevo" />}>Nuevo producto</Button>} />
      <SearchInput placeholder="Nombre, número de parte, modelo o código" />
      {rows.length === 0 ? <EmptyState ... /> : <Table>...</Table>}
      <Pagination page={page} total={total} basePath="/productos" params={params} />
    </div>
  );
}
```

- Búsqueda en servidor con `ILIKE` sobre `search_text` (productos) o columnas indexadas. Paginación con `limit/offset` y `count(*)`.
- Agrega `loading.tsx` con `Skeleton`. Estados: cargando, vacío (`EmptyState`), sin resultados de búsqueda, error (`error.tsx`).

## 6. Interfaz

- Componentes en `src/components/ui` (shadcn v4 sobre Base UI). Diferencias con Radix: no existe `asChild`; usa `render={<Link href="..." />}` en `Button`, `SidebarMenuButton`, `DialogTrigger`, `DropdownMenuItem`, etc. `Dialog` usa `open`/`onOpenChange`; `Select` de Base UI necesita `items` para mostrar etiquetas, así que en formularios prefiere `NativeSelect` (`src/components/ui/native-select.tsx`), que además funciona mejor en celulares.
- Componentes propios en `src/components/app`: `PageHeader`, `Money`, `StockStatusBadge`, `EmptyState`, `SearchInput`, `Pagination`, `ConfirmButton`.
- Notificaciones: `import { toast } from "sonner"`; `toast.success("Producto guardado")`, `toast.error(result.error.message)`.
- Formularios: `react-hook-form` + `zodResolver` (`@hookform/resolvers/zod`) con el mismo esquema Zod de la acción. Mensajes de error bajo el campo. Botón deshabilitado mientras `pending`.
- Móvil primero: botones táctiles de al menos 44 px (`size="lg"`), tablas con `overflow-x-auto`, acciones principales visibles sin scroll. `src/app/globals.css` tiene una capa `@media (pointer: coarse)` que en celular y tablet sube a 44 px los `Button`, `Input`, `NativeSelect`, pestañas y opciones de menú (y a 16 px la fuente de los controles, para que iOS no haga zoom) sin cambiar el escritorio; para enlaces o botones propios usa la utilidad `tap-target`. Listas anchas: tarjetas en celular (`md:hidden`) y tabla en `hidden md:block`; columnas secundarias con `hidden md:table-cell`. Diálogos con formulario: `max-h-[90svh] overflow-y-auto`. Verificación: `pnpm exec tsx scripts/qa-mobile.ts` (ver `docs/reportes/qa-movil.md`).
- Montos siempre con `<Money value={x} currency="USD" />`. Cantidades con `formatQty`. Fechas con `formatDate`/`formatDateTime`.
- Textos en español neutro, sin jerga técnica. Botones con verbo: "Guardar", "Aplicar entrada", "Cobrar".
- `next/image` está en modo `unoptimized`; para fotos usa `<img>` o `Image` con `width`/`height` explícitos.

## 7. Pruebas

- Dominio: Vitest junto al archivo (`*.test.ts`).
- Integración con base de datos: `tests/<modulo>.test.ts` usando `createTestDb()` y `uid()` de `tests/db.ts`. Crea tus propios datos (SKU únicos) y bórralos al final; no truncas tablas. Salta con `if (process.env.SKIP_DB_TESTS) return` cuando la base no está disponible.
- Reglas que deben quedar cubiertas por pruebas están en `docs/03-modelo-de-datos.md`, sección 11.

## 8. Paquetes de trabajo de la Fase 1

| Paquete | Módulos y rutas | Dueño de |
|---|---|---|
| A. Catálogo | `src/modules/catalog`, `/productos/**` | productos, categorías, marcas, códigos de barras, fotos con IA, etiquetas, importación Excel |
| B. Inventario y compras | `src/modules/inventory` (excepto `application/stock.ts` y `domain/`), `src/modules/purchasing`, `/inventario/**`, `/compras/**` | existencias, kardex, ajustes, conteos, alertas, proveedores, entradas por compra, qué comprar |
| C. Ventas | `src/modules/sales` (excepto `domain/`), `/vender`, `/ventas/**`, `/cotizaciones/**`, `/imprimir/**` | POS, cobro multi-moneda, ticket, devoluciones, anulación, cotizaciones, cambio de vendedor por PIN |
| D. Caja, clientes y configuración | `src/modules/cash` (excepto `application/session.ts`), `src/modules/customers`, `src/modules/settings`, `/caja/**`, `/clientes/**`, `/configuracion/**` | apertura y cierre por moneda, clientes, empresa, tasas, impuestos, métodos de pago, motivos, unidades, series, impresión, políticas, usuarios, mi cuenta, respaldos |
| E. Reportes y estadísticas | `src/modules/reporting`, `/reportes/**`, `/api/cron/**`, datos del inicio | `product_stats` (velocidad, ABC, semáforo), cron diario, reportes con gráficos y Excel, KPIs de `/inicio` |

Archivos compartidos que no se tocan sin avisar: `src/db/schema/*`, `src/lib/*`, `src/components/app/*`, `src/components/ui/*`, `src/app/(app)/layout.tsx`, `src/lib/navigation.ts`, `src/proxy.ts`, `src/auth*.ts`. Si necesitas un cambio ahí, descríbelo en tu reporte final.
