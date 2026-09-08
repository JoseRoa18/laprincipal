# Reporte — Fotos de catálogo: acabado de estudio y "Estilo catálogo con IA"

Fecha: 2026-09-08. Módulo `src/modules/catalog`, rutas `/productos/**`. Complementa `docs/reportes/catalogo.md` (sección 3, pipeline de fotos).

Pedido del dueño: "la IA debe mejorar la foto: que parezca una foto totalmente sacada de catálogo, siempre en fondo blanco". Se entregaron dos niveles:

1. **Acabado de estudio** (siempre activo, en el navegador, sin clave ni costo): después del recorte de fondo que ya existía, la foto queda con fondo blanco puro, encuadre uniforme, colores corregidos, borde limpio y una sombra de contacto suave.
2. **Estilo catálogo con IA** (opcional, en el servidor, Google Gemini): genera una foto de catálogo a partir de la original y la deja en el mismo formato; el usuario compara antes y después y puede volver al recorte cuando quiera.

## 1. Qué cambió

### Nivel 1 — Acabado de estudio (navegador)

`src/modules/catalog/ui/photo-pipeline.ts` (`compositeOnWhite`) ahora hace, tras `@imgly/background-removal`:

| Paso | Detalle | Parámetros |
|---|---|---|
| Limpieza de máscara | Se eliminan las "islas" (manchas sueltas) de menos del 0,5 % del área visible, con componentes conexos 4-vecinos. | `MIN_ISLAND_FRACTION = 0.005` |
| Borde sin halo | Erosión de 1 px (quita el anillo exterior donde se cuela el fondo viejo) y difuminado de 1–2 px del alfa (dos pasadas de caja radio 1 ≈ gaussiana de 1 px). | `erodeAlpha(1)`, `featherAlpha(1, 2)` |
| Auto-niveles | Histograma de luminancia de los píxeles sólidos del repuesto (alfa ≥ 250); percentiles 1 %–99 % → 0–255 con ganancia máxima 1,6 (no se estiran fotos planas ni con menos de 100 px). Misma LUT para R, G y B (no cambia el tono). | `levelsFromHistogram` |
| Balance de blancos | Gris-mundo suave: medias por canal → ganancias limitadas a ±10 % y fuerza 0,5; se desvanece cuando el repuesto es de color (croma > 20, nulo desde 60) para no desaturar carcasas rojas o azules. | `grayWorldGains` |
| Saturación | +8 % alrededor de la luma. | `SATURATION_BOOST = 1.08` |
| Nitidez | Máscara de desenfoque suave (cantidad 0,4, radio 1, umbral 3) con desenfoque ponderado por alfa: el borde no se contamina con el fondo transparente. | `unsharpMask` |
| Encuadre | Lienzo 1200 × 1200 blanco `#FFFFFF`; el lado mayor del repuesto ocupa el 82 % del lado (margen uniforme de 9 %). | `CATALOG_FILL = 0.82` |
| Sombra de contacto | Elipse suave (gradiente radial escalado, sin `filter`, funciona en todos los navegadores) centrada bajo el repuesto, ancho 46 % del objeto, opacidad 0,18. Se puede apagar con el interruptor "Sombra suave bajo la pieza" en cada foto (se recompone en menos de un segundo a partir del recorte guardado en memoria). | `SHADOW_OPACITY = 0.18` |
| Salida | WebP calidad 0,85 (JPEG si el navegador no codifica WebP) + miniatura 300 × 300, como antes. | |

Rendimiento: todo se calcula sobre el recorte del repuesto (no sobre el cuadro completo), a un máximo de 1600 px, con `OffscreenCanvas` cuando existe y `HTMLCanvasElement` como respaldo. En una foto típica de celular tarda menos de un segundo después del recorte.

La matemática pura vive en `src/modules/catalog/domain/photo-math.ts` (sin DOM) con 26 pruebas en `photo-math.test.ts`: caja envolvente, islas, erosión y difuminado, percentiles y LUT, gris-mundo (neutro, cálido, colorido, tope), saturación, desenfoque de caja y nitidez (bordes y transparencia), encuadre y geometría de la sombra.

### Nivel 2 — Estilo catálogo con IA (Gemini, servidor)

| Archivo | Qué hace |
|---|---|
| `src/modules/catalog/infrastructure/gemini-image.ts` | Cliente REST mínimo de `POST /v1beta/models/gemini-2.5-flash-image:generateContent` (clave en el encabezado `x-goog-api-key`, imagen como `inline_data`, `generationConfig.responseModalities: ["IMAGE"]`, tiempo máximo 90 s). Funciones puras `buildImageRequest`, `parseImageResponse` (acepta `inlineData` e `inline_data`, detecta bloqueos por seguridad) y `messageForHttpError` (mensajes en español para clave inválida, sin permiso, modelo no disponible, cuota 429, caída 5xx). Pruebas con `__fixtures__/gemini-image-response.json`. |
| `src/modules/catalog/infrastructure/sharp-image.ts` | Carga `sharp` en tiempo de ejecución (`loadSharp`) y normaliza la imagen generada: recorta los márgenes blancos, escala el repuesto al 82 % del lado, lo centra en 1200 × 1200 blanco, WebP q85, y miniatura 300 × 300. |
| `src/modules/catalog/domain/photo-paths.ts` | Convención de rutas en Storage (ver abajo) y `isAiImagePath`. |
| `src/modules/catalog/application/photo-ai.ts` | Casos de uso: `isAiPhotoEnabled`, `generateCatalogPhoto` (Gemini + sharp + auditoría `product.photo.ai`), `enhanceProductImageWithAi(imageId)`, `applyAiImage` (guarda y muestra la versión IA, auditoría `product.photo.ai_apply`), `revertAiImage` ("Volver al recorte", auditoría `product.photo.ai_revert`). |
| `src/app/(app)/productos/actions.ts` | Acciones `enhancePhotoWithAiAction(imageId)`, `enhanceDraftPhotoWithAiAction(formData)` (foto aún no subida, formulario de alta), `applyAiPhotoAction(formData)`, `revertAiPhotoAction(imageId)`. `uploadProductPhotoAction` acepta además `choice=ai` con `ai` y `aiThumb`. |
| `src/modules/catalog/ui/product-gallery.tsx` | Botón "Estilo catálogo con IA" (solo con la función activada), estado "Generando foto de catálogo…" (10–20 s), comparación Actual / Con IA con "Usar esta" y "Conservar la anterior", aviso "La IA puede alterar detalles; revisa que el repuesto sea idéntico", insignia "Catálogo con IA" y botón "Volver al recorte" (con confirmación). |
| `src/modules/catalog/ui/photo-capture.tsx` | Lo mismo en la vista previa de captura (alta y "Agregar foto"): la comparación se hace antes de subir y la foto aceptada con IA se sube con el recorte incluido. |

Flujo y almacenamiento (bucket `product-photos`):

```
products/<productId>/<imageId>-original.jpg           original reducida
products/<productId>/<imageId>-processed.webp|jpg     recorte con acabado de estudio (nunca se sobreescribe)
products/<productId>/<imageId>-thumb.webp|jpg         miniatura del recorte
products/<productId>/<imageId>-ai-<sello>.webp        versión IA (sello base36 → URL nueva en cada generación)
products/<productId>/<imageId>-ai-<sello>-thumb.webp  su miniatura
```

- Generar no guarda nada: la acción devuelve la imagen (base64) para la comparación. "Usar esta" la sube y cambia `processed_path` y `thumb_path` de la fila `product_images` a los archivos `-ai-…`; el estado pasa a `processed`. "Conservar la anterior" no toca el servidor.
- "Volver al recorte" busca `-processed.webp|jpg|png` y `-thumb.*`, vuelve a apuntar la fila (o a `original_only` si la foto nunca tuvo recorte) y borra los archivos IA. Regenerar sobre una foto que ya tenía IA borra la versión IA anterior. Eliminar la foto borra todas las variantes.
- No hizo falta cambiar el esquema: la versión activa se reconoce por el nombre del archivo (`isAiImagePath`) y `ProductImageView.isAi` la expone a la interfaz.
- Auditoría: `product.photo.ai` (modelo, milisegundos, bytes de entrada y salida, `finishReason`), `product.photo.ai_apply` y `product.photo.ai_revert` con `before`/`after` de la fila.

Sobre `sharp`: no es dependencia directa del proyecto; viene como dependencia opcional de Next y con pnpm solo se resuelve desde la carpeta de Next. `loadSharp()` lo carga con `createRequire` primero desde la raíz del proyecto (si algún día se ejecuta `pnpm add sharp`) y después desde la ubicación real de Next. Si no está, la acción responde "El servidor no tiene la librería de imágenes (sharp)…" antes de llamar a Gemini (no se gasta la llamada). Recomendación para producción: `pnpm add sharp` (lo deja explícito y garantiza que Vercel lo incluya).

## 2. Cómo activar el modo IA

1. Crear una clave en https://aistudio.google.com/apikey (con un proyecto de Google Cloud con facturación para no depender del nivel gratuito).
2. Local: en `.env.local` agregar `GEMINI_API_KEY=<clave>` (ver `.env.example`). Como el servidor de desarrollo lee la variable al arrancar, reiniciar `pnpm dev`.
3. Vercel: Project → Settings → Environment Variables → `GEMINI_API_KEY` en Production (y Preview si se quiere), luego "Redeploy". La clave se lee en cada llamada con `process.env`, no está en el esquema Zod de `src/lib/env.ts` (archivo compartido); sin la variable la función queda desactivada y los botones no aparecen.
4. Las páginas `/productos/[id]`, `/productos/[id]/editar` y `/productos/nuevo` exportan `maxDuration = 60` para que la acción (10–20 s) no se corte en Vercel.
5. Si al usarlo aparece "El servidor no tiene la librería de imágenes (sharp)", ejecutar `pnpm add sharp` y volver a desplegar.

## 3. Costos

- Modelo `gemini-2.5-flash-image`: cada imagen generada cuesta unos 1 290 tokens de salida (US$ 30 por millón) ≈ **US$ 0,04 por foto**, más la imagen de entrada (~260 tokens, menos de US$ 0,001). Diez fotos al día son unos US$ 12 al mes.
- Cada clic en "Estilo catálogo con IA" es una llamada facturable aunque después se elija "Conservar la anterior"; la comparación existe para decidir antes de guardar, no antes de pagar.
- El nivel gratuito de AI Studio puede limitar o no incluir generación de imágenes; el error 429 se muestra como "Se alcanzó el límite de uso de la IA (cuota)…".
- El acabado de estudio (nivel 1) no tiene costo: se calcula en el celular o la PC.

## 4. Cómo probar

Manual (celular o PC):

1. Productos → Nuevo producto → Tomar foto / Subir foto. Al terminar el recorte se ve "Acabado de estudio" y la vista "Mejorada": fondo blanco puro, repuesto centrado con margen uniforme, sombra suave. Probar el interruptor "Sombra suave bajo la pieza" (recompone al instante). "Usar mejorada" / "Conservar original" / "Repetir" como antes.
2. Con `GEMINI_API_KEY` configurada aparece "Estilo catálogo con IA" en la vista previa y en la galería del detalle. Pulsarlo → "Generando foto de catálogo…" → comparación con el aviso → "Usar esta" o "Conservar la anterior".
3. En el detalle, una foto con IA muestra la insignia "Catálogo con IA" y "Volver al recorte" (confirmación). "Ver original" sigue abriendo la foto original.
4. Sin clave: no hay botones; el resto del flujo funciona igual.

Automático:

- `pnpm exec vitest run src/modules/catalog tests/catalog-photos.test.ts`: dominio (`photo-math`, `photo-paths`), cliente Gemini con fixture, post-proceso con sharp (se salta si sharp no carga) e integración con base y Storage local (subida con versión IA junto al recorte, volver al recorte, aplicar y regenerar borrando la anterior, foto solo original, rechazo sin versión IA, mensaje de función desactivada sin clave, borrado de todas las variantes).
- `pnpm exec tsx scripts/smoke-photo-ai.ts [baseUrl]` con el servidor corriendo: sharp en Node, post-proceso 1200 × 1200, producto y foto por la capa de aplicación, mensaje de función desactivada sin `GEMINI_API_KEY` (capa de aplicación y acción real por HTTP con el encabezado `next-action`), aplicar una versión IA y verificar que `/api/files` la sirve, "Volver al recorte" por la acción y borrado del archivo. Limpia lo que crea.
- `pnpm exec tsx scripts/smoke-catalog.ts [baseUrl]` sigue pasando.
- La llamada real a Gemini no está cubierta (necesita clave y cuesta dinero): el cliente REST está probado con fixtures de respuesta correcta, bloqueada, vacía y errores HTTP.

Resultado en esta máquina (2026-09-08), ver también la sección 6:

- `pnpm typecheck`: sin errores. `pnpm lint`: 0 errores (2 avisos preexistentes de `react-hooks/incompatible-library` en `cash` y `customers`, ajenos a fotos). `pnpm test`: 28 archivos, 179/179 pruebas (incluye 42 nuevas de dominio/cliente Gemini/sharp y 4 de integración de fotos).
- El servidor de desarrollo en :3000 quedó en un estado roto de Turbopack ("module factory is not available" en toda la capa `[app-route]`, desde las 14:25, antes de estos cambios) y no se puede reiniciar desde este trabajo. Para verificar de punta a punta se hizo `pnpm build` (Turbopack, con las variables de `.env.local` forzadas en el entorno para no tocar Supabase) y `next start -p 3001` con la base y el Storage locales: `scripts/smoke-catalog.ts http://localhost:3001` → todo PASS; `scripts/smoke-photo-ai.ts http://localhost:3001` → todo PASS (sharp, post-proceso, foto guardada, mensaje sin clave por capa de aplicación y por la acción real vía HTTP, versión IA aplicada y servida, "Catálogo con IA" en el detalle, "Volver al recorte" vía HTTP y archivo borrado). Con una ruta temporal (ya eliminada) se comprobó además que `loadSharp()` carga sharp dentro del servidor empaquetado por Turbopack (`{"ok":true,"versions":{...}}`).
- Durante el trabajo, el agente de responsividad guardó `src/modules/catalog/ui/product-form.tsx` con dos comentarios JSX dentro de `map(() => ( … ))` (error de sintaxis que rompía `tsc` y el build); se movieron los dos comentarios una línea arriba, fuera del `map`, sin cambiar nada más.

## 5. Pendientes y riesgos

- **Gemini no probado con clave real.** El formato de la petición sigue la documentación de `generateContent` para `gemini-2.5-flash-image`; si Google cambia el nombre del modelo, basta con editar `GEMINI_IMAGE_MODEL` en `gemini-image.ts`. Conviene probar 3 o 4 repuestos reales y revisar que no altere números de parte ni conectores (por eso el aviso en la interfaz y la comparación antes de guardar).
- La IA se aplica desde la foto original (no desde el recorte) para que el modelo tenga el contexto completo; si el resultado trae fondo no blanco, sharp lo "aplana" sobre blanco pero no lo recorta.
- El nivel gratuito de Gemini puede no incluir generación de imágenes; con facturación activa no hay límite práctico para este volumen.
- El recorte de fondo en el navegador sigue sin prueba automatizada (necesita navegador real); el acabado de estudio sí está cubierto en su parte matemática. Probar en un celular real: tiempo total y aspecto de la sombra con repuestos redondos o muy alargados.
- Encuadre al 82 % sin tope de ampliación: una foto tomada de muy lejos se amplía y puede verse pixelada; es preferible repetir la foto más cerca.
- `docs/05-progreso.md` (compartido) no se editó: anotar allí que las fotos tienen acabado de estudio y modo IA opcional.

## 6. Verificación y archivos tocados

Comandos ejecutados: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec tsx scripts/smoke-catalog.ts`, `pnpm exec tsx scripts/smoke-photo-ai.ts` (resultados al final de esta sección).

Archivos nuevos: `src/modules/catalog/domain/photo-math.ts` (+ `.test.ts`), `domain/photo-paths.ts` (+ `.test.ts`), `infrastructure/gemini-image.ts` (+ `.test.ts`, `__fixtures__/gemini-image-response.json`), `infrastructure/sharp-image.ts` (+ `.test.ts`), `application/photo-ai.ts`, `tests/catalog-photos.test.ts`, `scripts/smoke-photo-ai.ts`, este reporte.

Archivos de fotos modificados: `ui/photo-pipeline.ts`, `ui/photo-capture.tsx`, `ui/product-gallery.tsx`, `application/images.ts` (acepta `ai`/`aiThumb`, borra todas las variantes al eliminar), `src/app/(app)/productos/actions.ts`.

Cambios mínimos fuera de los archivos de fotos (todos aditivos):

- `src/modules/catalog/infrastructure/product-detail.ts`: campo `isAi` en `ProductImageView`.
- `src/modules/catalog/ui/product-form.tsx`: prop opcional `aiPhotosEnabled` que se pasa a `PhotoCapture`.
- `src/app/(app)/productos/[id]/page.tsx`, `[id]/editar/page.tsx`, `nuevo/page.tsx`: prop `aiEnabled` / `aiPhotosEnabled` con `isAiPhotoEnabled()` y `export const maxDuration = 60`.
- `.env.example`: bloque comentado `GEMINI_API_KEY` con enlace y costo.
- `docs/reportes/catalogo.md`: enlace a este reporte en la sección 3.

Sin dependencias nuevas, sin migraciones, sin cambios en `src/lib/*`, `src/db/schema/*` ni componentes compartidos.
