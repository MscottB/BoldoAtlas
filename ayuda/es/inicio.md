# Inicio

## Qué es BoldoAtlas

BoldoAtlas es una app de escritorio para Windows con la que armas el organigrama de tu organización: gerencias, áreas y subáreas, conectadas entre sí, y la ficha de cada persona que trabaja en ellas. Puedes explorar el resultado en el lienzo del árbol o en el directorio.

Los procesos, los indicadores y la exportación llegan en fases posteriores.

## Primer uso

Al abrir una base sin unidades, BoldoAtlas muestra la bienvenida con cuatro caminos:

- **Crear una organización vacía:** te pide el nombre de la organización y el de su unidad raíz (del primer tipo de unidad activo) y te lleva al árbol.
- **Cargar desde Excel** (llega en la Fase 4) y **abrir un archivo .boldo** (Fase 5): por ahora aparecen deshabilitados.
- **Explorar un ejemplo:** crea una organización de muestra, en el idioma de la interfaz, para recorrer la app.

Después puedes ajustar el nombre, el logo, el tema y el idioma en **Configuración**, y las listas de cargos, sedes y demás en **Configuración › Mantenedores**.

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
