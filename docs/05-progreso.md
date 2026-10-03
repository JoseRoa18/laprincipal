# La Principal 2050 — Progreso de la Fase 1

Actualizado: 2026-10-03. **Estado: Fase 1 completa y publicada** en https://laprincipal.vercel.app (Supabase + Vercel, ver `docs/07-despliegue.md`). Verificada en local: typecheck, lint, 188 pruebas y los scripts de humo.

## Estado por módulo

| Módulo | Estado | Reporte detallado |
|---|---|---|
| Base del proyecto, autenticación, armazón | Listo | este documento |
| Productos (catálogo, fotos con IA, códigos, etiquetas, importación Excel) | Listo | `docs/reportes/catalogo.md` |
| Inventario (existencias, kardex, ajustes, conteos, alertas) y Compras (proveedores, entradas, qué comprar) | Listo | `docs/reportes/inventario-compras.md` |
| Ventas (POS multi-moneda, ticket, devoluciones, anulación, cotizaciones, cambio de vendedor por PIN) | Listo | `docs/reportes/ventas.md` |
| Caja (apertura/cierre por moneda), Clientes, Configuración (empresa, tasas, impuestos, métodos, motivos, unidades, series, impresión, políticas, usuarios, mi cuenta, respaldos) | Listo | `docs/reportes/caja-clientes-configuracion.md` |
| Reportes y estadísticas (velocidad, ABC, reorden, ajustes y mermas, Excel y PDF, cron diario, inicio con datos reales) | Listo | `docs/reportes/reportes.md` |

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

- Probar en el local con equipos reales: recorte de fotos en el celular (la primera vez descarga un modelo de unos 40 MB), ticket y cierre en la impresora térmica, escáner USB y cámara en el conteo. "Estilo catálogo con IA" (Gemini) sigue sin probarse con una clave real.
- Devoluciones repetidas de una misma línea pueden diferir en centavos por prorrateo.
- Conteo ciego: el servidor ya no envía lo esperado a la pantalla de conteo ni al cierre de caja, pero quien tiene acceso a Inventario ve existencias en otras pantallas. El valor del ciego es que el primer conteo queda registrado antes de ver el esperado.
- PDF de reportes: hasta 2.000 filas por hoja (el Excel tiene todas); códigos muy largos sin espacios pueden montarse sobre la columna vecina en el reporte de velocidad.
- Sugerencias de esquema para una futura migración: secuencias para SKU y códigos internos; índices únicos parciales en `product_barcodes` (INTERNAL) y `product_images` (primaria); `purchase_receipts.applied_by`; `import_jobs.file_path` opcional.

## Mejoras posteriores (2026-09-08, tarde)

- Tema visual "industrial azul" y animaciones sutiles con respeto a "reducir movimiento".
- Producción: driver `pg` (node-postgres) con el transaction pooler de Supabase; el session pooler admite solo 15 clientes y postgres.js colgaba consultas concurrentes.
- Fotos: acabado de estudio automático (niveles, balance de blancos, bordes sin halo, encuadre uniforme, sombra suave) y modo opcional "Estilo catálogo con IA" (Gemini, activo solo con `GEMINI_API_KEY`). Informe: `docs/reportes/fotos-catalogo.md`.
- Revisión móvil completa con Playwright (`scripts/qa-mobile.ts`): 60 rutas × celular y tablet más 52 diálogos, sin desbordes ni objetivos táctiles pequeños. Informe: `docs/reportes/qa-movil.md`.

## Mejoras posteriores (2026-10-03)

- Cantidades decimales: `0.125` ya no se lee como 125 (un grupo de miles nunca empieza en 0). Pruebas en `src/lib/format.test.ts`.
- Una sola clasificación ABC (`abcClassify` en `inventory/domain/velocity.ts`).
- Consultas en paralelo con `allQueries` (`src/db/parallel.ts`): en paralelo sobre el pool y en serie dentro de una transacción. Quita el aviso de pg ("client is already executing a query") que en pg 9 sería un error.
- Conteo ciego de caja en el servidor: "Registrar conteo" guarda lo contado y el esperado del momento; el cierre usa ese conteo y pide recontar si hubo ventas o movimientos después. "Volver a contar" queda en auditoría (`cash_session.count`) y el reporte de cierre muestra "Conteo repetido". El vendedor ya no ve el efectivo esperado en `/caja` ni el reporte en vivo.
- Conteo ciego de inventario en el servidor: columna `stock_counts.revealed_at` (migración `0003_count_revealed_at`); mientras el conteo está abierto y sin revelar, ni la página ni las acciones envían esperado ni diferencias. "Terminar y ver diferencias" lo revela (auditoría `count.reveal`). El escáner del conteo usa `findCountProductAction`, que no devuelve existencia ni costo.
- Anular una entrada por compra devuelve el último costo del proveedor a su entrada aplicada anterior, o lo deja vacío.
- La tarea diaria (`/api/cron/stats`) vence las cotizaciones atrasadas y libera sus reservas antes de recalcular estadísticas.
- Código del proveedor y unidades por empaque editables desde la ficha del proveedor y la del producto.
- Reporte "Ajustes y mermas" (`/reportes/ajustes`): pérdidas, sobrantes y neto por motivo, por producto y por movimiento, con enlace al ajuste o conteo.
- Exportación a PDF de todos los reportes (`format=pdf` en `/api/reports/export`), generada desde las mismas hojas del Excel.

## Próximos pasos

1. Subir estos cambios a `main`: Vercel aplica la migración `0003` al construir.
2. Probar en el local con los equipos reales (ver pendientes) y hacer un día de prueba completo en producción.
3. Revisar el plan de Vercel: el plan Hobby es solo para uso personal no comercial; para el negocio corresponde Pro.
4. Fase 2: números de serie y garantías, promociones simples, notificaciones, modo offline básico, impresión ESC/POS directa, crédito a técnicos, tasa BCV automática.
