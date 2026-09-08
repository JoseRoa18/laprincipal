# Reporte — QA de responsividad móvil

Fecha: 2026-09-08. Alcance: todas las pantallas de la app en celular (390×844) y tablet (768×1024), incluidos los diálogos principales (Cobrar, ficha de producto, caja, ajustes, conteos, cotizaciones y devoluciones). Se corrigió lo encontrado en los módulos de interfaz, sin tocar `src/components/ui/*`, `src/lib/*`, el esquema ni los archivos del flujo de fotos (`photo-pipeline.ts`, `photo-capture.tsx`, galería y acciones de fotos).

---

## 1. Cómo se verificó

`scripts/qa-mobile.ts` es un rastreador con Playwright (Chromium) que inicia sesión como el administrador (por `/api/auth` o, si esa ruta falla, por el formulario de `/login`), visita cada ruta en los dos tamaños y, por vista:

1. Captura la pantalla completa en `qa/mobile/<vista>/<ruta>.png` (`qa/` está en `.gitignore`).
2. Mide desbordamiento horizontal: `document.documentElement.scrollWidth > innerWidth` y lista los elementos (o textos sin corte) cuyo borde derecho supera el viewport y no están dentro de un contenedor con scroll propio.
3. Cuenta objetivos táctiles menores de 40×40 px entre botones, enlaces, inputs, selects, pestañas, opciones, casillas e interruptores visibles (los enlaces en línea dentro de un párrafo se reportan aparte).
4. Cuenta textos menores de 12 px y controles con fuente menor de 16 px (iOS hace zoom al enfocarlos).
5. Baja al final de la página y comprueba que el último contenido no quede debajo de la barra inferior ni de una barra fija de acciones; avisa de `sticky` que quedarían bajo la cabecera.

Además abre diálogos: los que Base UI marca con `aria-haspopup="dialog"` (uno a uno, hasta 8 por página) y escenarios explícitos del POS (carrito con producto, Cobrar con un pago agregado, editar línea, descuento general, cliente, en espera, poner en espera, cambiar vendedor), guardar cotización, ficha de producto con secciones expandidas, cierre de caja con diferencia, ajuste y entrada con producto agregado, devolución con línea marcada. Para el carrito siembra la clave `lp2050-pos-cart` en `localStorage` con un producto real de la base, así funciona aunque `/api/sales/products` esté caído.

Las rutas dinámicas usan ids reales de la base (`DATABASE_URL`): último producto, venta, venta devolvible, cotización, cliente, proveedor, entrada, ajuste, conteo y sesión de caja. Las que no tienen datos se omiten y quedan anotadas en el reporte.

Salidas: `qa/mobile/report.md` (tabla por vista y detalle), `qa/mobile/findings.json` (datos crudos) y las capturas.

```bash
pnpm exec tsx scripts/qa-mobile.ts                       # todo (unos 6 minutos)
pnpm exec tsx scripts/qa-mobile.ts --only=vender         # rutas que contengan el texto
pnpm exec tsx scripts/qa-mobile.ts --viewport=phone      # solo celular
pnpm exec tsx scripts/qa-mobile.ts --no-dialogs --no-screens
pnpm exec tsx scripts/qa-mobile.ts --seed                # crea proveedor y cliente de prueba si faltan y los borra al final (--keep-seed los deja)
```

Requiere el servidor de desarrollo y la base local. En Git Bash de Windows usa `MSYS_NO_PATHCONV=1` delante si pasas rutas con `/`. Termina con código 1 si alguna vista desborda.

Dependencia añadida: `@playwright/test` (devDependency) y `pnpm exec playwright install chromium`.

## 2. Rutas revisadas

56 rutas × 2 tamaños + 50 diálogos y escenarios = 162 vistas por corrida.

`/login`, `/inicio`, `/vender` (+8 escenarios), `/ventas`, `/ventas/[id]`, `/ventas/[id]/devolver` (+1), `/cotizaciones`, `/cotizaciones/nueva` (+5), `/cotizaciones/[id]`, `/productos`, `/productos/nuevo` (+1), `/productos/[id]` (+2 diálogos), `/productos/[id]/editar`, `/productos/categorias` (+1), `/productos/etiquetas`, `/productos/importar`, `/inventario` (+1), `/inventario/movimientos`, `/inventario/ajustes`, `/inventario/ajustes/nuevo` (+1), `/inventario/conteos`, `/inventario/conteos/nuevo`, `/inventario/alertas`, `/compras`, `/compras/proveedores`, `/compras/proveedores/nuevo`, `/compras/entradas`, `/compras/entradas/nueva` (+1), `/compras/que-comprar`, `/clientes`, `/clientes/nuevo`, `/caja` (+2), `/caja/cerrar` (+1), `/caja/historial`, `/caja/historial/[id]`, `/reportes`, `/reportes/ventas`, `/reportes/inventario`, `/reportes/velocidad`, `/reportes/margen`, `/reportes/sin-movimiento`, `/configuracion` y sus 12 secciones (+1 diálogo en unidades), `/sin-acceso`, `/imprimir/ticket/[id]`.

La base local no tenía clientes ni proveedores, así que la corrida final se hizo con `--seed`: el rastreador crea "Proveedor QA móvil" y "Cliente QA móvil" a través de los formularios reales, con lo que `/compras/entradas/nueva` muestra el formulario de entrada (y no el aviso "Primero registra un proveedor") y se visitan `/clientes/[id]`, `/clientes/[id]/editar`, `/compras/proveedores/[id]` y `/compras/proveedores/[id]/editar`; al terminar borra las dos filas (`--keep-seed` las conserva). Siguen sin visitarse por falta de datos `/compras/entradas/[id]`, `/inventario/ajustes/[id]` y `/inventario/conteos/[id]` (crear una entrada, un ajuste o un conteo mueve existencias o deja documentos, así que no se siembran); sus tablas se corrigieron igual (columnas secundarias ocultas en celular) y el rastreador las incluye en cuanto exista un registro.

## 3. Problemas encontrados (corrida inicial)

| Problema | Dónde | Cantidad |
|---|---|---|
| Desbordamiento horizontal real | `/inventario`, `/productos/[id]` y `/reportes/velocidad` en celular y `/productos` en tablet: el grupo de acciones de `PageHeader` llevaba `shrink-0`, así que con 3–4 botones no se partía en filas y la página medía 429–476 px. Chrome lo disimula ampliando el viewport (`innerWidth` pasa de 390 a 437), por lo que la primera versión del rastreador (que comparaba contra `innerWidth`) no lo vio; ahora compara contra el ancho del dispositivo y avisa cuando el navegador amplía el viewport. Las tablas no desbordan: ya tenían `overflow-x-auto`. | 4 rutas |
| Contenido tapado por la barra inferior | ninguna (el layout deja `pb-20` y las barras fijas usan `bottom-14`) | 0 |
| Objetivos táctiles < 40 px | botones `h-8` de shadcn (32 px) en casi todas las páginas, "Cambiar vendedor" y "En espera" del POS (28 px), inputs y selects `h-8`, botones de icono 28–32 px (Editar mínimos, categorías, marcas), enlace de la tasa en la cabecera (20 px), pestañas de cotizaciones (34 px), chips de clientes (36 px), `summary` de "Ver tabla" y "Ver referencias" (20 px), enlaces de producto en listas (20–24 px) | 1 261 en 109 tipos |
| Texto < 12 px | etiquetas de la barra inferior (11 px), ejes del gráfico de ventas (11 px), moneda en los botones de pago de Cobrar (11 px); el ticket de 58/80 mm usa 10–11 px a propósito | 11 tipos |
| Controles con fuente < 16 px | todos los `NativeSelect` (14 px) y los inputs con `md:text-sm` en tablet | 103 tipos |
| Tablas anchas que obligan a desplazar en celular | ventas, cotizaciones, kardex, alertas, ajustes, conteos, entradas, proveedores, clientes, historial de caja, qué comprar; detalles de venta, cotización, ajuste y entrada; reportes | — |
| Filas del formulario de producto | compatibilidades (3 inputs + botón en 358 px) y equivalencias apretadas | — |
| Error de hidratación (React) | `/reportes/velocidad` y `/reportes/sin-movimiento`: `ParamSelect` metía un `<select>` dentro del `<select>` de `NativeSelect` | 2 rutas |
| Errores 500 de `/api/sales/held` y `/api/auth/*` durante la corrida inicial | incidente del servidor de desarrollo (ver sección 6), no de la interfaz | — |

## 4. Correcciones aplicadas

1. **Capa táctil global** (`src/app/globals.css`, fuera de `@layer` para ganar a las utilidades): con `@media (pointer: coarse)` todos los `Button` miden al menos 44 px de alto (los de solo icono también de ancho), `Input`, `NativeSelect` y `Textarea` pasan a 44 px y 16 px de fuente, `TabsList` y las opciones de `DropdownMenu` a 44 px, y `Checkbox`, `RadioGroupItem` y `Switch` amplían su área de toque invisible (`::after`) a 44 px. Con ratón no cambia nada. Utilidad `tap-target` (min-height 44 px solo con puntero grueso) para enlaces y botones propios.
2. **Listas anchas como tarjetas en celular** (`md:hidden`) con la tabla en `hidden md:block`: `/ventas`, `/cotizaciones`, `/inventario/movimientos`, `/inventario/alertas`, `/inventario/ajustes`, `/inventario/conteos`, `/compras/entradas`, `/compras/proveedores`, `/clientes`, `/caja/historial` y "Qué comprar" (`suggestions-table.tsx`, con la cantidad editable en la tarjeta). Ya lo tenían `/productos` e `/inventario`.
3. **Columnas secundarias ocultas en celular** (`hidden md:table-cell`) con pies de tabla alineados (sin `colSpan` que descuadre): detalle de venta (Desc., IVA), cotización (Desc.), devolución (Vendido / Ya devuelto pasan al texto de la línea), ajuste (Costo unit., Nota), entrada (tres columnas de costo), caja (Pagos, Devuelto), ficha de producto (Costo, Usuario del kardex), proveedor y cliente, métodos de pago (Tipo, Recargo), series (Relleno), motivos (Orden), importación, diferencias del conteo (Valor) y los cinco reportes (velocidad: ABC, reorden sugerido, última venta, modo; inventario: unidades, categoría, costo prom.; margen: unidades, costo; sin movimiento: categoría, última entrada; ventas: barras de porcentaje, equivalente USD y n.º de ventas por método).
4. **Diálogos** con `max-h-[90svh] overflow-y-auto` en todos los formularios modales (usuarios, impuestos, unidades, motivos, series, métodos de pago, ingresos/retiros, mínimos, categorías, marcas, cliente rápido, línea, descuento, cotización, vendedor, supervisor, en espera, anular venta y entrada). Cobrar ya usaba `100dvh - 2rem`.
5. **Formulario de producto**: compatibilidades en dos columnas en celular (tipo + marca, luego modelo + quitar) y equivalencias con código + quitar en la primera fila y marca debajo; una sola fila desde `sm`.
6. **Tamaños de navegación y texto**: etiquetas de la barra inferior a 12 px, enlace de la tasa en la cabecera a 44 px de alto, moneda de los botones de pago a 12 px, ejes del gráfico a 12 px, `summary` con `py-3`, pestañas de cotizaciones, chips de clientes, filtros de estado de velocidad, enlaces "Volver a configuración", nombre de producto en tarjetas y botones de línea/descuento del carrito con `tap-target`.
7. **Barras fijas**: el cierre de caja usa `bottom-14` como el resto (antes `bottom-16`, dejaba un hueco sobre la barra inferior). Se verificó que POS, ficha de producto, ajuste, entrada y conteo dejan el contenido visible por encima de sus barras y de la navegación.
8. **Bug real corregido**: `ParamSelect` (reportes) anidaba un `<select>` dentro de `NativeSelect`; ahora pasa las opciones al componente y desaparece el error de hidratación en `/reportes/velocidad` y `/reportes/sin-movimiento`.
9. **`PageHeader`** (`src/components/app/page-header.tsx`): el grupo de acciones pierde `shrink-0` y lleva `max-w-full`; cuando él solo es más ancho que la fila se encoge y sus botones se reparten en varias filas. En escritorio no cambia nada (el encogido solo actúa cuando el grupo no cabe).
10. **Disparadores de diálogo**: Base UI sustituye `data-slot="button"` por `dialog-trigger`, `alert-dialog-trigger`, `dialog-close`, `alert-dialog-cancel/action`, `sidebar-trigger`, etc., así que la capa táctil los incluye por su propio slot; el encabezado de diálogos y hojas deja 2,5 rem a la derecha para el botón de cerrar de 44 px.

Archivos compartidos tocados (fuera de los módulos, avisado aquí): `src/app/globals.css`, `src/components/app/mobile-nav.tsx`, `src/components/app/rate-badge.tsx`, `docs/06-guia-de-desarrollo.md` (nota de la capa táctil), `.gitignore` (`/qa/`), `package.json` (`@playwright/test`).

## 5. Resultado final

Corrida final (`pnpm exec tsx scripts/qa-mobile.ts --seed`, 60 rutas × 2 tamaños + 52 diálogos y escenarios = 172 vistas):

| Medida | Inicial | Final |
|---|---|---|
| Vistas con desbordamiento horizontal (contra el ancho del dispositivo) | 4 rutas (ocultas por el viewport ampliado) | **0** |
| Contenido tapado por la barra inferior o una barra fija | 0 | 0 |
| Objetivos táctiles < 40 px (sin enlaces en línea) | 1 261 | **0** |
| Controles con fuente < 16 px | 103 tipos | **0** |
| Textos < 12 px | 11 tipos | 7 tipos, todos en el ticket de impresión (10–11 px a propósito) |
| Errores de JavaScript en la página | 2 rutas (hidratación) | 0 |

Las 172 vistas responden 200 y ninguna abre un diálogo que se salga del viewport o recorte contenido sin scroll. Capturas en `qa/mobile/phone/` y `qa/mobile/tablet/`; detalle por vista en `qa/mobile/report.md`.

Verificación: `pnpm typecheck` ✓, `pnpm lint` ✓ (0 errores, 2 avisos previos), `pnpm test` ✓ (28 archivos, 179 pruebas), `pnpm exec tsx scripts/smoke.ts` ✓.

## 6. Lo que queda y por qué

- **Interruptores, casillas y radios** siguen midiendo 16–32 px visualmente; el área de toque real es de 44 px por el pseudo-elemento `::after` y el rastreador ya mide esa área (y, en casillas nativas, la etiqueta que las envuelve), así que no cuentan como pequeños.
- **Enlaces dentro de texto** (por ejemplo "Cargar la tasa" en un aviso o el número de venta en una tabla de escritorio) se dejan como enlaces en línea; WCAG 2.5.8 los exceptúa y el reporte los lista aparte.
- **Riel de la barra lateral** (`SidebarRail`, 16 px de ancho) aparece en tablet: es un control de escritorio de shadcn (`src/components/ui`, fuera de alcance); la barra se pliega con el botón de la cabecera, que sí mide 44 px. El rastreador lo omite.
- **Ticket de 58/80 mm** usa 10–11 px monoespaciado a propósito (vista de impresión).
- **Tablet con la barra lateral abierta** (768 px menos 256 px de menú): las tablas de escritorio se desplazan dentro de su contenedor; no desbordan la página. Plegar la barra deja 720 px.
- **Casillas nativas** de "Solo con existencia", "Incluir inactivos" y "Conteo ciego" (16–20 px): el objetivo real es la etiqueta de 40–48 px que las envuelve.
- **Zoom de iOS**: además de los 16 px, el `viewport` de `src/app/layout.tsx` ya lleva `maximumScale: 1`.
- `pnpm lint` conserva dos avisos previos del compilador de React sobre `watch()` de react-hook-form (`movement-dialog.tsx`, `customer-form.tsx`), ajenos a este trabajo.
- En una corrida intermedia `/caja/historial` registró una vez el error de desarrollo de Next "Router action dispatched before initialization" al navegar; no se repitió en las corridas siguientes ni afecta al diseño.

## 7. Incidente del entorno durante la revisión

Al instalar `@playwright/test`, pnpm volvió a resolver `next-auth` en una carpeta nueva de `node_modules/.pnpm` y el servidor de desarrollo (Turbopack) se quedó con el grafo viejo para las rutas `app/api/*`: `/api/auth/*` y `/api/sales/*` respondían 500 con "module factory is not available" mientras las páginas y las acciones de servidor seguían funcionando. Por eso el rastreador inicia sesión por el formulario cuando `/api/auth` falla y siembra el carrito por `localStorage`. El servidor se recuperó antes de la corrida final (probablemente un reinicio); si vuelve a pasar, basta con reiniciar `pnpm dev`.
