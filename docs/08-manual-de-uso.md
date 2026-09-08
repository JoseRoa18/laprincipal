# Manual de uso — La Principal 2050

App: https://laprincipal.vercel.app. En el celular: abrir la dirección en Chrome o Safari y elegir "Agregar a pantalla de inicio".

Cada persona entra con su correo y contraseña. El PIN de 4 dígitos sirve para cambiar de vendedor rápido en el mostrador y para autorizar descuentos grandes.

---

## Todos los días

**Al abrir el local (administrador o vendedor)**
1. Configuración → Tasas: escribir cuántos bolívares y cuántos pesos vale 1 dólar hoy. Sin tasa la app no deja vender.
2. Caja → Abrir caja: contar el efectivo inicial en dólares y en pesos y escribirlo.

**Al cerrar (vendedor o administrador)**
1. Caja → Cerrar caja: contar el efectivo sin mirar lo esperado y escribir lo contado por moneda.
2. Revisar las referencias de Pago Móvil, punto de venta, Zelle y Binance.
3. Si hay diferencia, escribir el motivo. Imprimir el cierre.

---

## Vendedor

**Vender**
1. Vender → escribir el nombre o número de parte, o pasar el escáner. Tocar el producto para agregarlo.
2. Ajustar cantidades. Si el cliente es técnico, elegirlo en "Cliente" para que salga su precio.
3. Cobrar → elegir el método (Efectivo USD, Efectivo COP, Zelle, Binance, Punto de venta, Pago Móvil), escribir el monto y la referencia si la pide. Se pueden combinar varios pagos; la app muestra cuánto falta en cada moneda y el cambio en dólares o pesos.
4. Confirmar. Imprimir el ticket o enviarlo por WhatsApp.

**Atender a dos clientes a la vez:** "Poner en espera" guarda la venta con un nombre; se recupera desde "Ventas en espera".

**Descuentos:** hasta el porcentaje permitido a tu rol. Si es mayor, la app pide el PIN de un administrador.

**Devolución:** Ventas → abrir la venta → Devolver → marcar las líneas, el motivo, si vuelve al inventario y cómo se reembolsa.

**Cotización:** desde Vender, "Guardar como cotización". Tiene fecha de vencimiento, se envía en PDF y se convierte en venta con un botón.

---

## Almacén

**Registrar un producto (desde el celular)**
1. Productos → Nuevo producto → tomar la foto. La app la recorta y deja el fondo blanco; se puede aceptar, conservar la original o repetir.
2. Nombre, número de parte, categoría, marca. En "Compatible con" anotar los modelos de aparato donde sirve; en "Equivalencias", otros códigos del mismo repuesto.
3. Precio público en dólares; el precio técnico se sugiere solo. Costo si se conoce.
4. Stock inicial y ubicación en el estante. Guardar, o "Guardar y crear otro".

**Códigos de barras:** si el repuesto trae código, escanearlo en la ficha. Si no, "Generar código interno" e imprimir la etiqueta en Productos → Etiquetas.

**Muchos productos de una vez:** Productos → Importar → descargar la plantilla de Excel, llenarla y subirla. La app avisa los errores por fila antes de aplicar.

**Cuando llega mercancía:** Compras → Entradas → Nueva entrada: proveedor, número de la factura, moneda, productos, cantidades y costos. "Aplicar entrada" actualiza el stock y el costo promedio.

**Ajustes:** Inventario → Ajustes → Nuevo, siempre con motivo (merma, daño, error de conteo, uso interno, garantía).

**Conteo físico:** Inventario → Conteos → Nuevo. Contar desde el celular escaneando o buscando; al final, "Aplicar ajustes" corrige las diferencias.

---

## Administrador

- **Qué comprar:** Compras → Qué comprar. Lista por proveedor con la cantidad sugerida según la velocidad de venta; se exporta a Excel para enviar al proveedor. Los primeros 30 días usa los mínimos manuales de cada producto; después calcula solo.
- **Reportes:** ventas por día, producto, vendedor y método de pago; inventario valorizado; velocidad y clasificación ABC; margen; productos sin movimiento. Todo se exporta a Excel.
- **Usuarios:** Configuración → Usuarios: crear vendedores y almacenistas con su rol, contraseña y PIN. Desactivar cuando alguien se va.
- **Políticas:** descuento máximo por rol, permitir stock negativo, horas para anular una venta, vigencia de cotizaciones.
- **Respaldos:** Configuración → Respaldos: respaldo manual y exportación a Excel. Además Supabase guarda respaldos diarios.

---

## Si algo falla

- "Sin tasa": cargar la tasa del día en Configuración → Tasas.
- "Caja cerrada": abrir la caja antes de vender.
- "No hay existencia suficiente": revisar el stock del producto; solo el administrador puede forzar la venta si la política lo permite.
- La app no responde desde internet: en la PC del local ejecutar `emergencia-servidor-local.cmd` (doble clic) y usar las direcciones que muestra. Los datos siguen en Supabase.
