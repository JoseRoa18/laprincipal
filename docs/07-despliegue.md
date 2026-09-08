# Despliegue en Supabase y Vercel

> **Estado (2026-09-08):** ya desplegado. Proyecto Supabase `kkgsfyfncuftnrbjqcvh` (us-east-1), proyecto Vercel `laprincipal` conectado a GitHub `JoseRoa18/laprincipal`, URL de producción https://laprincipal.vercel.app. Los pasos siguientes documentan cómo se hizo y cómo repetirlo.

Guía paso a paso para poner la app en producción. Tiempo estimado: 30 minutos la primera vez.

## 1. Supabase (base de datos y archivos)

1. Crear cuenta en https://supabase.com e iniciar un proyecto nuevo: nombre `la-principal-2050`, región **East US (North Virginia)**, contraseña de base de datos fuerte (guardarla).
2. En **Project Settings → Database → Connection string** copiar dos cadenas:
   - **Transaction pooler** (puerto 6543) → será `DATABASE_URL`.
   - **Session / directa** (puerto 5432) → será `DIRECT_URL`.
   Reemplazar `[YOUR-PASSWORD]` por la contraseña del paso 1.
3. En **Project Settings → API** copiar `Project URL` → `SUPABASE_URL` y la clave `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (nunca se expone al navegador).
4. En **Storage** crear dos buckets:
   - `product-photos`: marcado como **público**.
   - `documents`: privado.
5. Aplicar migraciones y datos base desde la PC (una sola vez), con las variables de producción en un archivo temporal `.env.production.local`:

```bash
# en C:\Users\josei\OneDrive\Documentos\Empresa
DATABASE_URL="<pooler 6543>" DIRECT_URL="<directa 5432>" pnpm db:migrate
DATABASE_URL="<pooler 6543>" ADMIN_EMAIL="tu@correo.com" ADMIN_PASSWORD="ContraseñaFuerte" pnpm db:seed
```

   En PowerShell: `$env:DATABASE_URL="..."; $env:DIRECT_URL="..."; pnpm db:migrate` y luego `pnpm db:seed` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

6. Plan: la organización está en **Pro** (25 US$/mes más unos 10 US$/mes de cómputo por proyecto; el plan incluye 10 US$ de crédito). Incluye respaldos diarios con 7 días de retención y el proyecto no se pausa. Además la app guarda un respaldo semanal en Storage y permite exportar. Spend cap activado: sin cargos sorpresa.

## 2. GitHub (código)

1. Crear un repositorio privado `la-principal-2050`.
2. Desde la PC: `git remote add origin <url>` y `git push -u origin main`.
3. Cada `push` a `main` corre las verificaciones de `.github/workflows/ci.yml` y despliega en Vercel.

## 3. Vercel (aplicación)

1. En https://vercel.com importar el repositorio de GitHub. Framework: Next.js (detectado). Región de funciones: **Washington, D.C. (iad1)**.
2. **Environment Variables** (Production y Preview):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | pooler de Supabase (6543) |
| `DIRECT_URL` | conexión directa (5432) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `PIN_COOKIE_SECRET` | otro valor aleatorio |
| `CRON_SECRET` | otro valor aleatorio (protege las tareas programadas) |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | clave service_role |
| `APP_TIMEZONE` | `America/Caracas` |
| `APP_URL` | `https://<tu-dominio>.vercel.app` |
| `NODE_ENV` | `production` (Vercel lo fija) |

3. **Build Command**: `pnpm db:migrate && pnpm build` (aplica migraciones pendientes antes de construir). Install Command: `pnpm install`.
4. Desplegar. Las tareas programadas de `vercel.json` (estadísticas diarias 03:00 Caracas, respaldo semanal) se activan solas en el plan Hobby con frecuencia diaria máxima.
5. Abrir la URL, iniciar sesión con el usuario admin creado en la semilla y cambiar la contraseña en **Configuración → Mi cuenta**.

## 4. Dominio propio (opcional)

En Vercel → Settings → Domains agregar `app.laprincipal2050.com` (o el que se compre) y crear el registro CNAME indicado en el proveedor del dominio. Actualizar `APP_URL`.

## 5. Dispositivos del local

- PC del mostrador: Chrome o Edge, instalar la app desde el icono "Instalar" de la barra de direcciones (PWA). Configurar la impresora térmica como predeterminada en Windows y desactivar márgenes en el diálogo de impresión.
- Celulares: abrir la URL en Chrome (Android) o Safari (iPhone) y "Agregar a pantalla de inicio".
- Escáner USB: funciona como teclado; no requiere configuración.

## 6. Actualizaciones

Cada cambio se prueba en local (`pnpm dev`), se sube a GitHub y Vercel despliega en 2 o 3 minutos. Si una migración falla, Vercel no publica la versión nueva y la anterior sigue activa.
