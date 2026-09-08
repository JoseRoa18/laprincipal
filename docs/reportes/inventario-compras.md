# Reporte — Paquete B: Inventario y compras

Fecha: 2026-09-08. Alcance: existencias, kardex, ajustes, conteos físicos, alertas, proveedores, entradas por compra y "qué comprar".

## 1. Qué se construyó

### Rutas

| Ruta | Pantalla | Roles |
|---|---|---|
| `/inventario` | Existencias: físico, disponible, mínimos, cobertura, semáforo, ubicación, valor a costo (solo admin/almacén) con equivalentes Bs y COP; filtros por estado, categoría y "solo con existencia"; búsqueda; diálogo "Editar mínimos"; tarjetas en celular | Todos |
| `/inventario/movimientos` | Kardex con filtros de producto (buscador que resuelve a `?product=<id>`), tipo, usuario y rango de fechas (últimos 30 días por defecto); enlace al documento origen; paginado | Todos (costos solo admin/almacén) |
| `/inventario/ajustes`, `/nuevo`, `/[id]` | Ajustes con motivo obligatorio; borrador editable; "Guardar y aplicar" o "Guardar borrador"; cancelar borrador; detalle de aplicados | Admin, Almacén |
| `/inventario/conteos`, `/nuevo`, `/[id]` | Conteo físico por categoría o ubicación, modo ciego; pantalla de conteo para celular con búsqueda, escáner de cámara, entrada por código, progreso "x de n", pestaña de diferencias con valor a costo; "Aplicar ajustes" y "Cancelar" | Admin, Almacén |
| `/inventario/alertas` | Pestañas: Comprar ya, Pronto, Exceso, Sin movimiento (N días de `settings.stats.noMovementDays`), Agotados | Todos |
| `/compras` | Índice con números rápidos (entradas del mes, proveedores activos, productos por comprar) y accesos | Admin, Almacén |
| `/compras/proveedores`, `/nuevo`, `/[id]`, `/[id]/editar` | CRUD de proveedores; ficha con productos que surte (último costo, preferido con estrella) y últimas entradas | Admin, Almacén |
| `/compras/entradas`, `/nueva`, `/[id]` | Entrada por compra: proveedor, documento, fecha, moneda y tasa (de `exchange_rates` para esa fecha, editable), líneas con costo en la moneda del documento convertido a USD, gastos adicionales prorrateados, totales; borrador editable; "Aplicar entrada"; "Anular" (solo admin, con motivo) | Admin, Almacén |
| `/compras/que-comprar` | Sugerencia agrupada por proveedor preferido con cantidades editables, total estimado, "Exportar a Excel" y "Crear entrada" (prellena `/compras/entradas/nueva`) | Admin, Almacén |
| `POST/GET /api/purchasing/suggestions` | Excel del pedido (exceljs). `POST` recibe las cantidades editadas; `GET ?supplier=<id|none>` usa las sugeridas | Admin, Almacén |

### Archivos

- `src/modules/inventory/infrastructure/`: `labels.ts` (etiquetas de tipos de movimiento, estados y enlaces a documentos; **reutilizable por otros módulos**), `stock-query.ts` (consulta base de existencias con el semáforo calculado en SQL, categorías para filtros), `movements.ts` (kardex), `adjustments.ts`, `counts.ts`, `alerts.ts`.
- `src/modules/inventory/application/`: `schemas.ts` (Zod compartido con los formularios), `transaction.ts` (`inTransaction`), `stock-settings.ts`, `adjustments.ts`, `counts.ts`. No se tocó `stock.ts`.
- `src/modules/inventory/ui/`: `filters.tsx` (selects, toggles y fechas ligados a la URL), `product-picker.tsx` (buscador con lista, compatible con escáner USB), `barcode-scanner.tsx` (cámara con `html5-qrcode` cargado bajo demanda), `stock-settings-dialog.tsx`, `stock-table.tsx`, `movement-product-filter.tsx`, `adjustment-form.tsx`, `count-create-form.tsx`, `count-sheet.tsx`, `status-badges.tsx`.
- `src/modules/purchasing/domain/`: `receipt-math.ts` (+ `receipt-math.test.ts`): conversión de líneas a USD, prorrateo y promedio tras anulación.
- `src/modules/purchasing/application/`: `schemas.ts`, `suppliers.ts`, `receipts.ts`.
- `src/modules/purchasing/infrastructure/`: `labels.ts`, `suppliers.ts`, `receipts.ts`, `suggestions.ts`.
- `src/modules/purchasing/ui/`: `supplier-form.tsx`, `preferred-toggle.tsx`, `receipt-form.tsx`, `receipt-actions.tsx`, `suggestions-table.tsx`, `status-badge.tsx`.
- Páginas, `loading.tsx` y `actions.ts` bajo `src/app/(app)/inventario/**` y `src/app/(app)/compras/**`; `src/app/api/purchasing/suggestions/route.ts`.
- Pruebas: `tests/inventory.test.ts`, `tests/purchasing.test.ts`, `tests/inventory-fixtures.ts`; humo: `scripts/smoke-inventory.ts`.

### Reglas implementadas

- Todo lo que mueve stock corre en `db.transaction` con `lockStock` / `applyMovements` y `nextDocumentNumber` (series `A-`, `I-`, `E-`); nunca se actualiza `stock_levels` a mano. Auditoría en cada crear/aplicar/cancelar/anular.
- Semáforo: `product_stats.status` cuando existe la fila y no es `no_data`; si no, regla manual `stock ≤ coalesce(nullif(reorder_point,0), min_stock)` → Comprar ya, `stock > max_stock` → Exceso, con mínimos → OK, sin nada → Sin datos. Se calcula en SQL (`statusExpr`) para poder filtrar y paginar.
- Ajustes: el motivo decide el signo (`increase`/`decrease`); en motivos `both` el usuario elige "Entra/Sale" por línea. Las salidas usan el costo promedio. En las entradas el costo es editable y **se incorpora al promedio ponderado** (así "Inventario inicial" a un costo dado valoriza el inventario). Stock negativo solo si `policies.allowNegativeStock`.
- Conteos: al crear se congela `expected_qty` de los productos activos con fila de stock o de mínimos (opcionalmente por categoría, incluyendo subcategorías, o prefijo de ubicación). Al aplicar se genera `count_adjust` solo para diferencias ≠ 0 con motivo "Error de conteo"; lo no contado no cambia. Se puede agregar al conteo un producto escaneado que no estaba. El número (`I-`) se asigna al aplicar.
- Entradas: `unit_cost_usd = costo ÷ tasa` (4 decimales), gastos prorrateados por valor (`prorateExtraCosts`), movimiento `purchase_in` al costo final, `cost_avg_usd` con `weightedAverageCost` (promedio corrido si un producto se repite), `cost_last_usd` = costo final, `product_suppliers` con último costo (monto, moneda, USD, fecha) y preferido si no había. Anular: solo si ningún producto tiene movimientos posteriores; crea `purchase_void_out`, restaura el promedio con `(avg×qtyNow − costFinal×qty) ÷ (qtyNow − qty)` (o el costo de la compra anterior si no queda stock) y devuelve `cost_last_usd` al de la compra anterior si existe.
- Qué comprar: estados `buy_now`/`soon`; cantidad = `product_stats.suggested_qty` > 0, si no `reorder_qty` > 0, si no `max(max − stock, 0)`, redondeada al `pack_size` del proveedor; agrupado por preferido, luego primer proveedor, luego "Sin proveedor"; costo estimado = último costo del proveedor o promedio.

## 2. Cómo probar a mano

1. Entrar como `admin@laprincipal2050.com` / `Admin2050*`. Cargar la tasa del día en `/configuracion/tasas` (si no existe, la entrada en Bs pide escribirla a mano).
2. Crear un proveedor en `/compras/proveedores/nuevo` (moneda VES, entrega 5 días).
3. Crear dos productos en `/productos/nuevo` (Paquete A). Si el catálogo no está listo, `scripts/smoke-inventory.ts` muestra cómo insertar uno directo en `products`.
4. `/inventario/ajustes/nuevo`: motivo "Inventario inicial", buscar los productos, cantidad 10 y costo 5, "Guardar y aplicar". Debe aparecer `A-000001`; en `/inventario` el stock es 10 y el valor a costo 50 $ (con Bs y COP); en `/inventario/movimientos` hay un "Ajuste (+)" con saldo 10 y enlace al ajuste.
5. En `/inventario`, "Editar mínimos" (icono) de un producto: mínimo 15, máximo 40 → el semáforo pasa a "Comprar ya" y el producto aparece en `/inventario/alertas` y en `/compras/que-comprar`.
6. `/compras/entradas/nueva`: elegir el proveedor (la moneda y la tasa se llenan solas), documento "F-100", agregar el producto con cantidad 10 y costo 255,50 Bs, gastos 12 $, "Aplicar entrada". Debe aparecer `E-000001`; el costo promedio del producto cambia a ((10×5)+(10×costo final))÷20; en la ficha del proveedor el producto sale como surtido, preferido y con su último costo.
7. En el detalle de la entrada, "Anular" (solo admin) con un motivo: el stock vuelve a 10 y el promedio a 5. Si antes se registró una venta o ajuste posterior del producto, la anulación se rechaza con el nombre del producto.
8. `/inventario/conteos/nuevo`: conteo ciego de todo el inventario → "Empezar a contar". En el celular, "Escanear" abre la cámara; también sirve escribir el código y Enter, o escribir el nombre para filtrar. Contar 8 en un producto de 10 y dejar el otro sin contar; en "Diferencias" se ve −2 y su valor; "Aplicar ajustes" crea un "Ajuste por conteo" solo para ese producto y asigna `I-000001`.
9. `/compras/que-comprar`: ajustar cantidades, "Exportar a Excel" descarga `pedido-<proveedor>-<fecha>.xlsx`; "Crear entrada" abre la entrada nueva con el proveedor y las líneas prellenadas.
10. Kardex: filtrar por producto (buscador), tipo, usuario y fechas; el enlace de "Documento" lleva al ajuste, conteo o entrada.

## 3. Pruebas

- `pnpm test`: `tests/inventory.test.ts` (7 pruebas) y `tests/purchasing.test.ts` (5) más `receipt-math.test.ts` (7). Cubren: aplicar ajuste actualiza stock, kardex con `balance_after`, costo y numeración consecutiva; stock negativo rechazado salvo política; signo forzado por el motivo; conteo genera `count_adjust` solo para diferencias, agrega productos y rechaza conteos vacíos; semáforo manual, valor del inventario y alertas; entrada por compra actualiza `cost_avg_usd` (ponderado), `cost_last_usd`, `product_suppliers` y numera consecutivo; prorrateo de gastos al costo final del kardex; anulación revierte stock y costo y se bloquea si hubo movimientos posteriores; validación de cabecera y borrado de borradores; proveedores, preferido y agrupación de sugerencias.
- Cada escenario corre dentro de una transacción que se revierte al final (`tests/inventory-fixtures.ts`): el kardex y la auditoría son de solo inserción, así que borrar filas no es posible; los casos de uso abren savepoints cuando reciben una transacción. Las fixtures crean su propio almacén, usuario, unidad, impuesto, series y motivos (la base de pruebas no tiene semilla).
- Resultado: 19/19 propias en verde. En la corrida completa (`pnpm test`, 128 pruebas) la única falla es `tests/reporting.test.ts` ("dashboard totals": `cash.open` esperado `false`), del Paquete E.
- `pnpm exec tsx scripts/smoke-inventory.ts`: crea un producto y un proveedor temporales (sin movimientos, se borran al final), visita 19 rutas incluyendo detalles y la entrada prellenada, prueba la exportación a Excel y que ids inexistentes muestren "no encontrado" (la respuesta trae estado 200 porque `loading.tsx` transmite la cáscara antes de `notFound()`; se comprueba la marca `next-error`). Todo en verde.
- `pnpm typecheck` y `pnpm lint`: sin errores ni advertencias en los archivos del paquete. Ver §5 para los errores ajenos.

## 4. Pendientes conocidos

- `product_suppliers.supplier_code` y `pack_size` no se editan desde la interfaz (solo se muestran); se llenan por importación o SQL.
- La anulación de una entrada no revierte el último costo en `product_suppliers` (sí en `products.cost_last_usd`).
- En los conteos, la diferencia se calcula contra la existencia congelada al crear el conteo; si hubo ventas entre el conteo y la aplicación, el ajuste aplica esa diferencia sobre el stock actual (comportamiento estándar, documentado en el botón).
- Las alertas listan hasta 500 productos por pestaña y "Qué comprar" hasta 1 000 por estado.
- El escáner de cámara depende de HTTPS o `localhost` (requisito del navegador); en la PC funciona el escáner USB como teclado en cualquier buscador.
- El PDF/etiquetas y la exportación de existencias completas quedan para Reportes.

## 5. Cambios solicitados a archivos compartidos y esquema

- No se modificó ningún archivo compartido ni el esquema. Sugerencias menores (no bloqueantes): `purchase_receipts.applied_by` (hoy solo hay `applied_at`) para mostrar quién aplicó; un índice `stock_counts(status)`.
- `scripts/smoke.ts` no se tocó; las rutas nuevas están en `scripts/smoke-inventory.ts`.
- Errores de otros paquetes (en construcción en paralelo) que al cierre de este reporte rompen `pnpm typecheck` / `pnpm lint` y que no edité: `scripts/gen-icons.ts` (falta la dependencia `sharp`), `src/modules/sales/ui/pos/pos-screen.tsx` (`persist` en `CartStore`), `src/modules/settings/infrastructure/catalogs.ts` y `settings/ui/{reasons,taxes,units,payment-methods}-table.tsx` (tipos `*ListRow` no exportados de `settings/domain/catalog-forms`); reglas `react-hooks/set-state-in-effect` e "impure function during render" en `sales/ui/pos/*`, `catalog/ui/*`, `customers/ui/customer-form.tsx`, `cash/ui/movement-dialog.tsx`, `auth/ui/user-dialogs.tsx`. La lista cambia con el avance de esos paquetes; los archivos de este paquete pasan `tsc` y `eslint` sin avisos.
