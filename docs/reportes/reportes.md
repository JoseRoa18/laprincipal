# Paquete E — Reportes y estadísticas

Fecha: 2026-09-08. Dueño: `src/modules/reporting/**`, `/reportes/**`, `/api/cron/stats`, `/api/reports/export`, `vercel.json`, datos reales de `/inicio`.

## 1. Qué se construyó

### Estadísticas de producto (`product_stats`)

`recomputeProductStats(options?)` en `src/modules/reporting/application/product-stats.ts` (acepta `db`, `today`, `warehouseId` y `tz` para pruebas deterministas). Para cada producto activo y no eliminado del almacén por defecto:

- **Ventas**: `sale_items` unidas a `sales` con estado `completed`, `partially_refunded` o `refunded`, agrupadas por día del negocio (`sale_date AT TIME ZONE 'America/Caracas'`). Unidades = `quantity − returned_qty`; ingresos = `line_total_usd × (quantity − returned_qty) / quantity`.
- **Días con existencia** (`src/modules/reporting/domain/stock-days.ts`, puro): se reconstruye el saldo al cierre de cada día con `inventory_movements.balance_after` (orden `created_at, id`); el saldo previo a la ventana es el último movimiento anterior (0 si no hay). Un día cuenta cuando el saldo al cierre es > 0 **o** hubo una venta ese día. Las ventanas son de 30, 60 y 90 días **incluyendo hoy** (`hoy − N + 1 … hoy`).
- `velocity30/60/90 = unidades ÷ días con existencia`; `velocity = weightedVelocity` con los pesos de configuración (0,5 / 0,3 / 0,2); `demand_std_dev` = desviación de las unidades diarias de la ventana de 30 días (ceros incluidos en los días con existencia); `days_of_cover = disponible ÷ velocity`.
- **ABC** por ingresos de 90 días (`src/modules/reporting/domain/abc.ts`): A mientras la participación acumulada *antes* del producto sea < 80 %, B < 95 %, C el resto (ver sección 5 sobre `abcClassify`).
- **Tiempo de entrega** del proveedor preferido (`product_suppliers.is_preferred`), si no el primero, si no 7 días; **empaque** de la misma fila (`pack_size`).
- `suggested_reorder_point = velocity × leadTime + safetyStock(σ, leadTime, nivel de servicio por clase)`; `suggested_qty = suggestedQty(velocity, targetCoverDays, disponible, 0, packSize)`.
- `hasData` = lleva al menos `minDaysForAuto` (30) días con existencia desde `first_stock_at` **y** vendió algo en 90 días. Punto de reorden efectivo: `hasData && mode = 'auto'` → sugerido; si no, `reorder_point` manual (> 0) o `min_stock`. `status = stockStatus(...)` con `soonThresholdDays`.
- Upsert de todas las columnas de `product_stats` (`computed_at = ahora`). En modo `auto` con historial se escriben `stock_settings.reorder_point` y `reorder_qty` redondeados a los decimales de la unidad. Nunca se tocan `stock_levels`, `sales` ni el kardex.
- Devuelve `{ products, autoUpdated, computedAt, durationMs }`.

Disparadores:

- Acción `recomputeStatsAction` (`src/app/(app)/reportes/actions.ts`, solo admin, deja auditoría `stats.recompute`) usada por el botón **Recalcular ahora** en `/reportes` y `/reportes/velocidad`.
- Cron `GET /api/cron/stats` (`src/app/api/cron/stats/route.ts`): exige `Authorization: Bearer <CRON_SECRET>` (comparación de tiempo constante); sin `CRON_SECRET` solo responde en desarrollo; `401` en cualquier otro caso. `vercel.json` programa `/api/cron/stats` a las 07:00 UTC (03:00 Caracas) y `/api/cron/backup` los domingos a las 08:00 UTC (ruta del paquete D). `src/proxy.ts` ya excluye `api/cron`.

### Datos del inicio

`getDashboardData()` (`src/modules/reporting/infrastructure/dashboard.ts`): ventas de hoy y del mes (total USD, cantidad, ticket promedio, variación % contra ayer y contra el mismo tramo del mes pasado), unidades de hoy, productos en `buy_now` y `soon`, valor del inventario a costo (`Σ quantity × cost_avg_usd`), sesión de caja abierta (número, quién, desde cuándo), top 5 de 7 días por unidades y ventas por día de los últimos 14 días. Todo en consultas paralelas. `src/app/(app)/inicio/page.tsx` muestra estos datos con equivalentes en Bs/COP (tasa del día), gráfico de 14 días con su tabla, tarjeta de caja y más vendidos; conserva la tarjeta de aviso de tasa y las dos tarjetas de acción. Por rol: vendedor no ve el valor del inventario; almacén no ve montos de venta ni caja.

### Reportes (`/reportes/**`, solo administrador)

| Ruta | Contenido |
|---|---|
| `/reportes` | Tarjetas a cada reporte, fecha del último cálculo y **Recalcular ahora**. |
| `/reportes/ventas` | Filtro de período (Hoy, Ayer, Esta semana, Este mes, Mes pasado, Últimos 30 días, personalizado); KPIs con comparación al período anterior (total, ventas, ticket promedio, unidades, IVA, descuentos); anuladas y devoluciones; gráfico de barras por día (Recharts, un solo color) con tabla al lado; pestañas por producto, categoría, vendedor, método de pago (monto en su moneda y en USD) y hora del día; Excel. |
| `/reportes/inventario` | Valor a costo en USD, Bs y COP; unidades; productos con y sin existencia; tabla por categoría con barras; top 50 ordenable por valor, existencia o nombre; Excel con todos los productos. |
| `/reportes/velocidad` | Tabla de `product_stats` con producto, disponible, velocidad/día (ponderada y a 30 días), cobertura, ABC, semáforo (`StockStatusBadge`), reorden sugerido (y el manual), cantidad sugerida, última venta y modo; chips por estado; filtros por estado, clase y categoría; orden por velocidad, cobertura o nombre; paginación de 50; Excel; **Recalcular ahora**; cuadro explicativo de las fórmulas y de la regla manual → automático. |
| `/reportes/margen` | Ingresos sin IVA, costo (`unit_cost_usd × unidades netas`), margen USD y % por producto y por categoría para el período; Excel. |
| `/reportes/sin-movimiento` | Productos con existencia > 0 sin ventas en N días (por defecto `noMovementDays`, selector 30/60/90/180/365) que ya estaban en existencia hace N días; valor inmovilizado; última venta y última entrada; Excel. |

Exportación: `GET /api/reports/export?report=sales|inventory|velocity|margin|no_movement&…` (`src/app/api/reports/export/route.ts`, exceljs, una hoja por tabla, requiere sesión con permiso `reports`).

### Archivos

- Dominio: `src/modules/reporting/domain/{date-range,stock-days,abc}.ts` (+ `*.test.ts`).
- Aplicación: `src/modules/reporting/application/product-stats.ts`.
- Infraestructura: `src/modules/reporting/infrastructure/{common,dashboard,sales-report,inventory-report,velocity-report,margin-report,no-movement-report,categories,excel}.ts`.
- UI: `src/modules/reporting/ui/{date-range-filter,period-filter,sales-by-day-chart,kpi-card,share-bar,equivalents,export-button,recompute-button,param-select,back-to-reports}.tsx`, `viz.ts`.
- Páginas: `src/app/(app)/reportes/{page,loading,actions}` y subcarpetas `ventas`, `inventario`, `velocidad`, `margen`, `sin-movimiento` (cada una con `page.tsx` y `loading.tsx`); `src/app/(app)/inicio/page.tsx`.
- API: `src/app/api/cron/stats/route.ts`, `src/app/api/reports/export/route.ts`; `vercel.json`.
- Pruebas y scripts: `tests/reporting.test.ts`, `scripts/smoke-reports.ts`.

## 2. Cómo probar a mano

1. Con la base en 5433 y `pnpm dev` corriendo, entra como `admin@laprincipal2050.com` / `Admin2050*`.
2. Crea dos o tres productos con existencia inicial (Productos → Nuevo producto) y haz varias ventas desde `/vender` en días distintos (o inserta ventas con fechas pasadas si quieres ver velocidad).
3. Ve a **Reportes** y pulsa **Recalcular ahora**: aparece la fecha del cálculo y un aviso con el número de productos.
4. **Reportes → Ventas**: cambia el período con los botones y con fechas personalizadas; revisa que los KPIs, el gráfico, la tabla por día y las pestañas coincidan con las ventas hechas; anula una venta y confirma que pasa a "Ventas anuladas" y no cuenta en el total. **Exportar a Excel** descarga `ventas_<desde>_<hasta>.xlsx` con una hoja por tabla.
5. **Reportes → Velocidad de venta**: filtra por estado (chips o selector), clase y categoría; ordena por cobertura; pon un producto en modo automático en su ficha de inventario; recalcula y verifica que el punto de reorden de la ficha se actualizó con el sugerido.
6. **Reportes → Inventario valorizado**: compara el total con la suma de existencia × costo promedio de tus productos; cambia el orden; exporta.
7. **Reportes → Margen bruto**: los ingresos son sin IVA; el costo es el costo promedio guardado en cada línea de venta.
8. **Reportes → Sin movimiento**: con productos recién creados el reporte está vacío (todavía no llevan N días en existencia); cambia el selector a 30 días para ver productos con más antigüedad.
9. **Inicio**: las tarjetas muestran ventas de hoy y del mes con equivalentes en Bs, productos por comprar (enlace al reporte filtrado), valor del inventario, caja abierta o cerrada y el gráfico de 14 días (enlace "Ver tabla").
10. Cron: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/stats` responde `{ ok: true, products, ... }`; sin cabecera responde 401.

## 3. Pruebas añadidas y resultado

- `src/modules/reporting/domain/stock-days.test.ts` (6): sin movimientos, saldo previo a la ventana, límites de ventana, stock que llega a cero a mitad de ventana y vuelve con una entrada, ventas en día con saldo cero o negativo, varias ventas el mismo día y movimientos desordenados.
- `src/modules/reporting/domain/date-range.test.ts` (5): aritmética de días, validación, instantes en Caracas (UTC−4), presets y período anterior, lectura de `searchParams`.
- `src/modules/reporting/domain/abc.test.ts` (4): reparto A/B/C, producto único con todo el ingreso → A, todo en cero → C, producto que cruza el 80 %.
- `tests/reporting.test.ts` (4, integración con `createTestDb()`): producto con `initial` hace 40 días y 30 ventas diarias de 2 → `velocity_30 = 2.0000`, `velocity_60/90 = 1.4634`, `velocity = 1.7317`, `abc = A`, cobertura 23,10 días, reorden sugerido 12,122, cantidad sugerida 12, estado `ok`; producto sin ventas → `no_data`; modo automático escribe `reorder_point/reorder_qty = 12` y el manual conserva sus valores (`buy_now` por mínimo); totales del inicio (hoy, mes, unidades, valor, top 5, 14 días, caja cerrada y abierta en un registro de caja propio e inactivo); reportes de ventas, margen, inventario, velocidad (filtros) y sin movimiento coherentes con los datos.
- Resultado: `pnpm test` → 23 archivos, 133 pruebas en verde (19 de este paquete). `pnpm exec tsx scripts/smoke-reports.ts` → todas las rutas 200, exportaciones `.xlsx` de los cinco reportes, `/api/cron/stats` 401 sin secreto y 200 con él, anónimo bloqueado en la exportación. `pnpm lint` sin problemas en los archivos de este paquete. `pnpm typecheck` sin errores en este paquete (queda uno ajeno, ver sección 5).

Nota de limpieza: el kardex es de solo inserción, así que la prueba de integración no puede borrar sus productos ni el almacén de prueba; los deja inactivos/soft-deleted (almacén inactivo, así `getDefaultLocation()` nunca lo elige).

## 4. Pendientes conocidos

- Exportación a **PDF** (alcance 4.8) no incluida; solo Excel.
- Reporte de **ajustes y mermas** y **kardex** (4.8) no están en `/reportes`: el kardex vive en `/inventario/movimientos` (paquete B).
- La comparación "ventas del mes" usa el mismo número de días del mes pasado (1 → día actual), no el mes completo.
- El gráfico se validó por SSR y prueba de humo; conviene una revisión visual en escritorio y celular (modo claro y oscuro) cuando haya ventas reales.
- Con catálogos muy grandes (miles de productos) el recálculo hace una pasada en memoria por producto; hoy tarda milisegundos, pero si crece conviene vigilar `durationMs` en el cron.

## 5. Cambios solicitados en archivos compartidos

- `src/modules/inventory/domain/velocity.ts` → `abcClassify`: clasifica con la participación acumulada **incluyendo** el producto, así que el producto con más ingresos queda en **C** cuando él solo supera el 80 % (por ejemplo, un único producto vendido). Este paquete usa `classifyAbc` (`reporting/domain/abc.ts`, participación *antes* del producto). Se sugiere corregir la función compartida con esa regla (las pruebas existentes siguen pasando) y luego eliminar la copia local.
- `src/modules/settings/infrastructure/settings.ts`: `getStatsSettings()` no acepta `dbx`; se usa `getSetting("stats", dbx)` directamente. Opcional: exponer `getStatsSettings(dbx)`.
- Sin cambios de esquema.
- Ajeno a este paquete: `pnpm typecheck` falla por `src/modules/sales/ui/pos/pos-screen.tsx` (`persist` no existe en `CartStore`) y `pnpm lint` reporta 14 errores en `src/modules/sales/ui/pos/*` (reglas `react-hooks`). Los archivos de este paquete están limpios.
