# La Principal 2050 — Progreso de la Fase 1

Actualizado: 2026-09-08. **Estado: Fase 1 completa en local y verificada** (typecheck, lint, 133 pruebas, 6 scripts de humo). Pendiente: publicar en Supabase y Vercel.

## Estado por módulo

| Módulo | Estado | Reporte detallado |
|---|---|---|
| Base del proyecto, autenticación, armazón | Listo | este documento |
| Productos (catálogo, fotos con IA, códigos, etiquetas, importación Excel) | Listo | `docs/reportes/catalogo.md` |
| Inventario (existencias, kardex, ajustes, conteos, alertas) y Compras (proveedores, entradas, qué comprar) | Listo | `docs/reportes/inventario-compras.md` |
| Ventas (POS multi-moneda, ticket, devoluciones, anulación, cotizaciones, cambio de vendedor por PIN) | Listo | `docs/reportes/ventas.md` |
| Caja (apertura/cierre por moneda), Clientes, Configuración (empresa, tasas, impuestos, métodos, motivos, unidades, series, impresión, políticas, usuarios, mi cuenta, respaldos) | Listo | `docs/reportes/caja-clientes-configuracion.md` |
| Reportes y estadísticas (velocidad, ABC, reorden, cron diario, inicio con datos reales) | Listo | `docs/reportes/reportes.md` |

## Cómo probar

1. `pnpm db:start` en una terminal y `pnpm dev` en otra (o `pnpm dev:all`). Abrir http://localhost:3000.
2. Entrar con `jose.stylishkb@gmail.com` / `Stylish2026*` (PIN `1234`). Cambiar la contraseña en Configuración → Mi cuenta.
3. Configuración → Tasas: cargar la tasa del día de Bs y COP (sin tasa no se puede vender).
4. Productos → Nuevo producto: tomar la foto con el celular, revisar el recorte, completar datos, precio y stock inicial.
5. Caja → Abrir caja con el fondo en USD y COP.
6. Vender: buscar o escanear, cobrar con pagos mixtos, imprimir ticket.
7. Compras → Nueva entrada con un proveedor; Inventario → conteo desde el celular.
8. Reportes → Recalcular ahora para ver velocidad de venta y qué comprar.

Verificación automática: `pnpm typecheck`, `pnpm lint`, `pnpm test`, y `pnpm exec tsx scripts/smoke-<módulo>.ts` con el servidor corriendo. Los scripts de humo dejan datos de prueba marcados `SMK-` en la base local; se limpian recreando la base (`pnpm db:migrate` y `pnpm db:seed` sobre una base nueva).

## Decisiones tomadas durante la construcción

- Auth.js con usuarios propios en lugar de Supabase Auth (ADR 7); PostgreSQL embebido para desarrollo (ADR 8), datos en `%LOCALAPPDATA%\la-principal-2050\pg`.
- Repositorio en `C:\Users\josei\OneDrive\Documentos\Empresa` por decisión del dueño; `node-linker=hoisted` en `.npmrc` para evitar enlaces simbólicos dentro de OneDrive.
- shadcn/ui v4 sobre Base UI; TanStack Table v8; búsqueda por `search_text` normalizado con índice trigram.
- Tabla de permisos en `src/lib/permissions.ts` (sin dependencias de framework) reexportada desde `auth-guards.ts`.

## Pendientes conocidos (no bloquean el uso)

- Fotos: el recorte en el navegador no está cubierto por pruebas automáticas; probar en el celular real (la primera vez descarga un modelo de unos 40 MB).
- Cotizaciones vencen al abrir la lista, no por tarea programada. Devoluciones repetidas de una misma línea pueden diferir en centavos por prorrateo.
- Conteo ciego oculta el esperado en el navegador, no en el servidor.
- Anulación de entrada por compra no revierte el último costo en `product_suppliers`.
- Sugerencias de esquema para una futura migración: secuencias para SKU y códigos internos; índices únicos parciales en `product_barcodes` (INTERNAL) y `product_images` (primaria); `purchase_receipts.applied_by`; `import_jobs.file_path` opcional.
- `src/modules/reporting/domain/abc.ts` duplica `abcClassify` (ya corregido en la compartida); unificar.

## Próximos pasos

1. Publicar: repositorio privado en GitHub, proyecto en Supabase y en Vercel según `docs/07-despliegue.md` (requiere autorización y cuentas del dueño).
2. Fase 2: números de serie y garantías, promociones simples, notificaciones, modo offline básico, impresión ESC/POS directa, crédito a técnicos.
