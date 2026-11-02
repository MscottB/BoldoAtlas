# Respaldos

::: info En resumen
BoldoAtlas copia tus datos solo, por si algo sale mal. Aquí ves dónde quedan los respaldos, cómo hacer uno a mano y cómo restaurarlo.
:::

BoldoAtlas guarda copias de tus datos en la carpeta **respaldos**, dentro de la carpeta de datos:

- **Portable:** `datos/respaldos/`, junto al programa.
- **Instalado:** `respaldos` dentro de la carpeta de datos de tu usuario; en Windows, `%APPDATA%\io.github.mscottb.boldoatlas\respaldos\` (en Linux y macOS, ver **Inicio › Modo portable e instalado**).

Cada respaldo es un archivo `boldo-AAAAMMDD-HHMM.db` con la fecha y hora en que se hizo. Si se hacen dos en el mismo minuto, el segundo termina en `-2`.

## Respaldo automático

Al abrir la app y mientras sigue abierta, también en la bandeja, si el último respaldo tiene más de 24 horas se hace uno nuevo en segundo plano: puedes seguir trabajando mientras tanto. En **Configuración › Respaldos › Ver respaldos y restaurar** eliges cada cuánto: **Nunca**, **Cada vez** que se abre (solo al abrirla), **Cada 24 horas** (lo normal) o **Cada 7 días**. La elección vale solo para este computador.

Se conservan los **10 respaldos más recientes**; al hacer uno nuevo se borran los más viejos. Los demás archivos de la carpeta no se tocan. Si un respaldo automático falla, aparece un aviso.

## Lista de respaldos

En **Configuración › Respaldos** se ve la fecha del **último respaldo** junto a **Respaldar ahora**. La lista, la frecuencia y **Abrir carpeta** están en **Ver respaldos y restaurar**, que se abre con un clic y queda como lo dejes; si llegas desde **Respaldos** en el menú de la app, ya está abierto. Ahí ves cada respaldo con su **fecha**, su **tamaño** y su **revisión de datos**: un número que sube con cada cambio guardado y sirve para saber cuál es más reciente. Un archivo dañado se marca como **No se puede leer** y no se puede restaurar.

- **Respaldar ahora** hace un respaldo en el momento.
- **Abrir carpeta** abre la carpeta de respaldos en el Explorador, por ejemplo para copiarlos a un pendrive.

![Configuración, sección Respaldos: último respaldo, Respaldar ahora, Abrir carpeta y la lista de respaldos con su botón Restaurar.](../img/es/respaldos-lista.webp "Configuración › Respaldos (lista de ejemplo). 1: Respaldar ahora. 2: Abrir carpeta. 3: Restaurar."){width=760 height=440}

::: tip Consejo
Para llevarte una copia a otro lugar, pulsa **Abrir carpeta** y copia el archivo `.db` que quieras, por ejemplo a un pendrive.
:::

## Antes de reemplazar los datos

Al elegir **Nueva organización vacía** o **Explorar el ejemplo** con datos cargados, o al reemplazar todo con un [archivo `.boldo`](exportar-importar.md), BoldoAtlas hace antes un respaldo marcado **Antes de reemplazar**. Al agregar o fusionar lo que trae un archivo, el respaldo se marca **Antes de importar**. De estos se conservan los últimos 20. Al [optimizar las fotos](fichas.md#fotos), el respaldo se marca **Antes de optimizar fotos**, y se conservan los últimos 3. El de reemplazar y el de restaurar nunca se borran solos. Si te arrepientes, restáuralo desde esta lista. Si el respaldo falla, no se reemplaza nada.

## Restaurar

::: warning Importante
Restaurar reemplaza tus datos actuales por los del respaldo y reinicia la app.
:::

1. En **Ver respaldos y restaurar**, pulsa **Restaurar** en la fila del respaldo que quieres recuperar.
2. Confirma con **Restaurar y reiniciar**.

Antes de reemplazar nada, BoldoAtlas respalda tus datos actuales: quedan en la lista marcados **Antes de restaurar** y nunca se borran solos. Si te equivocaste de respaldo, restaura ese. Luego los datos se reemplazan por los del respaldo y la app se reinicia.

- Un respaldo hecho con una versión anterior de BoldoAtlas se actualiza al restaurarlo. Uno hecho con una versión **más nueva** no se puede restaurar hasta que actualices BoldoAtlas.
- Si hay otra ventana de BoldoAtlas abierta con los mismos datos, ciérrala antes.
- Si algo falla, tus datos actuales quedan como estaban.

**Ver también:** [Inicio](inicio.md) · [Actualizaciones](actualizaciones.md).
