# Prompt maestro — App profesional de control de inventario y ventas (POS)

> Copia de referencia del prompt entregado por el dueño el 2026-09-08 (reconstruida en UTF-8 a partir del archivo `prompt-app-inventario-y-ventas.md`). Para el alcance real del proyecto ver `01-contexto-y-alcance-mvp.md`.

**Cómo usarlo**

1. Reemplaza todos los valores entre corchetes `[ ... ]` con tus datos (nombre, país, moneda, impuesto, sucursales, stack preferido).
2. Pega el bloque completo (desde "PROMPT" hasta el final de la sección 15) en tu asistente de programación: Claude Code, Cursor, Windsurf, Lovable, Bolt, v0, etc.
3. Si la herramienta tiene límite de contexto, pega el prompt una sola vez como "especificación maestra" y luego pide los módulos de la sección 5 uno por uno con los prompts del anexo.
4. Borra los módulos que no apliquen a tu negocio (por ejemplo, números de serie si vendes alimentos, o tallas/colores si vendes ferretería). Todo lo que quede se toma como obligatorio.

---

## PROMPT

Actúa como un equipo senior formado por un arquitecto de software, un product manager con experiencia en retail y sistemas ERP/POS, un diseñador UX/UI y un ingeniero full-stack. Tu tarea es diseñar y construir una **aplicación profesional de control de inventario y ventas (punto de venta)** lista para producción, siguiendo al pie de la letra la especificación que aparece a continuación.

Reglas generales para ti:

- No omitas módulos ni simplifiques reglas de negocio. Si algo no cabe en una sola respuesta, divídelo en partes y avísame, pero nunca lo dejes "para después" sin decirlo.
- Si encuentras una ambigüedad que bloquea el avance, pregunta. Si no es bloqueante, toma la decisión más profesional, documéntala como supuesto y continúa.
- Prioriza la exactitud de los datos (stock, dinero, numeración de documentos) por encima de cualquier otra consideración.
- El código va en inglés; la interfaz, mensajes y documentación de usuario en español.

### 1. Contexto del negocio

- Nombre de la app / empresa: `[NOMBRE]`
- Tipo de negocio: `[ej. tienda de abarrotes, ferretería, farmacia, ropa y calzado, distribuidora mayorista, repuestos]`. Este dato define qué controles se activan por defecto (lotes y vencimientos, tallas/colores, números de serie, productos pesables).
- País, moneda e impuesto principal: `[PAÍS]`, `[MONEDA]`, `[IVA / IGV / ITBIS / etc. al X %]`
- Sucursales y almacenes iniciales: `[N sucursales, N almacenes]`
- Usuarios simultáneos estimados: `[N]`; productos: `[N]`; ventas por día: `[N]`
- Idioma principal: español, con i18n preparado para inglés.
- Plataforma: aplicación web responsive e instalable como PWA, optimizada para escritorio (administración), tablet (modo POS táctil) y móvil (consultas, conteos, ventas simples).

### 2. Stack tecnológico

Usa este stack por defecto salvo que yo indique otro en `[STACK PREFERIDO]`:

- **Frontend:** React con Next.js (App Router), TypeScript estricto, Tailwind CSS, shadcn/ui, TanStack Query para datos, TanStack Table para tablas, Zustand para estado del POS, Zod para validación compartida, Recharts para gráficos, react-hook-form para formularios.
- **Backend:** Node.js con TypeScript. Route Handlers / Server Actions de Next.js para el MVP, con la capa de dominio aislada de forma que pueda extraerse a NestJS como servicio independiente sin reescribir la lógica.
- **Base de datos:** PostgreSQL con Prisma (o Drizzle) y migraciones versionadas.
- **Autenticación:** Auth.js o implementación propia con JWT de corta vida + refresh tokens rotativos, PIN numérico para cambio rápido de cajero, TOTP para 2FA.
- **Infraestructura auxiliar:** Redis (caché, colas con BullMQ, rate limiting), almacenamiento S3-compatible (MinIO en local) para imágenes y PDFs, envío de correo transaccional vía proveedor SMTP/API configurable.
- **Documentos e impresión:** generación de PDF en servidor (Puppeteer o @react-pdf/renderer), impresión térmica ESC/POS 58/80 mm, códigos de barras con bwip-js o JsBarcode, lectura por cámara con html5-qrcode.
- **Offline:** Service Worker + IndexedDB (Dexie) con cola de sincronización.
- **Calidad y despliegue:** ESLint + Prettier, Vitest (unitarias e integración), Playwright (E2E), GitHub Actions, Docker y docker-compose (app, Postgres, Redis, MinIO).

Si estoy usando una herramienta low-code/no-code con backend integrado (Lovable, Bolt, v0), usa Supabase (Postgres, Auth, Storage, Row Level Security, Edge Functions) manteniendo exactamente el mismo modelo de datos y reglas de negocio de este documento.

### 3. Roles y permisos (RBAC granular)

Implementa roles predefinidos y un editor de permisos que permita crear roles personalizados. Cada permiso tiene alcance por sucursal.

| Rol | Alcance principal |
|---|---|
| Super administrador | Todo, incluida configuración de empresa, facturación, integraciones y usuarios. |
| Administrador de sucursal | Todo dentro de sus sucursales, excepto configuración global. |
| Gerente | Reportes, aprobaciones (descuentos, anulaciones, ajustes), compras, precios. |
| Vendedor / Cajero | POS, cotizaciones, clientes, consulta de stock, apertura/cierre de su caja. |
| Almacenista / Bodeguero | Entradas, salidas, transferencias, conteos, recepción de compras, etiquetas. |
| Comprador | Proveedores, órdenes de compra, cuentas por pagar. |
| Contador (solo lectura) | Reportes financieros, exportaciones, auditoría. |
| Auditor | Solo lectura de auditoría y reportes. |
| Integración (API key) | Alcances específicos por scope. |

Permisos mínimos a modelar: ver/crear/editar/eliminar por entidad, aplicar descuento hasta X %, anular ventas, autorizar ajustes, ver costos y márgenes, exportar datos, cambiar precios, abrir/cerrar caja ajena, reabrir caja, vender con stock negativo, vender bajo costo, gestionar usuarios, gestionar configuración.

### 4. Requisitos transversales

- Multi-sucursal y multi-almacén desde el diseño (aunque se inicie con uno).
- Multi-empresa (multi-tenant) opcional mediante `company_id` en todas las tablas de negocio, con aislamiento estricto.
- Todas las pantallas con estados de carga, vacío, error y sin resultados.
- Búsqueda global (Ctrl/Cmd + K) para productos, clientes, documentos y pantallas.
- Todas las listas con búsqueda, filtros, ordenamiento, paginación en servidor, selección múltiple y exportación.
- Historial y auditoría de toda entidad sensible.
- Soft delete en catálogos maestros; eliminación física solo sin movimientos asociados.
- Zona horaria de la empresa y formatos de fecha, número y moneda localizados.

### 5. Módulos funcionales

#### 5.1 Autenticación y seguridad

- Registro inicial con wizard: empresa → primera sucursal y almacén → impuestos → primer usuario administrador.
- Login con correo/usuario y contraseña; PIN de 4–6 dígitos para cambio rápido de cajero en el POS sin cerrar sesión.
- 2FA opcional (TOTP) con códigos de respaldo; recuperación de contraseña por correo con token de expiración; verificación de correo.
- Políticas de contraseña configurables, bloqueo temporal tras N intentos fallidos, expiración de sesión por inactividad configurable, listado de sesiones activas con opción de revocar.
- Invitación de usuarios por correo con rol y sucursales asignadas; activar, desactivar y reasignar usuarios.

#### 5.2 Dashboard

- KPIs con comparación contra el período anterior: ventas de hoy/semana/mes, número de transacciones, ticket promedio, unidades vendidas, margen bruto y utilidad estimada, valor total del inventario, cuentas por cobrar vencidas, cajas abiertas y su estado.
- Gráficos: ventas por día y por hora, top 10 productos y categorías, ventas por vendedor, por sucursal y por método de pago, evolución del margen.
- Alertas accionables: stock bajo (botón "crear orden de compra"), productos por vencer, cierres de caja con diferencia, cotizaciones por vencer, cobros vencidos.
- Filtros por rango de fechas y sucursal; widgets configurables según rol.

#### 5.3 Catálogo de productos

- **Campos:** SKU único (autogenerable con patrón configurable), uno o varios códigos de barras (EAN-13, UPC, Code 128, generación automática), nombre, descripción corta y larga, categoría y subcategoría en árbol, marca, proveedores asociados, unidad de medida base, unidades alternativas con factor de conversión (caja de 12 → unidad, kilo → gramo), impuesto aplicable, imágenes múltiples con orden, etiquetas, atributos personalizados, estado activo/inactivo.
- **Tipos de producto:** simple; con variantes (matriz de opciones como talla/color/material, cada variante con su SKU, código de barras, precio, costo y stock); compuesto o kit (descuenta componentes al venderse, costo = suma de componentes); servicio (sin stock); a granel/pesable (cantidades con decimales, lectura desde balanza o código de barras con peso embebido).
- **Precios:** múltiples listas de precio (público, mayorista, VIP, por sucursal, por canal), precios con y sin impuesto, precios escalonados por cantidad, margen sugerido a partir del costo, vigencias, historial de cambios con usuario y fecha.
- **Costos:** costo de última compra, costo promedio ponderado, costo estándar; método de valoración configurable (promedio ponderado por defecto, FIFO opcional); costos adicionales de compra prorrateados.
- **Control de stock:** mínimo, máximo, punto de reorden y cantidad de reorden por almacén; ubicación física (bodega / pasillo / estante / nivel); control por lotes con fecha de vencimiento; control por número de serie; días de vida útil.
- **Operaciones masivas:** importar y exportar CSV/Excel con plantilla descargable, validación previa, previsualización y reporte de errores por fila; edición masiva de precios por porcentaje o monto; duplicar producto; archivar; impresión de etiquetas con código de barras en formatos configurables (rollo, hoja A4 con cuadrícula).
- **Búsqueda:** instantánea por nombre, SKU, código de barras, categoría, marca, proveedor y etiqueta; filtros avanzados; columnas configurables.

#### 5.4 Inventario y almacenes

- Existencias por producto/variante y por almacén, con vista consolidada, stock disponible = físico − reservado, y stock en tránsito.
- **Tipos de movimiento:** entrada por compra, entrada manual, salida por venta, salida manual, ajuste positivo/negativo con motivo obligatorio (merma, robo, daño, vencimiento, error de conteo, muestra, consumo interno), transferencia entre almacenes con estados (solicitada → en tránsito → recibida parcial/total), devolución de cliente (reingreso), devolución a proveedor.
- **Kardex por producto:** fecha, tipo, documento origen con enlace, entrada, salida, saldo, costo unitario, costo total y usuario. Tabla append-only.
- **Conteo físico e inventario cíclico:** sesiones de conteo por almacén, categoría o ubicación; hoja de conteo imprimible y modo móvil con escáner; comparación teórico vs físico; generación de ajustes con un clic; opción de congelar movimientos durante el conteo; recuentos ciegos.
- **Reservas de stock:** apartado de unidades para cotizaciones y pedidos con vencimiento automático.
- **Alertas:** stock bajo, agotado, sobre stock, sin movimiento en N días, próximos a vencer (días configurables), vencidos.
- **Valoración:** valor del inventario en tiempo real y a fecha histórica, por almacén y categoría.
- **Trazabilidad:** por lote y número de serie, desde la compra de origen hasta la venta de destino.

#### 5.5 Compras y proveedores

- **Proveedores:** razón social, identificación fiscal, contactos múltiples, direcciones, condiciones de pago (contado, 15/30/60 días), tiempo de entrega, moneda, notas, documentos adjuntos, estado, calificación.
- **Catálogo por proveedor:** código del producto en el proveedor, último precio, historial de precios, unidad de compra.
- **Órdenes de compra:** creación manual o desde la sugerencia de reposición; estados borrador → enviada → parcialmente recibida → recibida → cerrada / cancelada; PDF y envío por correo al proveedor; costos adicionales (flete, aranceles, seguros) prorrateados al costo unitario.
- **Recepción de mercancía:** total o parcial contra la orden, con captura de lotes, vencimientos y series; actualización automática de stock y costo promedio; registro de diferencias (faltantes, sobrantes, dañados).
- **Devoluciones a proveedor** y notas de crédito de proveedor.
- **Sugerencia de reposición automática:** a partir de punto de reorden, venta promedio de los últimos N días, lead time del proveedor y stock en tránsito; agrupada por proveedor para generar órdenes en un paso.
- **Cuentas por pagar:** facturas de proveedor, vencimientos, pagos parciales, calendario de pagos, saldo por proveedor.

#### 5.6 Ventas y punto de venta (POS)

- **Pantalla POS de alta velocidad**, táctil y por teclado: búsqueda por nombre/SKU/código de barras, escáner USB (modo teclado) y cámara, cuadrícula de productos favoritos por categoría, carrito con cantidad, precio, descuento y nota por línea, indicador de stock disponible en cada línea.
- **Cliente:** venta rápida a consumidor final o cliente registrado; crear o editar cliente desde el POS; aplicar su lista de precios y crédito.
- **Descuentos:** por línea o globales, porcentaje o monto; límite por rol con autorización mediante PIN de supervisor registrada en auditoría.
- **Promociones:** precio especial por fechas, NxM (2x1, 3x2), combos, descuento por volumen, cupones con código, vigencia y límite de usos; aplicación automática y manual.
- **Impuestos:** por producto, incluidos o excluidos del precio según configuración; exenciones por cliente; múltiples impuestos por línea.
- **Pagos:** efectivo con cálculo de cambio y desglose por denominación, tarjeta (con referencia y últimos 4 dígitos), transferencia, billetera digital, crédito del cliente, notas de crédito, puntos de fidelización; pagos mixtos; redondeo configurable; propina opcional.
- **Flujo comercial:** cotización → pedido (con reserva de stock) → venta; venta directa; ventas en espera recuperables desde cualquier caja de la sucursal; venta con entrega a domicilio y datos de envío.
- **Post-venta:** devoluciones totales o parciales con motivo, reingreso a stock opcional y emisión de nota de crédito; cambio de producto; anulación de venta solo con permiso, motivo y dentro de una ventana de tiempo configurable, revirtiendo stock, caja y cuentas por cobrar.
- **Comprobantes:** ticket térmico 58/80 mm, factura A4/carta en PDF, envío por correo y WhatsApp, reimpresión registrada en auditoría.
- **Modo offline (PWA):** vender sin conexión, encolar ventas y sincronizar al reconectar, con detección y resolución de conflictos de stock y numeración.
- **Productividad:** atajos de teclado (cobrar, buscar, cliente, descuento, suspender, cantidad), apertura de gaveta de dinero, sonidos opcionales, modo pantalla completa.
- **Comisiones** por vendedor configurables por porcentaje, producto o categoría.

#### 5.7 Clientes y fidelización

- **Ficha:** persona o empresa, tipo y número de documento, nombre/razón social, correo, teléfonos, direcciones múltiples, fecha de nacimiento, lista de precios asignada, límite y días de crédito, saldo actual, segmento y etiquetas, notas, documentos adjuntos.
- **Historial:** compras, devoluciones, pagos, cotizaciones, productos frecuentes y estadísticas (frecuencia, ticket promedio, última compra, valor de vida).
- **Fidelización:** puntos por compra con reglas configurables, canje en el POS, niveles de cliente.
- Estado de cuenta descargable y enviable; recordatorios de cobro.
- Importación masiva con detección de duplicados por documento, correo o teléfono.

#### 5.8 Caja y turnos

- Múltiples cajas por sucursal; apertura con fondo inicial; asignación de cajero y turno.
- Movimientos de caja: ingresos y retiros con motivo y autorización.
- **Cierre de caja:** arqueo ciego (el cajero cuenta sin ver el esperado), desglose por método de pago y por denominación, diferencias con justificación obligatoria, reporte de cierre imprimible (corte X parcial y Z final), reapertura solo por administrador con motivo.
- Historial de sesiones con auditoría completa e indicador de sesiones abiertas por más de N horas.

#### 5.9 Facturación y comprobantes

- Series y numeración consecutiva por tipo de documento y sucursal, sin huecos ni duplicados, incluso bajo concurrencia.
- Tipos de documento: ticket/recibo, factura, nota de crédito, nota de débito, cotización, pedido, orden de compra, guía de remisión/traslado, comprobante de pago.
- Plantillas personalizables (logo, datos fiscales, leyendas legales, campos opcionales, idioma) con vista previa en vivo.
- Módulo de **facturación electrónica desacoplado** (patrón adaptador) para integrarse con la autoridad tributaria de `[PAÍS]` (`[ej. DIAN, SAT, SUNAT, AFIP, SII]`) o con un proveedor autorizado; manejo de estados (pendiente, enviada, aceptada, rechazada), reintentos con backoff, almacenamiento de XML, PDF y folio/CUFE, y contingencia cuando el servicio externo no responde.

#### 5.10 Finanzas: cuentas por cobrar, cuentas por pagar y gastos

- **Cuentas por cobrar:** ventas a crédito, abonos parciales, antigüedad de saldos (0–30, 31–60, 61–90, +90 días), recordatorios automáticos, bloqueo configurable de ventas a clientes morosos o que exceden su límite.
- **Cuentas por pagar:** facturas de proveedores, programación de pagos, pagos parciales, saldo por proveedor.
- **Gastos:** registro con categoría, sucursal, fecha, método de pago, comprobante adjunto, gastos recurrentes.
- **Flujo de caja** por período y sucursal; **estado de resultados simplificado**: ventas − devoluciones − costo de ventas − gastos = utilidad.

#### 5.11 Reportes y analítica

- **Ventas:** por período, día y hora, producto, variante, categoría, marca, vendedor, cajero, sucursal, cliente, método de pago y canal; comparativos período contra período; descuentos otorgados; ventas anuladas y devoluciones; impuestos recaudados; comisiones.
- **Inventario:** existencias y valorización, rotación, análisis ABC, productos sin movimiento, stock bajo con sugerencias de compra, kardex, mermas y ajustes, vencimientos, transferencias, diferencias de conteo.
- **Compras:** por proveedor, producto y período; cumplimiento de entregas; variación de costos.
- **Rentabilidad:** margen por producto, categoría, sucursal y vendedor; utilidad bruta y neta.
- **Caja:** cierres, diferencias, movimientos por cajero.
- **Clientes:** top clientes, frecuencia, cartera vencida.
- **Funciones comunes:** filtros avanzados, agrupación, gráficos, vistas guardadas, exportación a PDF/Excel/CSV, envío programado por correo (diario, semanal, mensual), permisos por reporte.

#### 5.12 Notificaciones y alertas

- Centro de notificaciones en la app, correo, push (PWA) y WhatsApp opcional vía API.
- Eventos: stock bajo y agotado, próximos a vencer, orden de compra recibida, cierre de caja con diferencia, cuenta por cobrar vencida, venta anulada, cambio masivo de precios, error de sincronización o de facturación electrónica, nuevo pedido desde canal externo.
- Preferencias por usuario y por rol; resumen diario configurable.

#### 5.13 Configuración

- Empresa: datos fiscales, logo, zona horaria, formatos de fecha, número y moneda.
- Sucursales, almacenes, cajas, impresoras (tamaño, prueba de impresión) y dispositivos.
- Impuestos (múltiples, compuestos), monedas y tipos de cambio (multi-moneda opcional), listas de precios, series de documentos, métodos de pago (comisión, referencia obligatoria, apertura de gaveta), motivos de ajuste/devolución/anulación, categorías de gastos, unidades de medida.
- Políticas: permitir stock negativo, descuento máximo por rol, ventana de anulación, arqueo ciego, redondeo, decimales por unidad, cliente obligatorio en ventas a crédito, vencimiento de cotizaciones y reservas.
- Personalización de plantillas de comprobantes y etiquetas.
- Respaldos, exportación completa de datos, retención de logs.

#### 5.14 Auditoría

- Registro inmutable: quién, cuándo, desde dónde (IP y dispositivo), qué acción y valores antes/después, para productos, precios, stock, ventas, anulaciones, descuentos autorizados, usuarios y permisos, configuración y cajas.
- Buscador con filtros por usuario, entidad, acción y fecha; exportación; retención configurable.

#### 5.15 Integraciones y API pública

- API REST documentada con OpenAPI, API keys por empresa con scopes, rate limiting y webhooks firmados (`sale.created`, `stock.low`, `product.updated`, `purchase.received`, `customer.created`, entre otros) con reintentos y registro de entregas.
- Arquitectura de conectores para: e-commerce (Shopify, WooCommerce, Mercado Libre) con sincronización de catálogo, stock y pedidos; pasarelas de pago; exportación contable; balanzas y lectores; impresoras térmicas ESC/POS y gavetas.

#### 5.16 Importación, exportación y respaldos

- Plantillas para productos, variantes, clientes, proveedores, stock inicial y precios; validación, previsualización y opción de deshacer una importación.
- Exportación total en CSV/JSON; respaldos automáticos programados y restauración probada.

#### 5.17 Onboarding y ayuda

- Wizard inicial, datos de demostración opcionales (borrables en un clic), tours guiados por pantalla, tooltips, centro de ayuda y hoja de atajos de teclado.

### 6. Reglas de negocio críticas

1. Toda operación que afecte stock, caja o numeración de documentos se ejecuta en una transacción atómica con bloqueo optimista o pesimista para impedir sobreventa concurrente (dos cajas vendiendo la última unidad).
2. No se permite stock negativo salvo que la política lo habilite y el usuario tenga permiso; en ese caso siempre se genera alerta.
3. El costo promedio ponderado se recalcula en cada entrada valorizada; las salidas usan el costo vigente en ese momento (o FIFO por lote si está configurado). Cada línea de venta guarda el costo unitario del momento para calcular el margen histórico sin recálculos.
4. Los lotes se consumen por vencimiento más cercano (FEFO) por defecto, con posibilidad de elección manual.
5. Las ventas completadas son inmutables: cualquier corrección se hace mediante devolución, nota de crédito o anulación autorizada, que revierten stock, caja y cuentas por cobrar.
6. La numeración por serie es consecutiva, sin huecos ni duplicados, también en modo offline (numeración provisional por dispositivo que se reconcilia al sincronizar).
7. Descuentos por encima del umbral del rol requieren autorización con PIN de supervisor y quedan en auditoría.
8. Vender por debajo del costo muestra advertencia y requiere permiso.
9. No se puede abrir un turno si la caja ya tiene uno abierto; no se puede cerrar el día con cajas abiertas (configurable).
10. Los cálculos monetarios usan decimales exactos (nunca punto flotante), con reglas de redondeo definidas por línea y por total, e impuestos calculados según la configuración de precio con/sin impuesto.
11. Soft delete para entidades maestras referenciadas; eliminación física solo si no tienen movimientos.
12. Todo cambio en entidades sensibles genera un registro de auditoría con valores antes/después.
13. Los kits descuentan sus componentes al venderse; su stock disponible es el mínimo posible según los componentes.
14. Las reservas de stock vencen automáticamente y liberan existencias.
15. Los usuarios solo ven datos de sus sucursales asignadas, salvo roles globales.
16. Los precios que se muestran en el POS siempre provienen de la lista de precios activa del cliente/sucursal, nunca de un valor escrito a mano sin permiso.

### 7. Modelo de datos

Diseña el esquema con claves UUID, campos `created_at / updated_at / deleted_at`, `company_id` en todas las tablas de negocio, montos en `DECIMAL(18,4)`, cantidades en `DECIMAL(18,3)`, índices en búsquedas frecuentes (SKU, código de barras, nombre con búsqueda trigram, fechas y claves foráneas), restricciones de integridad y diagrama ER en Mermaid.

**Organización y seguridad**
- `companies` (name, tax_id, address, phone, email, logo_url, timezone, currency, settings JSON)
- `branches` (company_id, name, code, address, is_active)
- `warehouses` (branch_id, name, code, type: principal / tránsito / devoluciones, is_active)
- `users` (company_id, name, email, password_hash, pin_hash, phone, is_active, last_login_at, mfa_secret)
- `roles`, `permissions`, `role_permissions`, `user_roles`, `user_branches`
- `refresh_tokens`, `password_resets`, `invitations`

**Catálogo**
- `categories` (parent_id, name, slug, sort_order), `brands`, `units` (name, symbol, decimals), `unit_conversions` (from_unit_id, to_unit_id, factor), `taxes` (name, rate, type, is_compound)
- `products` (sku, name, description, type: simple / variant / kit / service / bulk, category_id, brand_id, unit_id, tax_id, cost_method, track_lots, track_serials, shelf_life_days, attributes JSON, is_active)
- `product_variants` (product_id, sku, name, option_values JSON, cost_avg, cost_last, cost_standard, weight, is_active)
- `product_barcodes` (variant_id, code, type, unit_id, is_primary)
- `product_images`, `product_suppliers` (variant_id, supplier_id, supplier_code, last_cost, lead_time_days)
- `kit_components` (kit_variant_id, component_variant_id, quantity)
- `price_lists` (name, currency, branch_id nullable, is_default), `price_list_items` (price_list_id, variant_id, price, min_qty, tax_included, valid_from, valid_to)
- `price_history` (variant_id, price_list_id, old_price, new_price, user_id)
- `stock_settings` (variant_id, warehouse_id, min_stock, max_stock, reorder_point, reorder_qty, location_code)

**Inventario**
- `stock_levels` (variant_id, warehouse_id, quantity, reserved_qty) con índice único (variant_id, warehouse_id)
- `inventory_movements` (variant_id, warehouse_id, type, quantity con signo, unit_cost, total_cost, balance_after, reference_type, reference_id, lot_id, serial_id, reason_id, user_id, notes) — append-only
- `inventory_adjustments` + `inventory_adjustment_items` (reason_id, approved_by)
- `stock_transfers` + `stock_transfer_items` (from_warehouse_id, to_warehouse_id, status, shipped_at, received_at, qty_sent, qty_received)
- `stock_counts` + `stock_count_items` (expected_qty, counted_qty, difference, counted_by)
- `lots` (variant_id, warehouse_id, lot_number, expiry_date, quantity, goods_receipt_id)
- `serial_numbers` (variant_id, warehouse_id, serial, status: disponible / vendido / devuelto / defectuoso, sale_item_id)
- `stock_reservations` (variant_id, warehouse_id, quantity, reference_type, reference_id, expires_at)
- `adjustment_reasons`

**Compras**
- `suppliers` (name, tax_id, contacts JSON, address, payment_terms_days, currency, lead_time_days, is_active)
- `purchase_orders` (number, supplier_id, warehouse_id, status, order_date, expected_date, subtotal, tax_total, extra_costs, total, currency, exchange_rate, notes, created_by)
- `purchase_order_items` (variant_id, qty_ordered, qty_received, unit_cost, tax_id, discount)
- `goods_receipts` + `goods_receipt_items` (qty_received, lot_number, expiry_date, serials JSON, unit_cost_final)
- `supplier_returns` + items, `payables` (supplier_id, invoice_number, due_date, amount, balance, status), `payable_payments`

**Ventas y clientes**
- `customers` (type, doc_type, doc_number, name, email, phones JSON, addresses JSON, birth_date, price_list_id, credit_limit, credit_days, balance, tags, loyalty_points, is_active)
- `quotes` + `quote_items` (valid_until, status), `sales_orders` + items (status, reservation_id)
- `sales` (number, series_id, branch_id, warehouse_id, cash_session_id, customer_id, seller_id, status: draft / held / completed / voided / refunded, sale_date, subtotal, discount_total, tax_total, total, paid_total, change_amount, currency, exchange_rate, notes, void_reason, voided_by, voided_at, channel, offline_uuid)
- `sale_items` (variant_id, description, quantity, unit_price, unit_cost, discount_type, discount_value, tax_id, tax_amount, line_total, lot_id, serial_id, promotion_id)
- `sale_payments` (sale_id, payment_method_id, amount, reference, card_last4, received_amount)
- `sale_returns` + `sale_return_items` (restock boolean, reason_id, credit_note_id), `credit_notes`, `debit_notes`
- `promotions` (type, rules JSON, valid_from, valid_to, branch_ids, is_active), `coupons` (code, discount_type, value, usage_limit, used_count, valid_to)
- `loyalty_transactions`, `commission_rules`, `commissions`

**Caja**
- `payment_methods` (name, type, fee_percent, requires_reference, opens_drawer, is_active)
- `cash_registers` (branch_id, name, printer_config JSON)
- `cash_sessions` (register_id, user_id, opened_at, opening_amount, closed_at, expected_amount, counted_amount, difference, status, closing_notes, closed_by, reopened_by)
- `cash_movements` (session_id, type: ingreso / retiro, amount, reason, authorized_by)
- `cash_count_details` (session_id, denomination, count)

**Documentos y finanzas**
- `document_series` (branch_id, document_type, prefix, next_number, resolution_data JSON)
- `electronic_invoices` (sale_id, status, external_id, xml_url, pdf_url, response JSON, attempts, last_error)
- `expenses` (category_id, branch_id, amount, date, payment_method_id, attachment_url, is_recurring), `expense_categories`
- `receivables` (customer_id, sale_id, due_date, amount, balance, status), `receivable_payments`

**Sistema**
- `audit_logs` (user_id, action, entity_type, entity_id, before JSON, after JSON, ip, user_agent)
- `notifications` (user_id, type, title, body, data JSON, channel, read_at), `notification_preferences`
- `settings` (company_id, key, value JSON)
- `api_keys` (name, hashed_key, scopes, last_used_at), `webhooks` (url, events, secret, is_active), `webhook_deliveries`
- `import_jobs` (type, file_url, status, total_rows, error_rows, errors JSON), `export_jobs`
- `integrations` (provider, config JSON cifrado, status), `sync_queue` (device_id, payload, status, conflict_info)

### 8. Requisitos no funcionales

- **Seguridad:** OWASP Top 10, hashing con Argon2 o bcrypt, JWT de corta vida con refresh rotativo, protección CSRF, rate limiting, validación en servidor con Zod en todos los endpoints, sanitización de entradas, cabeceras de seguridad, aislamiento multi-tenant (RLS si aplica), cifrado de datos sensibles en reposo, secretos solo en variables de entorno, dependencias auditadas.
- **Rendimiento:** paginación en servidor, índices, búsqueda con debounce, listas virtualizadas, caché en Redis para catálogos; operaciones locales del POS en menos de 200 ms y carga inicial en menos de 3 s en conexión 4G.
- **Escalabilidad y disponibilidad:** servicios sin estado, colas para tareas pesadas (reportes, correos, sincronizaciones, PDFs), health checks, respaldos automáticos diarios con restauración probada.
- **Offline:** service worker, IndexedDB, cola de sincronización con resolución de conflictos e indicador visible de estado de conexión.
- **Observabilidad:** logs estructurados con correlación por petición, métricas, trazas y captura de errores de frontend y backend.
- **Calidad:** TypeScript estricto, linters, cobertura mínima del 80 % en la capa de dominio, CI que bloquea merges con tests rotos.
- **i18n y l10n**, accesibilidad WCAG 2.1 AA, diseño responsive, manejo correcto de zonas horarias.
- **Privacidad y cumplimiento:** ley de protección de datos personales de `[PAÍS]`, exportación y eliminación de datos de un cliente a petición, retención configurable.

### 9. UX/UI

- Diseño limpio, profesional y consistente, basado en un sistema de diseño con tokens; modo claro y oscuro; sidebar colapsable; breadcrumbs; búsqueda global.
- Tablas potentes: búsqueda, filtros, ordenamiento, paginación, selección múltiple con acciones masivas, columnas configurables, densidad ajustable, exportación.
- Formularios con validación inline, autoguardado de borradores, campos dependientes y mensajes de error claros y accionables.
- POS a pantalla completa con layout táctil para tablet: botones grandes, teclado numérico en pantalla, confirmaciones mínimas, feedback inmediato, tiempo de cobro menor a 10 segundos con escáner.
- Confirmación para acciones destructivas, "deshacer" cuando sea posible, toasts, skeletons de carga y estados vacíos con guía de siguiente paso.
- Vistas de impresión optimizadas y PDFs con diseño profesional.
- Vista móvil enfocada en consulta de stock, conteos con cámara, recepción de mercancía y ventas simples.

### 10. API

- REST JSON versionada en `/api/v1`, autenticación Bearer, errores estandarizados (código, mensaje, detalles por campo), paginación por cursor u offset, filtros y ordenamiento por query params, claves de idempotencia para crear ventas y pagos, documentación OpenAPI con ejemplos de petición y respuesta.
- Recursos mínimos: auth, users, roles, branches, warehouses, products, variants, categories, brands, units, taxes, price-lists, inventory (stock, movements, adjustments, transfers, counts, reservations), lots, serials, suppliers, purchase-orders, goods-receipts, customers, quotes, orders, sales, returns, payments, cash-registers, cash-sessions, document-series, expenses, receivables, payables, promotions, coupons, reports, notifications, settings, audit-logs, api-keys, webhooks, imports, exports.

### 11. Pruebas y calidad

- Unitarias de dominio: costo promedio ponderado, FEFO, impuestos incluidos/excluidos, redondeos, descuentos y promociones, numeración de documentos, conversión de unidades, kits.
- Integración de API por módulo y tests de contrato de la API pública.
- E2E de flujos críticos: venta completa con pago mixto, devolución parcial, anulación, compra y recepción parcial, transferencia, conteo con ajuste, cierre de caja con diferencia, venta offline y sincronización.
- Tests de concurrencia para sobreventa y numeración; tests de permisos por rol.
- Datos de prueba realistas (seed) y fixtures reutilizables.

### 12. Entregables

1. Documento de arquitectura: diagrama de componentes, decisiones (ADRs), estructura de carpetas explicada.
2. Esquema de base de datos con migraciones y diagrama ER en Mermaid.
3. Código backend y frontend completo, tipado, organizado por módulos de dominio.
4. Seed con datos de demostración coherentes (empresa, sucursales, productos con variantes y lotes, clientes, proveedores, ventas de 90 días).
5. Suite de tests con instrucciones para ejecutarla.
6. Documentación: README (instalación, ejecución, despliegue), OpenAPI, manual de usuario básico por rol, guía de configuración de impresoras y escáner.
7. docker-compose (app, Postgres, Redis, MinIO), `.env.example` comentado, pipeline de CI.
8. Checklist de seguridad y de puesta en producción.

### 13. Plan de fases

- **Fase 1 — MVP operativo:** autenticación y roles; empresa, sucursal y almacén; catálogo básico con códigos de barras; inventario con entradas, salidas, ajustes y kardex; POS con efectivo y tarjeta; tickets; clientes básicos; apertura y cierre de caja; dashboard y reportes básicos.
- **Fase 2 — Operación completa:** compras, proveedores, recepción y costos; transferencias y conteos; lotes, vencimientos y series; variantes y kits; listas de precios, descuentos y promociones; devoluciones y notas de crédito; cuentas por cobrar y pagar; gastos; reportes avanzados; auditoría; importación y exportación.
- **Fase 3 — Escala e integraciones:** facturación electrónica; modo offline; notificaciones multicanal; API pública y webhooks; conectores de e-commerce; fidelización; multi-moneda; multi-empresa.
- **Fase 4 — Optimización:** pronóstico de demanda y reposición inteligente, detección de anomalías (mermas inusuales, descuentos sospechosos), app móvil nativa, marketplace de conectores.

### 14. Forma de trabajo

- Antes de escribir código entrega, en este orden: (a) lista de supuestos, (b) arquitectura, (c) modelo de datos completo, (d) inventario de pantallas y navegación. Continúa sin esperar confirmación salvo que exista una ambigüedad bloqueante.
- Trabaja por fases y, dentro de cada fase, módulo por módulo. Al terminar cada módulo entrega: archivos creados o modificados, cómo probarlo manualmente, tests incluidos y pendientes conocidos.
- Código limpio: separación dominio / aplicación / infraestructura, principios SOLID, manejo de errores explícito, comentarios solo donde haya reglas de negocio no evidentes, sin TODOs sin explicación.
- No inventes librerías, APIs ni versiones. Si algo no está disponible, propón una alternativa real.
- Diseña siempre para los casos límite: se corta la luz a mitad de una venta, dos cajas venden la última unidad, importación de 10.000 filas, cliente sin identificación, producto pesable con decimales, devolución parcial de un kit, cambio de precio con ventas en espera abiertas, reloj del dispositivo desfasado en modo offline.
- Ante la duda entre simplicidad y completitud, elige completitud manteniendo el código mantenible.
- Al final de cada fase ejecuta la suite de tests, muestra el resultado y corrige antes de continuar.

### 15. Criterios de aceptación (Definition of Done)

- Todos los módulos de la sección 5 implementados, navegables y con permisos aplicados.
- Todas las reglas de la sección 6 verificadas con tests automáticos.
- Una venta completa con escáner se cobra en menos de 10 segundos.
- Los reportes cuadran entre sí: ventas − devoluciones = ingresos; el kardex cuadra con las existencias; el cierre de caja cuadra con los pagos registrados.
- Sin errores en consola, sin problemas críticos de accesibilidad, Lighthouse ≥ 90 en rendimiento, accesibilidad y buenas prácticas.
- Documentación suficiente para que otro desarrollador despliegue en producción en menos de una hora.

**Comienza ahora con la Fase 1, entregando primero los puntos (a) a (d) de la sección 14.**

---

## Anexo — Prompts de seguimiento

Úsalos después de haber pegado la especificación maestra, uno por mensaje:

- "Implementa el módulo 5.3 (Catálogo de productos) completo según la especificación maestra, incluyendo variantes, kits, listas de precios y la importación por CSV. Entrega migraciones, API, pantallas y tests."
- "Implementa el módulo 5.6 (POS) con todos los métodos de pago, descuentos con autorización por PIN, ventas en espera y ticket térmico. Respeta las reglas 1, 2, 7, 8 y 10 de la sección 6."
- "Genera las migraciones y el diagrama ER en Mermaid para todas las entidades de la sección 7."
- "Escribe los tests E2E con Playwright para: venta con pago mixto, devolución parcial y cierre de caja con diferencia."
- "Implementa el modo offline del POS (sección 5.6) con cola de sincronización y reconciliación de numeración según la regla 6."
- "Revisa todo el código del módulo de inventario contra las reglas de la sección 6 y la sección 8 (seguridad) y corrige lo que falte."
- "Genera el README, el `.env.example` comentado y la guía de despliegue con docker-compose."
