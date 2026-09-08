# Reporte — Paquete C: Ventas y punto de venta (POS)

Fecha: 2026-09-08. Rutas `/vender`, `/ventas/**`, `/cotizaciones/**`, `/imprimir/ticket/[id]`, `/api/sales/**`. Módulo `src/modules/sales/{application,infrastructure,ui}` (el dominio `pricing.ts` / `payments.ts` ya existía y no se tocó).

## 1. Qué se construyó

| Ruta | Pantalla | Roles |
|---|---|---|
| `/vender` | Punto de venta: buscar o escanear (USB y cámara), carrito persistente, cliente, descuentos por línea y generales con límite por rol y PIN de supervisor, ventas en espera, cambio de vendedor por PIN, cotizar desde el carrito, cobrar multi-moneda. `?cotizacion=<id>` carga una cotización; `?espera=<id>` una venta en espera. Atajos F2 (buscar), F9 (cobrar), Esc (cerrar). | Admin, Vendedor |
| `/ventas` | Lista con filtros por fecha (hoy por defecto), estado, vendedor y método de pago; total del período; paginación en servidor. | Admin, Vendedor |
| `/ventas/[id]` | Detalle: líneas, pagos (moneda, tasa, equivalente USD, referencia), cambio, tasas usadas, devoluciones, notas. Acciones: Imprimir ticket, Nota de entrega PDF, Compartir por WhatsApp, Devolver, Anular (admin). `?nueva=1` muestra el banner de venta registrada; `&imprimir=1` imprime el ticket con un marco oculto. | Admin, Vendedor |
| `/ventas/[id]/devolver` | Devolución: líneas y cantidades (≤ vendido − devuelto), motivo (`adjustment_reasons` + texto), reingreso al inventario, método de reembolso (los usados en la venta + efectivo) con monto a la tasa de la venta y redondeo de efectivo. | Admin, Vendedor |
| `/cotizaciones` | Lista con búsqueda y pestañas Abiertas / Convertidas / Vencidas / Canceladas / Todas. Al abrirla se vencen las cotizaciones fuera de fecha y se liberan sus reservas. | Admin, Vendedor |
| `/cotizaciones/nueva` | El mismo POS en modo cotización (carrito propio) → "Guardar cotización" (vigencia, notas, reservar stock). | Admin, Vendedor |
| `/cotizaciones/[id]` | Detalle con Convertir en venta (abre el POS con los precios cotizados), PDF, WhatsApp, Cancelar. | Admin, Vendedor |
| `/imprimir/ticket/[id]` | Ticket 58/80 mm (`printing.ticketWidthMm`), grupo de rutas `(print)` sin barra lateral; `?auto=1` imprime al cargar. Muestra USD y Bs (COP opcional), pagos, referencias, cambio y pie configurado. "Nota de entrega", no factura fiscal. | Todos con sesión |
| `GET /api/sales/products` | `?barcode=`, `?q=`, `?ids=` (+ `priceListId`) sobre `searchProducts` / `findProductByBarcode` / `getProductsForSale`, sin costos. | Admin, Vendedor |
| `GET /api/sales/customers?q=` | Búsqueda para el selector de cliente (nombre, documento, teléfono; sin término lista los primeros). | Admin, Vendedor |
| `GET /api/sales/held`, `GET /api/sales/held/[id]` | Ventas en espera y su carga al carrito con datos frescos de producto. | Admin, Vendedor |
| `GET /api/sales/[id]/pdf`, `GET /api/sales/quotes/[id]/pdf` | Nota de entrega y cotización en PDF A4 (`@react-pdf/renderer`) con datos de la empresa. | Admin, Vendedor |

### Archivos

- Aplicación (`src/modules/sales/application/`): `schemas.ts` (Zod compartido cliente/servidor, tipos del carrito), `cart-pricing.ts` (re-precio con lista del cliente, TECH para técnicos), `complete-sale.ts` (`completeSale(db, input, ctx)`), `hold-sale.ts`, `quotes.ts` (`createQuote`, `cancelQuote`, `expireOverdueQuotes`), `void-sale.ts`, `return-sale.ts`, `acting-seller.ts` (cookie `acting_seller` firmada, 12 h, `getActingSeller()`), `supervisor-token.ts` (HMAC `${adminId}:${exp}`, 10 min), `share-document.ts` (PDF al bucket `documents` + URL firmada 7 días + enlace `wa.me`), `labels.ts`.
- Infraestructura: `sales-queries.ts` (`listSales`, `getSaleDetail`, `listHeldSales`, `getHeldSaleCart`, `listSellers`, `listReturnReasons`), `quotes-queries.ts`, `customers-lookup.ts` (búsqueda del POS; alta rápida delegada a `createCustomer` del módulo de clientes), `payment-methods.ts`, `pos-config.ts` (`loadPosConfig`), `api-guard.ts`, `pdf/documents.tsx`.
- UI: `ui/cart-store.ts` (Zustand + `persist`, claves `lp2050-pos-cart` y `lp2050-quote-cart`), `ui/pos/*` (pantalla, búsqueda, escáner de cámara con `html5-qrcode` bajo demanda, carrito, editor de línea, descuento general, cliente, cobro, espera, supervisor, cambio de vendedor, cotización), `ui/sales/*` (filtros, acciones, banner, devolución), `ui/quotes/quote-actions.tsx`, `ui/ticket/*`, `ui/status-badge.tsx`.
- Acciones: `src/app/(app)/vender/actions.ts` (`completeSaleAction`, `holdSaleAction`, `discardHeldSaleAction`, `saveQuoteAction`, `authorizeDiscountAction`, `switchSellerAction`, `clearActingSellerAction`, `quickCreateCustomerAction`), `src/app/(app)/ventas/actions.ts` (`voidSaleAction`, `createReturnAction`, `shareSaleWhatsAppAction`), `src/app/(app)/cotizaciones/actions.ts` (`cancelQuoteAction`, `shareQuoteWhatsAppAction`).
- Pruebas y humo: `tests/sales.test.ts`, `scripts/smoke-sales.ts`.

### Reglas de negocio implementadas

- **Todo se recalcula en el servidor**: precios de la lista del cliente (o de la cotización aceptada), `computeTotals`, límite de descuento por rol (línea y venta) con token de supervisor, disponible = físico − reservado, `computePaymentState` con las tasas del día (tolerancia 0,005 USD), cambio en efectivo USD o COP redondeado al paso de caja.
- Transacción única: `lockStock` → número `nextDocumentNumber("sale")` → `sales` (completed, tasas, pagado, cambio, sesión de caja, vendedor, cliente, lista, cotización) → `sale_out` (costo promedio, `reference_type = 'sale'`) → `sale_items` (costo histórico, IVA, descuentos, `discount_authorized_by`) → `sale_payments` (moneda, monto, tasa, `amount_usd`, referencia) → borra la fila en espera / marca la cotización `converted` y libera reservas → auditoría `sale.complete`.
- Bloqueos con mensaje claro: `RATES_REQUIRED` (si `policies.requireRatesToSell`), `CASH_SESSION_REQUIRED` (si `policies.requireOpenCashSession`) con enlace a `/caja`, `INSUFFICIENT_STOCK` con producto y disponible; con `policies.allowNegativeStock` un administrador puede "Vender de todos modos".
- Vendedor activo: `sales.seller_id` = usuario de la cookie `acting_seller` (verificada con HMAC y usuario activo) o el de la sesión; su rol decide el límite de descuento. `created_by` siempre es el usuario de la sesión.
- Ventas en espera: `sales.status = held`, sin número ni movimientos; cualquier usuario las retoma o descarta. Un descuento general se guarda como descuento por línea en monto (misma cifra final). Igual en cotizaciones.
- Anulación: solo administrador, motivo obligatorio, `sale_void_in` al costo de cada línea, estado `voided` (no se anulan ventas con devoluciones). Fuera de `voidWindowHours` se avisa y queda en la auditoría.
- Devolución: `sale_returns` + ítems, `return_in` opcional al costo de la línea, `returned_qty`, estado `partially_refunded`/`refunded`, reembolso a la tasa guardada en la venta, `cash_session_id` = caja abierta.

## 2. Cómo probar a mano

1. Requisitos: tasa del día en `/configuracion/tasas` (VES y COP), caja abierta en `/caja`, al menos un producto con precio y stock (`/productos/nuevo`).
2. `/vender`: escribir parte del nombre o el número de parte → tocar el resultado; o escanear con lector USB (escribe el código y Enter) o con "cámara". El producto entra con precio de la lista Público; repetir suma cantidad. Tocar el nombre de la línea para cambiar cantidad (decimales según unidad) o poner descuento; "Agregar descuento" para uno general.
3. Cliente: "Consumidor final" → buscar o "Nuevo cliente" (marcar Técnico: los precios cambian a la lista Técnico).
4. Descuento sobre el límite (Vendedor 10 %): aparece el aviso; al cobrar pide el PIN del administrador (1234) y queda `discount_authorized_by`.
5. Cobrar (F9): tocar "Efectivo USD" (se propone lo que falta), cambiar el monto para pagar de más → "Cambio" en USD o COP; agregar "Pago Móvil" con referencia; "Faltan" muestra el saldo en $, Bs y COP. Confirmar (Enter). Se abre `/ventas/<id>?nueva=1` con el banner, el ticket se imprime solo si dejaste "Imprimir ticket"; "Imprimir ticket" abre `/imprimir/ticket/<id>?auto=1`.
6. Ventas en espera: con productos en el carrito, "En espera" → etiqueta → el carrito se vacía; el botón "En espera (1)" lista, retoma o descarta.
7. Cambiar vendedor: elegir usuario y PIN; la cabecera muestra "por PIN" y la venta queda a su nombre (crear un vendedor con PIN en `/configuracion/usuarios`).
8. `/ventas`: filtrar por fecha, estado, vendedor o método. En el detalle: "Nota de entrega PDF", "Compartir por WhatsApp" (abre `wa.me` con el enlace firmado), "Devolver" (elegir línea, cantidad, motivo, reembolso en efectivo COP → monto redondeado a 100) y "Anular" (solo admin, con motivo).
9. Cotizaciones: en el POS "Cotizar" → vigencia, notas, reservar stock → detalle con PDF/WhatsApp; "Convertir en venta" abre el POS con los precios cotizados (aunque el precio de lista haya cambiado); al cobrar la cotización pasa a "Convertida" y libera la reserva. `/cotizaciones/nueva` cotiza desde cero.
10. Celular: el POS apila búsqueda y carrito con barra inferior fija (total y Cobrar); el ticket se imprime desde el navegador con la impresora térmica configurada.

## 3. Pruebas

- `tests/sales.test.ts` (integración, 10 pruebas, se salta con `SKIP_DB_TESTS`): venta con pagos mixtos (USD + Pago Móvil en Bs) → stock, kardex con `balance_after` y costo, `sale_payments.amount_usd` y tasa, numeración consecutiva; cambio en COP redondeado a 100; venta incompleta rechazada; stock insuficiente con disponible; **concurrencia** (dos clientes `postgres` distintos vendiendo la última unidad: uno gana, un solo `sale_out`); descuento sobre el límite exige supervisor y guarda `discount_authorized_by`; anulación restaura stock y bloquea repetir; devolución parcial (reembolso COP a la tasa de la venta, `returned_qty`, `partially_refunded`) y total (`refunded`); venta en espera sin número ni stock que se reemplaza al completarse; cotización con reserva convertida al precio cotizado.
- Resultado: `pnpm test` 23 archivos / 133 pruebas en verde; `pnpm typecheck` y `pnpm lint` (0 errores; 2 avisos "Compilation Skipped" en `cash` y `customers`) en verde; `pnpm exec tsx scripts/smoke-sales.ts` en verde (carga tasas si faltan, abre caja si no hay, crea producto, venta, cotización y devolución y comprueba todas las pantallas, el ticket, los PDF y los endpoints).

## 4. Contratos para otros módulos

- **Caja** (ya alineado con `src/modules/cash/domain/summary.ts`): pagos = `sale_payments` ⋈ `sales` con `sales.cash_session_id` = sesión y `status <> 'voided'`; cambio entregado = `sales.change_currency_code` / `change_amount` (siempre efectivo USD o COP, redondeado al paso de caja; `change_usd` es el equivalente); reembolsos = `sale_returns` con `cash_session_id` de la caja abierta al devolver, `status = 'completed'`, `refund_method_id`, `refund_currency_code`, `refund_amount` (moneda del método, a la tasa guardada en la venta) y `refund_amount_usd`. Una anulación mantiene sus `sale_payments` (se excluyen por estado); anular una venta de una caja ya cerrada no ajusta ese cierre.
- **Reportes**: ingresos = `sales` con `status in ('completed','partially_refunded','refunded')` menos `sale_returns.total_usd`; margen con `sale_items.unit_cost_usd`; `sales.rate_ves/rate_cop` fijan los equivalentes históricos; kardex `sale_out` (`reference_type='sale'`), `sale_void_in` (`'sale'`) y `return_in` (`'sale_return'`, `reference_id` = `sale_returns.id`).
- **Clientes**: `sales.customer_id` y `quotes.customer_id`; el POS crea clientes con `createCustomer` del módulo de clientes.
- **Catálogo/Inventario**: se usan sin cambios `searchProducts`, `findProductByBarcode`, `getProductsForSale`, `lockStock`, `applyMovements`, `adjustReserved`. `stock_levels.reserved_qty` lo suben las cotizaciones con "Reservar stock" y lo liberan cancelar, vencer o convertir.

## 5. Pendientes y notas

- Devoluciones de la misma línea en varias veces: el importe se prorratea por cantidad y puede diferir en centavos del total de la línea.
- El vencimiento de cotizaciones se ejecuta al abrir `/cotizaciones` (no hay cron). Sin tasa del día las cotizaciones guardan tasa 0 y no muestran Bs.
- WhatsApp: se abre una pestaña en blanco durante el clic (evita el bloqueo de ventanas) y luego se redirige a `wa.me`; en desarrollo la URL firmada apunta a `APP_URL` local.
- Impresión automática: usa un marco oculto con `window.print()`; el navegador puede pedir confirmación. La cámara requiere HTTPS o `localhost`.
- El script de humo deja datos en la base de desarrollo (producto `SMK-*`, venta, cotización cancelada y devolución) y abre una caja si no había.
- Cambios sugeridos en archivos compartidos (no hechos): `can()`/`PERMISSIONS` de `src/lib/auth-guards.ts` importan `@/auth` (next-auth), que no carga en Vitest; `void-sale.ts` y `return-sale.ts` replican la regla localmente. Convendría mover `PERMISSIONS` a un archivo sin dependencia de next-auth. No se requieren cambios de esquema.
