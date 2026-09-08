# La Principal 2050 — Contexto y alcance del MVP

**Estado:** decisiones confirmadas por el dueño el 2026-09-08. Este documento manda sobre el prompt maestro.
**Referencia completa:** `docs/00-prompt-maestro.md`. Documentos derivados: `02-arquitectura.md`, `03-modelo-de-datos.md`, `04-pantallas-y-navegacion.md`.

---

## 1. Contexto del negocio

| Dato | Valor |
|---|---|
| Nombre provisional | La Principal 2050 |
| Giro | Venta de repuestos de electrodomésticos y refrigeración, venta en mostrador |
| País | Venezuela |
| Monedas | Dólares (USD, base), Bolívares (VES / Bs) y Pesos colombianos (COP) |
| Sucursales / almacenes | 1 sucursal, 1 almacén (el mismo local) |
| Usuarios simultáneos | 2 o 3 |
| Productos | Muchos; la lista aún no existe, se cargará en la app o por Excel |
| Ventas por día | Desconocidas (negocio nuevo) |
| Clientes | Público general y técnicos; sin crédito a nadie por ahora |
| Etapa actual | Registro de productos en curso |
| Idioma | Interfaz en español; código en inglés |

**Prioridades del dueño:** intuitivo y sencillo; reportes de inventario; velocidad de venta y aviso de cuándo recomprar; fotos de producto desde el celular mejoradas automáticamente a fondo blanco; compras a proveedores simples.

---

## 2. Decisiones confirmadas

| # | Tema | Decisión |
|---|---|---|
| D1 | País y fiscalidad | Venezuela. IVA 16 % incluido en los precios mostrados. Sin factura fiscal ni integración con SENIAT en el MVP; la app emite ticket o nota de entrega. Sin IGTF (queda como impuesto configurable, apagado). |
| D2 | Moneda base | Precios y costos en USD. Bs y COP se calculan con la tasa del día, cargada a mano con historial. Descarga automática de la tasa BCV como mejora opcional. |
| D3 | Dónde corre | En la nube: Supabase (base de datos, autenticación, archivos) y Vercel (aplicación). Accesible desde PC y celulares dentro y fuera del local. |
| D4 | Métodos de pago | Efectivo USD, Efectivo COP, Zelle (USD), Binance (USDT tratado como USD), Punto de venta (Bs) y Pago Móvil (Bs). No existe efectivo en Bs. El cambio se entrega en efectivo USD o COP. |
| D5 | Clientes y precios | Dos listas de precios: Público y Técnico. Cliente opcional en cada venta. Sin crédito: toda venta se paga completa. |
| D6 | Datos iniciales | No hay lista de productos. La app permite cargar producto por producto desde el celular y también importar desde Excel con plantilla. |
| D7 | Controles de producto | Sin lotes ni vencimientos; sin variantes talla/color; números de serie después (Fase 2). |
| D8 | Fotos con IA | Recorte automático con fondo blanco procesado en el navegador del dispositivo, sin servidor adicional. Adaptador para cambiar a un servicio externo después. |
| D9 | Stack | Next.js con TypeScript estricto, Tailwind y shadcn/ui; Drizzle ORM sobre PostgreSQL de Supabase; Auth.js para el inicio de sesión (usuarios creados por el administrador); Supabase Storage para fotos y PDFs; Vercel para despliegue y tareas programadas. |
| D10 | Ubicación del código | Repositorio Git en `C:\Users\josei\OneDrive\Documentos\Empresa` (decisión del dueño: todo en la carpeta del proyecto, dentro de OneDrive). Los datos de PostgreSQL local viven fuera de OneDrive, en la carpeta local de la aplicación del usuario, para evitar corrupción. Respaldo del código en GitHub. |

---

## 3. Qué cambia respecto al prompt maestro

**Sube a Fase 1:** multi-moneda completa; fotos de producto con IA; velocidad de venta, días de cobertura y sugerencia de compra; importación desde Excel.

**Se simplifica:** 3 roles (Administrador, Vendedor, Almacén); 1 caja; compras como "entrada por compra" con el documento del proveedor; sin cuentas por cobrar ni por pagar.

**Se pospone:** factura fiscal o electrónica, modo offline, e-commerce, fidelización, multi-sucursal, multi-empresa, kits, lotes, promociones complejas, cupones, comisiones, API pública y webhooks, cuentas por cobrar y pagar, gastos.

**Se agrega (específico de repuestos):** número de parte, referencias equivalentes, compatibilidad por tipo, marca y modelo de aparato, ubicación en estante, garantía en días, unidades con decimales (metro, kilo).

---

## 4. Alcance del MVP (Fase 1)

### 4.1 Acceso y usuarios
- Login con correo y contraseña (Supabase Auth). El administrador crea los usuarios; no hay registro público.
- PIN de 4 dígitos para cambiar de vendedor en el mostrador sin cerrar sesión.
- Roles: Administrador (todo), Vendedor (vender, cotizar, clientes, consultar stock, su caja), Almacén (entradas, ajustes, conteos, etiquetas, productos).
- Auditoría de precios, ajustes, anulaciones, devoluciones, tasas y usuarios.

### 4.2 Productos
- Campos: código interno (SKU autogenerado), número de parte, referencias equivalentes, nombre, descripción, categoría en árbol, marca, compatibilidad (tipo de aparato, marca y modelo), unidad, impuesto, ubicación en estante, garantía en días, proveedores, estado.
- Fotos: cámara del celular o archivo; recorte automático a fondo blanco en el navegador; vista previa lado a lado; aceptar, conservar original o repetir; varias fotos por producto.
- Códigos de barras: se leen los del fabricante; se generan internos (Code 128) para los que no traen; etiquetas en rollo o en hoja A4.
- Precios en USD: lista Público y lista Técnico; margen sugerido desde el costo; historial de cambios.
- Costo promedio ponderado en USD, actualizado en cada entrada por compra.
- Stock mínimo y máximo por producto; modo manual al inicio y modo automático por velocidad de venta cuando hay historial.
- Búsqueda instantánea por nombre, número de parte, equivalencia, modelo compatible, marca y código de barras.
- Importación desde Excel o CSV con plantilla, validación y reporte de errores por fila; exportación.

### 4.3 Inventario
- Existencias por producto; disponible = físico − reservado (reservas por cotización aceptada).
- Movimientos: entrada por compra, entrada manual, salida por venta, salida manual, ajuste con motivo obligatorio, devolución de cliente.
- Kardex por producto: fecha, tipo, documento, entrada, salida, saldo, costo, usuario. Tabla solo de inserción.
- Conteo físico desde el celular con escáner de cámara; comparación teórico contra físico; ajuste con un clic.
- Alertas: stock bajo, agotado, sin movimiento en N días, exceso.
- Valorización del inventario en USD, con equivalente en Bs y COP a la tasa del día.

### 4.4 Ventas en mostrador
- Pantalla de venta rápida: buscar o escanear, carrito, cantidad, descuento por línea o total con límite por rol, cliente opcional, lista de precios según cliente.
- Totales en USD con equivalentes en Bs y COP a la tasa del día.
- Pagos mixtos: cada pago tiene método, moneda y monto; la app muestra cuánto falta en cada moneda. Cambio en efectivo USD o COP.
- Comprobante: ticket 58/80 mm desde el navegador o nota de entrega en PDF, compartible por WhatsApp. Muestra montos en USD y Bs.
- Cotizaciones con vigencia, convertibles a venta.
- Devolución con motivo, reingreso opcional al stock y reembolso registrado; anulación solo por administrador con motivo, dentro de una ventana configurable.
- Ventas en espera para atender a dos clientes a la vez.

### 4.5 Compras y proveedores
- Proveedores: datos, contacto, moneda en la que cotizan, tiempo de entrega, condiciones.
- Entrada por compra: documento del proveedor, productos, cantidades, costo unitario en la moneda del proveedor convertido a USD con la tasa del día, gastos adicionales prorrateados; actualiza stock y costo promedio.
- Historial de costos por proveedor y producto.
- Reporte "Qué comprar" agrupado por proveedor, exportable a Excel.

### 4.6 Clientes
- Ficha simple: nombre, documento, teléfono, tipo (público o técnico), lista de precios, notas.
- Historial de compras y cotizaciones.

### 4.7 Caja
- Una caja. Apertura con fondo en efectivo USD y COP; cierre con conteo ciego por moneda; diferencias con justificación.
- Los métodos electrónicos (Zelle, Binance, Punto de venta, Pago Móvil) se concilian con la lista de referencias del día.
- Ingresos y retiros de efectivo con motivo. Reporte de cierre imprimible.

### 4.8 Reportes
- Ventas por día, semana y mes; por producto, categoría, vendedor, método de pago y moneda.
- Inventario valorizado; kardex; ajustes y mermas.
- Velocidad de venta, días de cobertura, rotación y clasificación ABC.
- Sugerencia de compra.
- Margen bruto por producto y categoría.
- Productos sin movimiento.
- Exportación a Excel y PDF.

### 4.9 Configuración
- Datos de la empresa, logo, zona horaria (America/Caracas).
- Tasas de cambio con historial (quién y cuándo).
- Impuestos, métodos de pago, motivos de ajuste y devolución, unidades, series de documentos, impresora, usuarios y PIN.
- Políticas: permitir stock negativo, descuento máximo por rol, ventana de anulación, redondeo de efectivo COP.

---

## 5. Velocidad de venta y reposición

Por producto:

- **Velocidad de venta** = unidades vendidas en la ventana ÷ días de la ventana con stock disponible. Ventanas de 30, 60 y 90 días; la de 30 pesa más.
- **Días de cobertura** = stock actual ÷ velocidad.
- **Punto de reorden** = velocidad × tiempo de entrega del proveedor + stock de seguridad. Stock de seguridad = factor de servicio × desviación de la demanda diaria × raíz del tiempo de entrega; nivel de servicio por clase (A 95 %, B 90 %, C 85 %).
- **Cantidad sugerida** = cobertura objetivo × velocidad − stock, nunca menor que cero, redondeada al empaque del proveedor.
- **Clasificación ABC** por ingresos acumulados de 90 días (A 80 %, B siguiente 15 %, C resto).

Arranque sin historial: los primeros 30 días se usan el mínimo y máximo manuales. Cuando un producto acumula 30 días con ventas, pasa a cálculo automático y la app lo indica. Semáforo por producto: Comprar ya, Pronto, OK, Exceso.

---

## 6. Fotos de producto con IA

**Flujo:** foto desde el celular o archivo → reducción a 1600 px → recorte del repuesto en el navegador → fondo blanco puro, recorte centrado con margen, imagen cuadrada de 1200 × 1200 → vista previa lado a lado → aceptar, conservar original o repetir → se guardan original, mejorada y miniatura en Supabase Storage.

**Por qué recorte y no IA generativa:** conserva el repuesto exactamente como es (números de parte, terminales, conectores). La generativa puede inventar detalles.

**Por qué en el navegador:** con Supabase y Vercel no hay dónde correr un servicio Python permanente sin pagar otro servidor. El recorte en el navegador es gratis, privado y no necesita infraestructura extra. Tarda entre 5 y 20 segundos en un celular medio y menos en una PC; se procesa en segundo plano mientras se llenan los demás campos.

**Opciones y estado:** A) recorte en navegador con la librería @imgly/background-removal, licencia AGPL, válida para uso interno (elegida); B) servicio propio con rembg si algún día se agrega un servidor; C) Google Product Studio vía Merchant API, gratis pero en fase alpha; D) Gemini API, pago por uso, solo para fondos de ambiente. Se implementa un adaptador para cambiar de A a otra opción sin tocar el resto.

**Consejos de captura que la app mostrará:** fondo claro y uniforme, luz difusa, sin sombras duras, el repuesto ocupando la mayor parte del encuadre.

---

## 7. Reglas multi-moneda

- Monedas: USD (base, 2 decimales), VES (2 decimales), COP (0 decimales, efectivo redondeado a 100).
- Tasa del día por moneda: unidades por 1 USD, con fecha, fuente y usuario. Se usa la última tasa vigente.
- Cada venta guarda las tasas usadas; los reportes históricos no cambian aunque la tasa cambie.
- Cada pago registra método, moneda, monto en esa moneda, tasa y equivalente en USD.
- La caja se abre, cuenta y cierra por moneda de efectivo (USD y COP).
- Los reportes se muestran en USD con desglose por método y moneda de pago.
- Impuesto opcional por método de pago (IGTF) modelado pero apagado.

---

## 8. Fuera del MVP

- Fase 2: números de serie con garantía; devoluciones a proveedor; promociones simples; notificaciones por WhatsApp y correo; PWA con modo offline básico; impresión ESC/POS directa; crédito a técnicos con cuentas por cobrar; descarga automática de tasa BCV.
- Fase 3: factura fiscal (máquina fiscal o proveedor autorizado); API y webhooks; catálogo público o por WhatsApp; multi-sucursal.
- Fase 4: pronóstico avanzado y detección de anomalías.

---

## 9. Riesgos y avisos

- **Respaldos:** Supabase está en plan Pro (respaldos diarios, 7 días de retención). La app además exporta a Excel/JSON y guarda un respaldo semanal en Storage.
- **Internet:** sin conexión no se puede vender hasta la Fase 2 (modo offline). Recomendación: datos móviles de respaldo en el local.
- **Factura legal:** en Venezuela la factura al detal normalmente sale de una máquina fiscal. Mientras no se integre, la app emite ticket o nota de entrega; verificar con el contador qué exige el negocio.
- **Licencia AGPL** de la librería de recorte: sin problema para uso interno; si algún día la app se vende a terceros, se cambia de librería.
