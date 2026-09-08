@echo off
title La Principal 2050 - servidor local de emergencia
cd /d "%~dp0"
echo ============================================================
echo  La Principal 2050 - servidor local de emergencia
echo  Usa la base de datos y los archivos de Supabase (produccion).
echo  Sirve para seguir vendiendo si Vercel no responde.
echo ============================================================
echo.
if not exist ".env.production.local" (
  echo ERROR: falta el archivo .env.production.local con las claves de Supabase.
  pause
  exit /b 1
)
echo Construyendo la aplicacion, tarda 2 o 3 minutos...
call pnpm build
if errorlevel 1 (
  echo.
  echo ERROR al construir la aplicacion. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do if not defined IP set "IP=%%a"
set "IP=%IP: =%"
set "APP_URL=http://%IP%:3000"
set "NODE_ENV=production"
echo.
echo ============================================================
echo  Listo. Abre la app en:
echo    En esta PC:            http://localhost:3000
echo    En celulares y tablet: http://%IP%:3000  (misma red Wi-Fi)
echo  Si Windows pregunta por el firewall, permite el acceso.
echo  Deja esta ventana abierta. Ctrl+C para detener.
echo ============================================================
echo.
call pnpm start -p 3000 -H 0.0.0.0
pause
