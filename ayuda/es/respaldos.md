# Respaldos

BoldoAtlas guarda copias de tus datos en la carpeta **respaldos**, dentro de la carpeta de datos:

- **Portable:** `datos\respaldos\`, junto a `BoldoAtlas.exe`.
- **Instalado:** `%APPDATA%\io.github.mscottb.boldoatlas\respaldos\`.

Cada respaldo es un archivo `boldo-AAAAMMDD-HHMM.db` con la fecha y hora en que se hizo. Si se hacen dos en el mismo minuto, el segundo termina en `-2`.

## Respaldo automático

Al abrir la app, si el último respaldo tiene más de 24 horas, se hace uno nuevo en segundo plano: puedes seguir trabajando mientras tanto. En **Configuración › Respaldos** eliges cada cuánto: **Nunca**, **Cada vez** que se abre, **Cada 24 horas** (lo normal) o **Cada 7 días**. La elección vale solo para este computador.

Se conservan los **10 respaldos más recientes**; al hacer uno nuevo se borran los más viejos. Los demás archivos de la carpeta no se tocan. Si un respaldo automático falla, aparece un aviso.

## Lista de respaldos

En **Configuración › Respaldos** ves cada respaldo con su **fecha**, su **tamaño** y su **revisión de datos**: un número que sube con cada cambio guardado y sirve para saber cuál es más reciente. Un archivo dañado se marca como **No se puede leer** y no se puede restaurar.

- **Respaldar ahora** hace un respaldo en el momento.
- **Abrir carpeta** abre la carpeta de respaldos en el Explorador, por ejemplo para copiarlos a un pendrive.

## Antes de reemplazar los datos

Al elegir **Nueva organización vacía** o **Explorar el ejemplo** con datos cargados, BoldoAtlas hace antes un respaldo marcado **Antes de reemplazar**. Como el de restaurar, nunca se borra solo: si te arrepientes, restáuralo desde esta lista. Si el respaldo falla, no se reemplaza nada.

## Restaurar

1. Pulsa **Restaurar** en la fila del respaldo que quieres recuperar.
2. Confirma con **Restaurar y reiniciar**.

Antes de reemplazar nada, BoldoAtlas respalda tus datos actuales: quedan en la lista marcados **Antes de restaurar** y nunca se borran solos. Si te equivocaste de respaldo, restaura ese. Luego los datos se reemplazan por los del respaldo y la app se reinicia.

- Un respaldo hecho con una versión anterior de BoldoAtlas se actualiza al restaurarlo. Uno hecho con una versión **más nueva** no se puede restaurar hasta que actualices BoldoAtlas.
- Si hay otra ventana de BoldoAtlas abierta con los mismos datos, ciérrala antes.
- Si algo falla, tus datos actuales quedan como estaban.
