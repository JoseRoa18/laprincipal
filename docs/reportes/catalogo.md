# Reporte — Paquete A: Catálogo de productos

Fecha: 2026-09-08. Rutas bajo `/productos/**`, módulo `src/modules/catalog`, API `src/app/api/products/**`.

## 1. Qué se construyó

### Pantallas

| Ruta | Qué hace | Roles |
|---|---|---|
| `/productos` | Lista con búsqueda (`q` sobre `search_text` con ILIKE + coincidencia exacta de SKU o código de barras), filtros por categoría (incluye subcategorías), marca, estado de stock y activos/inactivos; paginación en servidor; tarjetas en celular y tabla en escritorio; precios Público y Técnico en USD y Bs; costo y margen solo con `view_costs`; botón "Exportar Excel" con los filtros vigentes. | Todos |
| `/productos/nuevo` | Ficha en secciones: 1 Foto (cámara o galería, recorte de fondo en el navegador), 2 Datos básicos (+ "Más opciones": descripción, SKU personalizado, garantía, impuesto), 3 Compatibilidades y equivalencias (filas dinámicas), 4 Precios y costo (técnico sugerido = público × (1 − `techPriceMarkdownPct`/100) hasta que el usuario lo edite; margen en vivo; alerta si precio < costo), 5 Stock y ubicación (stock inicial, mínimo, máximo, ubicación, código de barras del fabricante con escáner de cámara, opción de generar código interno). Botones "Guardar" y "Guardar y crear otro". Las fotos se suben después de crear el producto, con progreso. | Admin, Almacén |
| `/productos/[id]` | Detalle: galería (principal grande, miniaturas, hacer principal, eliminar, agregar), precios USD/Bs/COP, stock y semáforo, mínimos/máximos y estadísticas (`product_stats` si existen), datos, compatibilidades y equivalencias, códigos de barras (agregar tecleando/escaneando, generar interno, principal, quitar, vista previa PNG), proveedores (`product_suppliers`), últimos 20 movimientos del kardex con enlace a `/inventario/movimientos?product=<id>`, historial de precios. Botones Editar, Desactivar/Reactivar, Eliminar, Etiqueta. | Todos (acciones solo Admin/Almacén) |
| `/productos/[id]/editar` | Misma ficha en modo edición (sin stock inicial ni código de barras; fotos se gestionan arriba, al instante). | Admin, Almacén |
| `/productos/categorias` | Árbol de categorías (crear, subcategoría, editar, orden, eliminar o desactivar si está en uso) y marcas (crear, editar, eliminar o desactivar). | Admin, Almacén |
| `/productos/etiquetas` | Buscar y agregar productos, cantidad por producto, formato "Rollo 50 × 25 mm" (una por página) u "Hoja A4" (4 × 10, celdas 52,5 × 29,7 mm), precio opcional; genera PDF en pestaña nueva. `?add=<id>` preselecciona un producto. | Admin, Almacén |
| `/productos/importar` | Descargar plantilla Excel, subir archivo, vista previa con errores por fila y conteos, "Aplicar" (todas las filas válidas en una transacción), "Deshacer" e historial de importaciones. | Admin |

`loading.tsx` en lista, detalle y nuevo; `error.tsx` en `/productos`.

### API (route handlers)

- `GET|POST /api/products/labels` → PDF (`@react-pdf/renderer`, códigos con `bwip-js`: `ean13` para EAN-13 e internos, `upca`, `code128` para el resto).
- `GET /api/products/export?q=&category=&brand=&stock=&active=` → Excel del catálogo (tope 5000 filas; sin columna de costo para vendedores).
- `GET /api/products/import/template` → plantilla con hojas Productos, Instrucciones y Listas (categorías y unidades; validación de lista en la columna Categoría).
- `GET /api/products/barcode?code=&type=` → PNG de un código (vista previa en la ficha).

### Archivos

- Dominio (`src/modules/catalog/domain/`): `sku.ts`, `barcodes.ts` (`ean13CheckDigit`, `generateInternalBarcode`, `detectBarcodeType`…), `search-text.ts` (`normalizeSearch`, `buildSearchText`), `pricing.ts` (`suggestTechPrice`, `priceMargin`), `product-schema.ts` (Zod compartido por formulario y acciones; `toProductInput`), `import-rows.ts` (validación de filas Excel), `labels.ts`, `list-filters.ts`, `category-schema.ts`. Pruebas al lado (`*.test.ts`).
- Aplicación (`application/`): `catalog-shared.ts` (bloqueo consultivo, secuencias, registro de códigos, `rebuildSearchText`, snapshot para auditoría), `products.ts` (crear/actualizar/activar/eliminar), `barcodes.ts`, `images.ts`, `categories.ts`, `import.ts` (validar, aplicar, deshacer, historial).
- Infraestructura (`infrastructure/`): `product-lookup.ts` (existente; `normalizeSearch` ahora vive en el dominio y se reexporta con la misma firma), `products-list.ts`, `product-detail.ts`, `catalog-options.ts`, `excel.ts`, `labels-data.ts`, `labels-pdf.tsx`, `barcode-image.ts`.
- UI (`ui/`): `product-form.tsx`, `photo-capture.tsx`, `photo-pipeline.ts`, `product-gallery.tsx`, `barcode-manager.tsx`, `barcode-scanner.tsx` (html5-qrcode), `product-filters.tsx`, `product-status-actions.tsx`, `category-manager.tsx`, `brand-manager.tsx`, `labels-picker.tsx`, `import-wizard.tsx`, `product-thumb.tsx`, `link-row.tsx`, `form-field.tsx`, `labels-es.ts`.
- Acciones: `src/app/(app)/productos/actions.ts`, `productos/categorias/actions.ts`, `productos/importar/actions.ts`.
- Pruebas: `tests/catalog.test.ts`; humo: `scripts/smoke-catalog.ts`.

## 2. Reglas de negocio implementadas

- **SKU**: `LP-000001` secuencial. Dentro de la transacción se toma `pg_advisory_xact_lock(hashtext('product_sku'))` y se calcula `max` del sufijo numérico + 1. SKU personalizado permitido (mayúsculas, letras/números/./-/_, único). Al soft-delete el SKU se conserva.
- **Código interno**: EAN-13 `20` + secuencia de 10 dígitos + verificador, secuencia = `max` de los códigos INTERNAL existentes bajo el mismo bloqueo. Al eliminar un producto solo se liberan los códigos del fabricante; los INTERNAL se conservan para que una etiqueta impresa nunca apunte a otro producto. Códigos del fabricante se guardan tal cual; el tipo se detecta (EAN13/UPC por dígito verificador, CODE128 en otro caso). Unicidad global de códigos.
- **search_text**: se reconstruye en cada guardado con nombre, SKU, número de parte, marca, categoría, equivalencias, compatibilidades (tipo + marca + modelo) y códigos de barras; los códigos también en forma compacta (`emb-123` y `emb123`).
- **Precios**: `price_list_items` PUBLIC y TECH (técnico sugerido si viene vacío); `price_history` (old/new/usuario) en cada cambio.
- **Stock inicial** (solo al crear, > 0): `applyMovement` tipo `initial` con motivo "Inventario inicial", `cost_avg_usd` y `cost_last_usd` = costo, `stock_settings` (mínimo, máximo, `reorder_point` = mínimo en modo manual, no se toca en modo auto). Sin stock inicial igual se crea la fila de `stock_levels` en 0.
- **Costo al editar**: actualiza `cost_last_usd`; `cost_avg_usd` solo si el producto aún no tiene entradas por compra.
- **Auditoría**: `product.create/update/activate/deactivate/delete`, `barcode.*`, `product_image.*`, `category.*`, `brand.*`, `import.apply/undo`, con before/after.
- **Permisos**: escrituras con `assertRole("admin","warehouse")`; importación solo admin; vendedores ven la lista y el detalle sin costos ni botones.
- **Eliminar**: sin movimientos → `deleted_at` + `is_active=false`; con movimientos → solo desactiva (mensaje claro en el diálogo). Categorías y marcas en uso se desactivan en lugar de borrarse.
- **Deshacer importación**: el kardex es de solo inserción, así que por cada producto creado: si solo tiene el movimiento `initial`, se registra un `adjust_out` compensatorio por el stock actual (referencia `import_job`, motivo "Inventario inicial", nota "Deshacer importación") y se hace soft-delete; si ya tiene ventas, compras u otros movimientos se conserva y se informa. El trabajo pasa a `undone`.

## 3. Fotos con IA (pipeline en el navegador)

`photo-capture.tsx` + `photo-pipeline.ts`: `<input capture="environment">` o galería (varias) → reducción a 1600 px JPEG 0,9 (original) → `@imgly/background-removal` vía `import()` dinámico (`isnet_quint8` en celular, `isnet_fp16` en PC, modelo desde el CDN por defecto, barra de progreso "Descargando el modelo" / "Recortando el fondo") → recorte sobre blanco: caja de píxeles con alfa > 10, margen 6 %, centrado en 1200 × 1200, WebP 0,85 (JPEG si el navegador no codifica WebP) + miniatura 300 × 300 → vista lado a lado con "Usar mejorada", "Conservar original", "Repetir". Si falla o tarda más de 60 s, queda `original_only`. Al crear, las fotos aceptadas se guardan en memoria y se suben una por una con `uploadProductPhotoAction` (FormData, tope 12 MB) después de crear el producto; en editar/detalle se suben al aceptar. Rutas: `products/<productId>/<imageId>-original.jpg|processed.webp|thumb.webp` en el bucket `product-photos`; la primera foto es la principal.

## 4. Cómo probar a mano

1. Entrar como `admin@laprincipal2050.com` / `Admin2050*`. Cargar una tasa Bs en `/configuracion/tasas` para ver precios en Bs (sin tasa, la lista muestra solo USD y el detalle avisa).
2. **Registrar desde el celular**: Productos → "Nuevo producto" → "Tomar foto" (la primera vez descarga ~40 MB de modelo) → mientras recorta, escribir nombre, número de parte, categoría, marca ("+ Nueva marca…"), escanear o escribir el código del fabricante → precio público (ver el técnico sugerido; editarlo y "Volver a la sugerencia") → costo (ver margen y alerta si precio < costo) → stock inicial, mínimo, máximo, ubicación → "Usar mejorada" en la foto → "Guardar" (o "Guardar y crear otro").
3. **Detalle**: verificar foto principal, precios en tres monedas, stock con semáforo, kardex con "Inventario inicial", historial de precios, código de barras (o "Generar código interno"), "Etiqueta".
4. **Editar**: cambiar precio público → el historial registra el cambio; agregar fotos y hacer principal; desactivar y reactivar; eliminar (con movimientos solo desactiva).
5. **Lista**: buscar por nombre, número de parte, equivalencia ("FFI12HBX"), modelo compatible ("RMS400") o escanear el código; filtrar por categoría, marca, "Comprar ya"/"Agotados", inactivos; "Exportar Excel".
6. **Categorías y marcas**: crear "Refrigeración > Válvulas", reordenar, intentar borrar una en uso (se desactiva), crear/borrar marca.
7. **Etiquetas**: agregar 2 productos, cantidades 3 y 1, "Rollo" y "Hoja A4", con y sin precio → PDF; imprimir al 100 % sin ajustar.
8. **Importar**: descargar plantilla, llenar 3 filas (una con error: sin nombre o precio "abc", una con marca nueva y categoría "Refrigeración > Compresores"), subir → revisar errores → "Aplicar" → ver productos → "Deshacer" → los productos desaparecen y el kardex muestra `initial` + ajuste de salida.
9. Como vendedor: `/productos` y el detalle sin costos ni botones; `/productos/nuevo` redirige a `/sin-acceso`.

## 5. Pruebas automatizadas

- Dominio (Vitest, junto al código): `sku.test.ts`, `barcodes.test.ts` (verificador EAN-13/UPC, generador, ida y vuelta de secuencia, detección de tipo), `search-text.test.ts`, `pricing.test.ts` (sugerencia técnico, margen), `import-rows.test.ts` (encabezados, parsers, categorías por ruta/ambiguas, validación de filas). 25 pruebas.
- Integración `tests/catalog.test.ts` (`createTestDb()`, se salta con `SKIP_DB_TESTS`; crea su propia base: sucursal, almacén, unidad, impuesto, listas, motivo, usuario, categoría): crear con stock inicial (movimiento `initial`, existencia 5, precios PUBLIC/TECH 25 y 22,50, historial, costo, `search_text`, `stock_settings`), `searchProducts` por número de parte, equivalencia y código de barras; historial al cambiar precio y SKU personalizado único; códigos internos consecutivos y únicos por producto; soft-delete vs desactivar; importar un Excel real (2 válidas, 1 con error) y deshacerlo (soft-delete + `adjust_out`, trabajo `undone`). 5 pruebas.
- Humo `scripts/smoke-catalog.ts` (`createSession()`): abre `/productos`, `/productos/nuevo`, `/productos/categorias`, `/productos/etiquetas`, `/productos/importar`, crea un producto por la capa de aplicación, abre su detalle, edición, búsqueda y etiquetas, y verifica PDF (rollo y A4), plantilla, exportación y PNG de código; al final elimina el producto.

Resultado en esta máquina: `pnpm exec vitest run src/modules/catalog tests/catalog.test.ts` → 30/30; `pnpm exec tsx scripts/smoke-catalog.ts` → todo PASS; `pnpm exec eslint` sobre `src/modules/catalog`, `src/app/(app)/productos`, `src/app/api/products` → sin errores ni avisos. Suite completa `pnpm test`: 132/133 (falla `tests/reporting.test.ts` del paquete E, ajena al catálogo). `pnpm typecheck`: sin errores en el catálogo; fallan archivos de otros paquetes (ver sección 7).

## 6. Pendientes conocidos

- El recorte de fondo no tiene prueba automatizada (necesita navegador): probar en un celular real. Requiere internet la primera vez (modelo desde el CDN de img.ly, licencia AGPL, uso interno).
- Un producto eliminado (soft) conserva su SKU: si se reimporta el mismo SKU personalizado, la validación lo rechaza ("ya existe"); dejar la columna SKU vacía para que se genere uno nuevo.
- Las etiquetas usan Helvetica de react-pdf (sin fuente propia); nombres largos se truncan a 44 caracteres. En A4 imprimir al 100 %.
- "Ver kardex completo" enlaza a `/inventario/movimientos?product=<id>` (paquete B); hasta que exista dará 404.
- Exportación limitada a 5000 filas. El buscador de etiquetas devuelve 15 resultados.
- El escáner de cámara (html5-qrcode) necesita HTTPS o localhost y permiso de cámara; los lectores USB funcionan como teclado en los mismos campos.

## 7. Cambios solicitados en archivos compartidos o esquema

- `.gitignore`: agregué `/storage-test/` (las pruebas de importación guardan archivos ahí vía `LOCAL_STORAGE_DIR` de `.env.test`). Es el único archivo fuera de mi alcance que toqué.
- `scripts/smoke.ts`: agregar las rutas `/productos/nuevo`, `/productos/categorias`, `/productos/etiquetas`, `/productos/importar` o invocar `scripts/smoke-catalog.ts` desde la verificación general.
- `docs/05-progreso.md`: marcar "Productos" como Listo (no lo edité por ser compartido).
- Esquema (sugerencias, no bloqueantes, no se generaron migraciones):
  - `CREATE SEQUENCE product_sku_seq` y otra para códigos internos evitarían el bloqueo consultivo y el `max()`.
  - Índice único parcial `product_barcodes (product_id) WHERE type = 'INTERNAL'` y `product_images (product_id) WHERE is_primary` como garantía en base.
  - `import_jobs.file_path` NOT NULL obliga a insertar con valor vacío y actualizar tras guardar el archivo; podría ser nullable.
- Fallas preexistentes fuera del catálogo detectadas al verificar: `pnpm typecheck` → `src/modules/sales/ui/pos/pos-screen.tsx` (`persist` en `CartStore`) y `scripts/gen-icons.ts` (falta `sharp`); `pnpm lint` → errores `react-hooks/set-state-in-effect` en `src/modules/sales/ui/pos/*`; `pnpm test` → `tests/reporting.test.ts` ("cash.open"). No se tocaron.
