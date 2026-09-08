# Reporte — Paquete D: Caja, clientes y configuración

Fecha: 2026-09-08. Alcance: `src/modules/cash` (excepto `application/session.ts`), `src/modules/customers`, `src/modules/settings`, `src/modules/auth/{domain,infrastructure,ui}`, `/caja/**`, `/clientes/**`, `/configuracion/**`, `/api/backups/**`, `/api/cron/backup`, pruebas y humo del paquete.

---

## 1. Qué se construyó

### 1.1 Caja (`/caja`, roles admin y vendedor)

| Ruta | Qué hace |
|---|---|
| `/caja` | Sin sesión abierta: formulario **Abrir caja** con fondo inicial por moneda de efectivo (USD y COP: monedas con un método de pago activo que cuenta en gaveta) y notas. Con sesión abierta: tarjetas (tiempo abierta con reloj en vivo, cobrado neto en USD, efectivo esperado por moneda), tabla de totales por método y moneda (pagos, cobrado, devuelto, equivalente USD) y sección **Ingresos y retiros** con diálogos "Ingreso" / "Retiro". Botón **Cerrar caja**; el administrador ve además **Historial**. |
| `/caja/cerrar` | **Conteo ciego** por moneda: el esperado y la diferencia solo aparecen al escribir el conteo. Ayudante opcional "Contar por billetes" (USD 1/5/10/20/50/100, COP 2.000…100.000) que suma al conteo. Sección de pagos electrónicos con totales por método, casilla "conciliado" y lista desplegable de referencias (hora, venta, método, referencia, monto). Justificación obligatoria cuando la diferencia no es cero (también validado en el servidor). Notas de cierre. Al cerrar redirige a `/caja/historial/<id>`. Si no hay caja abierta redirige a `/caja`. |
| `/caja/historial` | Solo admin. Lista paginada: número, apertura (fecha y quién), cierre, estado y diferencias por moneda ("Cuadró" o montos con color). |
| `/caja/historial/[id]` | Admin y vendedor. Reporte de cierre imprimible (encabezado con empresa, totales, efectivo por moneda con fondo/ventas/cambio/devoluciones/ingresos/retiros/esperado/contado/diferencia y justificaciones, totales por método con conciliado, referencias electrónicas, movimientos, notas, líneas de firma). Botón **Imprimir cierre** (CSS de impresión que oculta barra lateral, cabecera y navegación). Si la sesión sigue abierta muestra totales en vivo. Botón **Reabrir** (solo admin, solo la última sesión y sin otra abierta). |

Cálculo: `src/modules/cash/domain/summary.ts` (puro, con pruebas) — esperado por moneda = fondo + ventas en efectivo − cambio entregado − devoluciones en efectivo + ingresos − retiros; totales por método (pagos y reembolsos); totales de la sesión. `src/modules/cash/application/session-summary.ts` (`getSessionSummary(sessionId)`) lee `sale_payments` + `sales` (`cash_session_id` = sesión, `status <> 'voided'`), `sales.change_currency_code/change_amount`, `sale_returns` (`cash_session_id`, `status = 'completed'`, `refund_*`) y `cash_movements`.

Transacciones (`src/modules/cash/application/open-close.ts`): `openCashSession` (número `nextDocumentNumber("cash_session")`, una fila en `cash_session_balances` por moneda de efectivo, índice parcial + comprobación previa contra dobles aperturas), `addCashMovement` (bloquea la sesión `FOR UPDATE`, rechaza retiros mayores al efectivo esperado, `authorized_by`), `closeCashSession` (persiste `sales_cash`, `change_given`, `refunds_cash`, `movements_in/out`, `expected`, `counted`, `difference`, `justification` y `closing_summary` con totales por método, conteos por billete, casillas de conciliación y referencias), `reopenCashSession`. Todo con auditoría (`cash_session.open/close/reopen`, `cash_movement.in/out`). Retiros hechos por un vendedor exigen elegir un administrador y su PIN (`verifyUserPin`), que queda como `authorized_by`.

Archivos: `src/modules/cash/{domain/summary.ts, domain/summary.test.ts, domain/denominations.ts, domain/forms.ts, application/session-summary.ts, application/open-close.ts, infrastructure/queries.ts, ui/*}`, `src/app/(app)/caja/{page.tsx, loading.tsx, actions.ts, cerrar/page.tsx, historial/page.tsx, historial/[id]/page.tsx}`.

### 1.2 Clientes (`/clientes`, roles admin y vendedor)

- Lista con búsqueda por nombre (sin acentos), documento o teléfono, filtros Todos / Público / Técnico, "Ver inactivos", paginación en servidor, estados vacío y sin resultados.
- `/clientes/nuevo` y `/clientes/[id]/editar`: tipo (persona/empresa), documento (V, E, J, G, P, sin documento), número, nombre, teléfono, correo, dirección, tipo de cliente (público/técnico: al elegir técnico se preselecciona la lista TECH, editable), lista de precios, notas, activo. Documento duplicado → mensaje amable bajo el campo (índice único parcial de la base).
- `/clientes/[id]`: datos, resumen de compras (total, cantidad, última compra), historial de ventas (enlaza a `/ventas/[id]`) y cotizaciones (enlaza a `/cotizaciones/[id]`), Editar, Desactivar/Activar.
- Para el POS: `createCustomer(input, userId?)` y `searchCustomers(q, limit)` en `src/modules/customers/application/customers.ts` (funciones planas, sin `"use server"`); `searchCustomersAction` en `src/app/(app)/clientes/actions.ts`.

Archivos: `src/modules/customers/{domain/schema.ts, application/customers.ts, infrastructure/customers.ts, ui/customer-form.tsx}`, `src/app/(app)/clientes/{page.tsx, loading.tsx, actions.ts, nuevo/page.tsx, [id]/page.tsx, [id]/editar/page.tsx}`.

### 1.3 Configuración (`/configuracion`, admin; `mi-cuenta` para cualquier rol)

| Ruta | Contenido |
|---|---|
| `/configuracion` | Tarjetas a cada sección y aviso cuando falta la tasa de hoy. |
| `/configuracion/empresa` | Nombre, RIF, dirección, teléfono, correo y logo (se reduce en el navegador a 600 px y se guarda como WebP —PNG si el navegador no codifica WebP— en el bucket `product-photos`, ruta `company/logo.webp`). `saveSetting("company")` + auditoría. |
| `/configuracion/tasas` | Tasa del día "Bs por 1 USD" y "COP por 1 USD" con fecha (por defecto hoy, no futura); `upsertRate` + auditoría `rate.set`; historial por moneda con quién la cargó, insignia **vigente** y aviso cuando la tasa no es de hoy o falta. Enlazada desde la insignia de la cabecera y el inicio. |
| `/configuracion/impuestos` | CRUD de impuestos (nombre, tasa %, por defecto único, activo). |
| `/configuracion/metodos-de-pago` | Interruptores activo / requiere referencia / cuenta en gaveta / permite cambio, recargo % (IGTF), orden y nombre; crear métodos para monedas existentes. |
| `/configuracion/motivos` | CRUD de motivos de ajuste (nombre, tipo, activo, orden). |
| `/configuracion/unidades` | CRUD de unidades (nombre, símbolo, decimales); solo se borran si ningún producto las usa. |
| `/configuracion/series` | Prefijo, relleno y próximo número (solo hacia arriba, con confirmación) por tipo de documento. |
| `/configuracion/impresion` | Ancho 58/80 mm, pie de página, mostrar Bs / COP en el ticket. |
| `/configuracion/politicas` | Stock negativo, descuento máximo por rol, ventana de anulación, vigencia de cotizaciones, descuento técnico, margen sugerido, exigir tasa y caja abierta. Auditoría `policies.update`. |
| `/configuracion/usuarios` | Lista (nombre, correo, rol, estado, PIN, último acceso), crear (correo en minúsculas, rol, contraseña con confirmación, PIN 4–6 dígitos), editar (nombre, rol, activo: no puedes desactivarte ni dejar sin administrador activo), restablecer contraseña y PIN. `bcryptjs` `hash(pw, 10)`, auditoría `user.create/update` sin hashes. |
| `/configuracion/mi-cuenta` | Cualquier rol: ver rol, cambiar contraseña (actual + nueva + confirmación) y PIN. |
| `/configuracion/respaldos` | "Crear respaldo ahora" (JSON con 47 tablas —sin hashes de usuarios— en el bucket `documents`, `backups/<yyyy-MM-dd-HHmm>.json`, fila en `backups`), lista con **Descargar** (URL firmada 10 min), exportar a Excel productos / clientes / ventas. |

Rutas de API: `GET /api/backups/export?type=products|customers|sales` (sesión admin) y `GET /api/cron/backup` (`Authorization: Bearer $CRON_SECRET`, crea un respaldo `scheduled`).

Decisiones de los catálogos: impuestos y motivos nunca se borran (solo se desactivan) y el impuesto por defecto no puede desactivarse salvo eligiendo otro; los prefijos de series deben ser únicos (1–10 caracteres) y el próximo número se cambia con la fila bloqueada `FOR UPDATE`; en métodos de pago el código, tipo y moneda son inmutables tras crearlos, y apagar "cuenta en gaveta" apaga también "permite cambio"; las unidades solo se borran si ningún producto las usa. Los porcentajes se muestran en % y se guardan como fracción (`0.1600`).

Archivos: `src/modules/settings/{domain/forms.ts, domain/user-forms.ts, domain/catalog-forms.ts, application/*.ts, infrastructure/{catalogs,rates-history,backups}.ts, ui/*.tsx}`, `src/modules/auth/{domain/roles.ts, infrastructure/users.ts, ui/*}`, `src/app/(app)/configuracion/**`, `src/app/api/backups/export/route.ts`, `src/app/api/cron/backup/route.ts`.

### 1.4 Piezas compartidas añadidas (fuera de los módulos del paquete, solo archivos nuevos)

- `src/modules/core/ui/form-errors.ts` — `applyFieldErrors(result, setError)`: copia `error.details.fields` de una acción a los campos de react-hook-form.
- `src/modules/core/application/db-errors.ts` — `isUniqueViolation(err)`: detecta `23505` aunque Drizzle envuelva el error (`cause`).
- `src/modules/settings/infrastructure/settings.ts` — se agregó `getSettingUpdatedAt(key)` (cache-busting del logo). Sin cambios en las claves existentes.
- Regla aprendida y aplicada: los componentes cliente importan esquemas Zod solo desde `domain/*` (los módulos `application/*` arrastran `@/db/client` al bundle del navegador y la página responde 500).

---

## 2. Cómo probar a mano

Entrar con `admin@laprincipal2050.com` / `Admin2050*` (PIN 1234).

1. **Tasas**: Configuración → Tasas de cambio. Escribir "36,5" en Bs y "4.100" en COP, Guardar. La insignia de la cabecera cambia a "1 $ = Bs 36,50 · COP 4.100" y la fila aparece como **vigente**. Volver a guardar otro valor con la misma fecha: reemplaza (historial con quién y cuándo).
2. **Clientes**: Clientes → Nuevo cliente. Elegir Técnico: la lista pasa a "Técnico". Documento V + número, Guardar. Crear otro con el mismo documento → "Ya existe un cliente con ese documento" bajo el campo. Buscar por teléfono. Desactivar desde la ficha y usar "Ver inactivos".
3. **Abrir caja**: Caja → fondo 100 USD y 200.000 COP → Abrir caja. Aparecen las tarjetas (efectivo esperado igual al fondo) y el reloj.
4. **Movimientos**: Ingreso 10 USD "Sencillo" → esperado USD 110. Retiro 500 USD → error "No hay suficiente efectivo". Como vendedor (crear uno en Usuarios y entrar en otra ventana), un retiro pide administrador + PIN 1234.
5. **Ventas** (cuando el POS esté disponible): vender con Efectivo USD, Zelle y Pago Móvil; los totales por método y el efectivo esperado se actualizan en `/caja`.
6. **Cerrar caja**: Caja → Cerrar caja. Escribir el conteo en USD (o "Contar por billetes"): aparece esperado y diferencia. Escribir en COP un monto distinto: la justificación se vuelve obligatoria. Marcar "conciliado" en Zelle. Cerrar caja → reporte de cierre; **Imprimir cierre**. Historial muestra la sesión con su diferencia; **Reabrir** vuelve a dejarla abierta (auditado) y `/caja` la muestra de nuevo.
7. **Empresa**: cambiar nombre y subir un logo PNG; el nombre cambia en la barra lateral, el logo se guarda en `storage/product-photos/company/logo.webp`.
8. **Usuarios / Mi cuenta**: crear un vendedor con PIN; entrar con él; en Mi cuenta cambiar contraseña y PIN; intentar desactivar al único administrador → mensaje de error.
9. **Respaldos**: Crear respaldo ahora → fila con tamaño y Descargar; Exportar a Excel → descarga `productos-<fecha>.xlsx`. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/backup` → respaldo programado (ver "Pendientes" sobre el proxy y `CRON_SECRET`).

---

## 3. Pruebas automatizadas

| Prueba | Cubre | Resultado |
|---|---|---|
| `src/modules/cash/domain/summary.test.ts` (11) | esperado por moneda (fondo + efectivo − cambio − devoluciones + ingresos − retiros), totales por método, totales de sesión, diferencia y justificación, ayudante de billetes | pasa |
| `tests/cash.test.ts` (5) | abrir sesión y rechazar la segunda; resumen en vivo con ventas, pagos mixtos, venta anulada ignorada, devolución en efectivo, devolución anulada ignorada, movimientos; retiro mayor al esperado; cierre con justificación obligatoria y diferencias persistidas (`closing_summary`); reabrir solo la última sesión | pasa |
| `tests/customers.test.ts` (4) | alta con lista por tipo, documento único (mismo número con otro tipo permitido), validación, búsqueda por nombre/teléfono/documento, filtros e inactivos, edición y limpieza del documento | pasa |
| `tests/settings.test.ts` (4) | `upsertRate` reemplaza el mismo día y conserva historial; usuario con correo en minúsculas y hashes (bcrypt + PIN verificable); protección del último administrador y de la propia cuenta; `saveSetting/getSetting` | pasa |
| `scripts/smoke-cash-settings.ts` | las 17 pantallas del paquete + `/caja/cerrar`, exportación Excel y rechazo del cron sin token | pasa |

Comandos ejecutados al cierre: `pnpm typecheck` (sin errores en los archivos del paquete; ver 4), `pnpm lint` (sin errores en el paquete; solo avisos de `react-hooks/incompatible-library` por `watch()` de react-hook-form), `pnpm test` (133 pruebas: todas las del paquete pasan; ver 4), `pnpm exec tsx scripts/smoke-cash-settings.ts`.

Los fixtures de integración (`tests/fixtures.ts`) crean sus propias monedas, series, listas, sucursal, almacén, caja (inactiva a propósito para no ser la "caja por defecto" de otros archivos de prueba), métodos de pago y usuarios, y borran lo que la base permite (los usuarios quedan desactivados porque `audit_logs` los referencia y es de solo inserción).

---

## 4. Pendientes conocidos

- **Conteo ciego a nivel de interfaz**: el esperado viaja al navegador y se oculta hasta escribir el conteo. Si se quiere ciego "de verdad", cambiar a una acción que devuelva el esperado solo después de registrar el conteo.
- **Montos en COP**: `parseLocalizedNumber("52.000")` interpreta el punto como decimal (52). Escribir sin separador de miles o con coma decimal ("52000" o "52.000,00"). Es el comportamiento del helper compartido.
- **Impresión**: el CSS oculta la barra lateral, cabecera y navegación por sus `data-slot`; se validó por código, no en un navegador.
- **Reabrir** descarta el conteo de cierre (queda en `audit_logs`, entrada `cash_session.reopen` con `before.closingSummary`).
- **`CRON_SECRET`** no está en `.env.local` (solo en `.env.example`): `/api/cron/backup` responde 500 "no configurado" hasta agregarlo.
- **Logo WebP**: se codifica con `canvas.toDataURL("image/webp")`; en navegadores sin soporte se guarda PNG (`company/logo.png`).
- Sin descarga automática de la tasa BCV (fuera del MVP).
- El estado en `docs/05-progreso.md` (Caja, Clientes, Configuración → listos) no se actualizó por ser un archivo compartido.

Estado de la verificación global (no atribuible al paquete):

- `pnpm typecheck`: `src/modules/sales/ui/pos/pos-screen.tsx` (`persist` en `CartStore`) y `scripts/gen-icons.ts` (módulo `sharp` no instalado) fallan en archivos de otros paquetes.
- `pnpm lint`: errores `react-hooks` en `src/modules/catalog/ui/*` y `src/modules/sales/ui/pos/*` (otros paquetes).
- `pnpm test` (última corrida: 132 de 133): `tests/reporting.test.ts` (`data.cash.open === false`) falla solo en la corrida completa porque `tests/sales.test.ts` abre sesiones en una caja activa que `getDefaultCashRegister()` puede elegir; pasa en aislamiento. El paquete D ya aisló su caja creándola inactiva. `tests/catalog.test.ts` falló en corridas anteriores por filas residuales (`El SKU LP-000001 ya existe`) en `lp2050_test` y pasa una vez limpiadas.

---

## 5. Cambios solicitados en archivos compartidos y esquema

Sin cambios de esquema. Sugerencias para archivos que no pertenecen al paquete:

1. `src/proxy.ts`: excluir `api/cron` del `matcher` (además de `api/auth`); hoy `GET /api/cron/backup` sin cookie se redirige a `/login` antes de llegar al handler, y Vercel Cron solo envía el encabezado `Authorization`.
2. `src/app/api/files/[bucket]/[...path]/route.ts`: reemplazar `storage instanceof LocalStorage` por `env.STORAGE_DRIVER === "local"`. En desarrollo `getStorage()` cachea la instancia en `globalThis` y cada grafo de Turbopack tiene su propia clase, así que la comprobación falla y las descargas firmadas (y las fotos) responden 404 tras una recarga.
3. `src/modules/core/application/context.ts`: `getDefaultCashRegister()` hace `limit 1` sin `orderBy`; conviene ordenar por `created_at` para que la caja por defecto sea determinista.
4. `scripts/smoke.ts`: agregar `/caja/cerrar`, `/caja/historial`, `/clientes/nuevo` y las 12 sub-rutas de `/configuracion` (ya cubiertas por `scripts/smoke-cash-settings.ts`).
5. `.env.local`: agregar `CRON_SECRET`.
6. `docs/05-progreso.md`: marcar Caja, Clientes y Configuración como listos y anotar los pendientes anteriores.
