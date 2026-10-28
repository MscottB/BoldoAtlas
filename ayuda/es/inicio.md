# Inicio

## Qué es BoldoAtlas

BoldoAtlas es una app de escritorio para Windows con la que armas el organigrama de tu organización: gerencias, áreas y subáreas, conectadas entre sí, y la ficha de cada persona (o vacante) que trabaja en ellas. Puedes explorar el resultado en el lienzo del árbol o en el directorio.

Los procesos, los indicadores y la exportación llegan en fases posteriores.

## Modo portable e instalado

- **Portable:** extraes `BoldoAtlas_windows_x64_portable.zip` en cualquier carpeta (o en un pendrive) y ejecutas `BoldoAtlas.exe`. Funciona porque junto al programa hay un archivo `portable.flag`. Extrae el zip antes de ejecutar: abrirlo desde dentro del zip impide guardar los datos.
- **Instalado:** lo instalas con `BoldoAtlas_windows_x64_setup.exe` y los datos quedan en la carpeta de datos de tu usuario de Windows.

En _Acerca de_ (abajo en el menú) ves el modo en que está corriendo y la carpeta de datos exacta.

## Dónde quedan tus datos

Todo se guarda en una base de datos SQLite local, `boldo.db`:

- En modo portable, en la carpeta `datos/` junto al programa.
- En modo instalado, en `%APPDATA%\io.github.mscottb.boldoatlas`.

Antes de actualizar la estructura de la base, BoldoAtlas guarda una copia en la subcarpeta `respaldos`. Para llevarte tus datos a otro computador en modo portable, copia la carpeta completa.

Los cambios se guardan solos: no hay botón "Guardar". El indicador de la barra superior muestra "Guardado" cuando todo está en disco.

## Privacidad

Nada sale de tu computador. BoldoAtlas no usa cuentas, no tiene servidor y no se conecta a internet.
