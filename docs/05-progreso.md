# La Principal 2050 — Progreso de la Fase 1

Actualizado: 2026-10-03. **Estado: Fase 1 completa y publicada** en https://laprincipal.vercel.app (Supabase + Vercel, ver `docs/07-despliegue.md`). Verificada en local: typecheck, lint, 207 pruebas, build de producción y los scripts de humo.

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

## Mejoras posteriores (2026-10-03, tarde)

- Tasa de Bs automática del BCV: se lee de bcv.org.ve con TLS verificado (la app incluye el certificado intermedio que el sitio no envía) y, si falla o la tasa publicada rige desde un día futuro, de ve.dolarapi.com. Se guarda con su "Fecha Valor" (la del viernes rige desde el lunes). Corre en la tarea diaria de las 3:00 a. m., con el botón "Actualizar desde el BCV" y en segundo plano cuando una página nota la tasa atrasada (máximo cada 30 minutos). Rechaza lecturas que cambien a menos de la mitad o más del doble. Carga manual de Bs solo como emergencia; COP sigue manual. Una tasa futura ya publicada evita el aviso de "tasa vieja" en fines de semana, nunca más de 7 días.
- Enlace "← Volver a …" arriba del título en las 49 subpáginas (`PageHeader back`), en lugar de los botones de volver que había en distintos estilos.

## Rol vendedor (2026-10-03)

- Decisión del dueño: el vendedor solo vende. Ve Vender (con cliente y ventas en espera) y Productos (sin costos, proveedores ni movimientos); entra directo a Vender. Ventas, devoluciones, cotizaciones, clientes, caja e inventario pasan a ser del administrador (inventario también de almacén).
- Después de cobrar, todos van a `/vender/venta/[id]` (cambio, ticket, WhatsApp, nueva venta). El vendedor solo abre, reimprime o reenvía las ventas que hizo ese día (`canOpenSale`, también en el ticket, la nota de entrega PDF y WhatsApp).
- Permisos: `quote` nuevo (admin); `return_sale` y `cash` pasan a solo admin. Si la caja está cerrada, el vendedor ve "Pídele al administrador que la abra".

## Revisión completa (2026-10-03, noche)

Cuatro revisiones (seguridad, dinero, inventario/catálogo, producción). Aplicado:

- Seguridad: Next.js 16.3.8 (falla crítica en 16.3.4); la sesión se valida contra la base en cada petición (`users.session_version`: desactivar, cambiar rol o contraseña corta las sesiones abiertas; `/salir`); límite de intentos atómico y escalonado para login (por correo e IP) y PIN (por quien escribe y por dueño del PIN), con auditoría `pin.failed` (tabla `auth_throttle`); PIN triviales rechazados al crearlos; aprobación de descuento atada al usuario y al % aprobado (5 min); cambio de vendedor ligado a la sesión, 15 min si es admin y borrado al salir; el vendedor no convierte cotizaciones; encabezados de seguridad.
- Ventas: un mismo cobro enviado dos veces crea una sola venta (`sales.client_request_id`); errores de red en el cobro sin bloquear el diálogo; si la tasa o los precios cambiaron, el servidor lo dice y la pantalla recarga; vuelto absurdo rechazado; venta en espera cobrable una sola vez; ventas y devoluciones no caen en una caja que se está cerrando; anular solo dentro del plazo y de la caja abierta (si no, Devolver); tolerancia de 1 centavo en el límite de descuento y reparto del descuento global sin líneas negativas; tasas manuales muy distintas piden confirmación; la pantalla de venta recarga caja y tasas al volver a la ventana y tiene "Volver a revisar".
- Escáner USB: un código desconocido no se pega al siguiente; las teclas del escáner van al buscador aunque el foco esté en un botón; en el celular el teclado no se abre tras cada producto.
- Catálogo: la importación de Excel lee los números como están guardados (1,125 ya no se vuelve 1125), restaura el cero inicial de UPC numéricos y rechaza productos repetidos (por número de parte o nombre); aplicar una importación dos veces no duplica; Guardar dos veces un producto nuevo no lo duplica; las fotos sin elegir se guardan (mejorada u original).
- Conteo: la diferencia se calcula contra la existencia al momento de contar cada producto (`system_qty_at_count`), y dos teléfonos no agregan el mismo producto dos veces.
- Despliegue: las migraciones solo corren en el build de producción (las vistas previas ya no tocan la base real).

## Productos sin precio y resto de la revisión (2026-10-03)

- Productos sin precio de venta: se registran (formulario e importación) con su costo, aparecen en gris con "Falta precio" en productos y en la pantalla de venta y no se pueden vender ni cotizar (también lo valida el servidor). Pantalla `/productos/precios` ("Poner precios") con precio sugerido = costo + margen por defecto; el técnico se calcula solo. Contador en Productos e Inicio, filtro "Falta precio" y aviso en la ficha. Es un estado calculado (sin precio público > 0), no una columna.
- Costo obligatorio cuando hay existencia inicial (formulario e importación); un costo promedio 0 se trata como desconocido.
- "Comprar ya", "Pronto" y el contador de Inicio se calculan en vivo con la existencia actual (`liveStatusExpr`), no con la foto de las 3:00 a. m.
- Búsqueda por varias palabras en cualquier orden (venta, productos, inventario).
- Códigos internos: no se pueden borrar, el siguiente considera todo código del rango interno y hay un índice único por producto; las violaciones de unicidad llegan como conflicto con mensaje claro.
- Renombrar marca o categoría rehace la búsqueda de sus productos; editar un producto ya no redondea precios y costo a 2 decimales.
- Pantallas de error con `retry` (recargan datos), pantalla global en español y la insignia de tasa no tumba la página si falla la base.
- Importación: sin foto de auditoría por fila (una sola entrada con todos los productos); conviene subir por partes de unas 300 filas.

Pendiente: cambio en USD con centavos (decisión del dueño).

## Un solo código por producto y barras fijas (2026-10-03)

- SKU y número de parte eran lo mismo para el negocio: ahora hay un solo campo "Número de parte" (columna `sku`), visible en Datos básicos. Vacío al crear = código interno `LP-000001`; vacío al editar = se mantiene. Único, con mensaje que nombra el otro producto; admite `/`. En listas, tickets, etiquetas ("Ref."), reportes y Excel aparece una sola columna. La importación acepta plantillas viejas (columna "SKU" o "Número de parte") y compara códigos sin separadores para no duplicar.
- Migración `0008`: los productos con `LP-` toman su número de parte como código cuando es válido y único; los demás números de parte quedan como equivalencias; los productos eliminados liberan su número de parte. La columna `part_number` se borra en la migración siguiente (después de que esta versión esté en producción).
- El código de barras generado por la app se llama "código de barras propio" (antes "código interno") para no confundirlo con `LP-`.
- Ficha y edición de producto: barra fija arriba con foto, nombre, código y código de barras al bajar; en la ficha también precio, existencia y Editar.
- Migración `0009`: borra `products.part_number` (ya sin uso desde `0008`).

## Cliente obligatorio y consulta de precio (2026-10-04)

- Vender y Nueva cotización empiezan pidiendo la cédula o RIF (V por defecto). Cliente registrado: se confirma y se sigue; nuevo: se registra ahí mismo. Sin cliente no se cobra ni se cotiza (también lo valida el servidor). "Consumidor final" ya no existe para ventas nuevas; las viejas lo conservan.
- "Solo consultar precio" (`/vender/consulta`): escanear o buscar y ver precio público y técnico en $, Bs y COP, existencia y estante, sin carrito.
- Cliente: nombre y apellido separados (razón social para J y G), teléfono obligatorio con prefijo (0412, 0414, 0416, 0422, 0424, 0426 o fijo con código de área), dirección opcional en cascada estado → municipio → parroquia + sector/calle/casa. Migración `0010` (columnas nuevas; separa el nombre de los clientes existentes).

## Revisión de diseño con UI UX Pro Max (2026-10-04)

- Cursor de mano en todo lo clicable, contraste del rojo de error a 5,3:1, zoom con dos dedos permitido, enlace "Saltar al contenido", foco que no queda tapado por barras fijas, controles de texto de 24 px con ratón, ojo para ver la contraseña, "Ventas en espera" / "Poner en espera", tarjetas de números en dos columnas en el celular, período comparado una sola vez en el reporte de ventas, etiquetas y orden de títulos corregidos.

## Navegación en el celular (2026-10-03)

- Barra inferior según el rol: sus cuatro secciones más usadas (admin: Inicio, Vender, Productos, Inventario; almacén: Inicio, Productos, Inventario, Compras; vendedor: Vender, Productos) con indicador de la sección activa.
- "Más" abre un panel desde abajo con el resto de las secciones en cuadros grandes, la cuenta ("Mi cuenta y PIN") y "Cerrar sesión"; "Más" queda marcado cuando la página actual es una de sus secciones.
- El encabezado muestra el ícono y el nombre de la sección actual (antes estaba vacío en el celular).
- Productos, Inventario y Ventas pliegan los filtros detrás de un botón "Filtros" con el número de filtros activos; en la computadora se ven siempre.

## Próximos pasos

1. Subir estos cambios a `main`: Vercel aplica la migración `0003` al construir.
2. Probar en el local con los equipos reales (ver pendientes) y hacer un día de prueba completo en producción.
3. Revisar el plan de Vercel: el plan Hobby es solo para uso personal no comercial; para el negocio corresponde Pro.
4. Fase 2: números de serie y garantías, promociones simples, notificaciones, modo offline básico, impresión ESC/POS directa, crédito a técnicos.
