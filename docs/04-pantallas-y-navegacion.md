# La Principal 2050 — Pantallas y navegación (Fase 1)

Fecha: 2026-09-08. Principio rector: cada pantalla se entiende sin manual. Lo avanzado se esconde detrás de "Más opciones".

---

## 1. Navegación

**Escritorio:** barra lateral colapsable con Inicio, Vender, Ventas, Productos, Inventario, Compras, Clientes, Caja, Reportes, Configuración. Arriba: buscador global (Ctrl+K), tasa del día, vendedor activo, estado de caja.

**Celular y tablet:** barra inferior con Inicio, Vender, Productos, Inventario y Más. "Vender" abre el POS a pantalla completa. El registro de productos con cámara está pensado para el celular.

**Roles:** Administrador ve todo. Vendedor ve Inicio, Vender, Ventas, Productos (solo consulta), Clientes y Caja. Almacén ve Inicio, Productos, Inventario y Compras.

---

## 2. Inventario de pantallas

| # | Ruta | Pantalla | Qué hace | Roles |
|---|---|---|---|---|
| 1 | `/login` | Iniciar sesión | Correo y contraseña. Enlace de recuperación. | Todos |
| 2 | (diálogo) | Cambiar vendedor | Elegir usuario y PIN de 4 dígitos. Disponible desde el POS y la barra superior. | Vendedor, Admin |
| 3 | `/inicio` | Inicio | Ventas de hoy y del mes en USD con equivalentes, transacciones, ticket promedio, productos por comprar, alertas, estado de caja, tasa del día editable. | Todos (según rol) |
| 4 | `/vender` | Punto de venta | Buscar o escanear, carrito, cantidades, descuentos, cliente, ventas en espera, cobrar. | Vendedor, Admin |
| 5 | (diálogo) | Cobrar | Total en USD, Bs y COP; agregar pagos por método y moneda; saldo pendiente; cambio en USD o COP; imprimir o compartir. | Vendedor, Admin |
| 6 | `/ventas` | Ventas | Lista con filtros por fecha, vendedor, cliente, método y estado. | Vendedor, Admin |
| 7 | `/ventas/[id]` | Detalle de venta | Líneas, pagos, tasas usadas, reimprimir, devolver, anular. | Vendedor, Admin |
| 8 | `/ventas/[id]/devolver` | Devolución | Elegir líneas y cantidades, motivo, reingreso a stock, forma de reembolso. | Admin, Vendedor con permiso |
| 9 | `/cotizaciones` y `/cotizaciones/[id]` | Cotizaciones | Crear desde el POS o desde cero, vigencia, PDF por WhatsApp, convertir a venta. | Vendedor, Admin |
| 10 | `/productos` | Productos | Lista con búsqueda por nombre, parte, equivalencia, modelo o código; filtros; estado de stock; acciones masivas. | Todos |
| 11 | `/productos/nuevo` y `/productos/[id]/editar` | Ficha de producto | Formulario en pasos: foto con IA → datos básicos → compatibilidades y equivalencias → precios y costo → stock y ubicación. Campos avanzados ocultos. | Admin, Almacén |
| 12 | `/productos/[id]` | Detalle de producto | Fotos, stock, precios en tres monedas, kardex, velocidad y semáforo, proveedores, historial de precios. | Todos |
| 13 | `/productos/etiquetas` | Etiquetas | Seleccionar productos y cantidades; imprimir en rollo o A4. | Admin, Almacén |
| 14 | `/productos/importar` | Importar | Descargar plantilla, subir Excel, ver errores por fila, aplicar, deshacer. | Admin |
| 15 | `/productos/categorias` | Categorías y marcas | Árbol de categorías y lista de marcas. | Admin, Almacén |
| 16 | `/inventario` | Existencias | Stock, disponible, mínimo, máximo, cobertura y semáforo; filtros; valorización total. | Todos |
| 17 | `/inventario/movimientos` | Kardex | Movimientos por producto, tipo, fecha y usuario, con enlace al documento. | Todos |
| 18 | `/inventario/ajustes/nuevo` | Ajuste | Motivo obligatorio, productos y cantidades, aplicar. | Admin, Almacén |
| 19 | `/inventario/conteos` y `/inventario/conteos/[id]` | Conteo físico | Crear conteo por categoría o ubicación; contar desde el celular con cámara; ver diferencias; aplicar ajustes. | Admin, Almacén |
| 20 | `/inventario/alertas` | Alertas | Stock bajo, agotado, sin movimiento, exceso; acción "agregar a compra". | Todos |
| 21 | `/compras/proveedores` y `/compras/proveedores/[id]` | Proveedores | Ficha, productos que surte, historial de costos. | Admin, Almacén |
| 22 | `/compras/entradas` y `/compras/entradas/nueva` | Entradas por compra | Documento del proveedor, moneda y tasa, productos, costos, gastos adicionales; aplicar. | Admin, Almacén |
| 23 | `/compras/que-comprar` | Qué comprar | Sugerencia agrupada por proveedor con cantidades editables; exportar a Excel. | Admin, Almacén |
| 24 | `/clientes` y `/clientes/[id]` | Clientes | Lista, ficha simple, historial. Alta rápida desde el POS. | Vendedor, Admin |
| 25 | `/caja` | Caja | Abrir con fondo USD y COP; sesión actual con totales por método; ingresos y retiros. | Vendedor, Admin |
| 26 | `/caja/cerrar` | Cierre de caja | Conteo ciego por moneda, referencias electrónicas, diferencias con justificación, reporte imprimible. | Vendedor, Admin |
| 27 | `/caja/historial` | Historial de cajas | Sesiones anteriores y sus cierres. | Admin |
| 28 | `/reportes` | Reportes | Ventas, inventario valorizado, velocidad y ABC, margen, sin movimiento, qué comprar; filtros; gráficos; exportar. | Admin |
| 29 | `/configuracion` | Configuración | Empresa, tasas de cambio, impuestos, métodos de pago, motivos, unidades, series, impresión, usuarios y PIN, políticas, respaldos. | Admin |
| 30 | `/imprimir/ticket/[id]` | Ticket | Vista de impresión 58/80 mm con montos en USD y Bs. | Vendedor, Admin |

---

## 3. Flujos clave

**Registrar un producto desde el celular (menos de un minuto):**
1. Productos → botón grande "Nuevo producto".
2. Tomar foto. La app la sube y empieza el recorte en segundo plano.
3. Escribir nombre y número de parte; elegir categoría; escanear el código de barras del fabricante o dejar que la app genere uno.
4. Precio Público en USD; el precio Técnico se sugiere con un porcentaje configurable y se puede editar. Costo si se conoce.
5. Stock inicial y ubicación en estante.
6. Vista previa de la foto: aceptar o conservar original. Guardar. Botón "Guardar y crear otro".

**Vender en mostrador (menos de 10 segundos con escáner):**
1. Escanear o escribir; la línea entra con precio de la lista del cliente.
2. Ajustar cantidad si hace falta. Cliente opcional.
3. Cobrar: elegir método y moneda, escribir monto; si falta, agregar otro pago. La app muestra el cambio en USD o COP.
4. Imprimir ticket o compartir nota de entrega por WhatsApp.

**Saber qué comprar:**
1. Compras → Qué comprar. Lista por proveedor con semáforo, cobertura en días y cantidad sugerida.
2. Ajustar cantidades y exportar a Excel para enviar al proveedor.
3. Cuando llega la mercancía: Compras → Nueva entrada, con el documento del proveedor. Stock y costo se actualizan.

**Cerrar el día:**
1. Caja → Cerrar. Contar efectivo USD y COP sin ver el esperado.
2. Revisar referencias de Pago Móvil, Punto de venta, Zelle y Binance.
3. Justificar diferencias si las hay. Imprimir cierre.

---

## 4. Estados que toda pantalla debe cubrir

Cargando (esqueletos), vacío con guía del siguiente paso, error con reintento, sin resultados de búsqueda, sin conexión con aviso claro.

---

## 5. Diseño visual

- Sistema de diseño con tokens de shadcn/ui; modo claro por defecto y oscuro opcional.
- Tipografía legible a distancia en el POS; botones de al menos 44 px en tablet y celular.
- Montos siempre con moneda visible: `$ 12,50`, `Bs 1.234,56`, `COP 52.000`. Formato es-VE.
- Semáforos de stock con color y texto, nunca solo color.
- Confirmación para acciones destructivas; "deshacer" en importaciones y en quitar líneas del carrito.
