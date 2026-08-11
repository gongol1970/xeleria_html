@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Obtener customerId de MiCorreo para XelerIA
cls

echo ============================================================
echo   OBTENER EL customerId DE MiCorreo PARA XelerIA
echo ============================================================
echo.
echo Este asistente NO configura XelerIA.
echo No solicita ni envia usuario, clave, credenciales API o token.
echo Solo abre el sitio oficial de MiCorreo y prepara el numero
echo de cuenta que vos ves en tu propia sesion.
echo.
echo En MiCorreo encontra el ID en uno de estos lugares:
echo   - Margen superior izquierdo del panel.
echo   - Mi Cuenta ^> Mi Perfil ^> Informacion de la cuenta
echo     ^> Datos de facturacion.
echo.
echo Se abrira ahora el portal oficial de MiCorreo.
echo Inicia sesion directamente alli. Este BAT no ve tu acceso.
echo.

start "" "https://www.correoargentino.com.ar/MiCorreo/public"

echo Cuando tengas visible el ID de cliente, copialo.
pause

powershell.exe -NoLogo -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$id=(Read-Host 'Pega aqui el ID de cliente de MiCorreo').Trim();" ^
  "if($id -notmatch '^\d{1,32}$'){Write-Host 'El ID debe contener solamente numeros (hasta 32 digitos).' -ForegroundColor Red; exit 2};" ^
  "$desktop=[Environment]::GetFolderPath('Desktop');" ^
  "$output=Join-Path $desktop 'Datos_para_XelerIA_MiCorreo.txt';" ^
  "$lines=@('DATO PARA CONFIGURAR MiCorreo EN XelerIA','',('customerId='+$id),'','Este archivo no contiene usuario, clave ni token.','Copia solamente el numero indicado como customerId.');" ^
  "[IO.File]::WriteAllLines($output,$lines,(New-Object Text.UTF8Encoding($false)));" ^
  "Set-Clipboard -Value $id;" ^
  "Write-Host ''; Write-Host ('customerId: '+$id) -ForegroundColor Green;" ^
  "Write-Host ('Tambien quedo copiado al portapapeles y guardado en: '+$output);"

if errorlevel 1 goto :error

echo.
echo Listo. Ahora pega ese customerId en Configuracion de XelerIA.
echo Este asistente no envio ningun dato a XelerIA.
echo.
pause
exit /b 0

:error
echo.
echo No se genero ningun archivo. Volve a ejecutar el BAT e ingresa
echo solamente el numero de ID que muestra MiCorreo.
echo.
pause
exit /b 1
