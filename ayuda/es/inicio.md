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

## El menú de la app y volver a Inicio

El botón con el logo, a la izquierda de la barra superior, abre el **menú de la app**:

- **Inicio** vuelve a la bienvenida en cualquier momento, también con datos cargados.
- **Nueva organización vacía…** y **Explorar el ejemplo…** reemplazan los datos actuales. Antes piden confirmación y hacen un **respaldo automático** (si el respaldo falla, no se reemplaza nada); el respaldo queda en la lista de **Configuración › Respaldos** para restaurarlo.
- **Abrir archivo .boldo** (Fase 5) e **Importar Excel** (Fase 4) aparecen deshabilitados por ahora.
- **Respaldos** y **Configuración** abren esas secciones; **Datos del proyecto** muestra dónde están tus datos.
- **Idioma** cambia al instante toda la app entre Español y English. La pantalla de bienvenida tiene el mismo selector **ES / EN**; tu elección se recuerda en este equipo y, la primera vez, la app sigue el idioma del sistema.

Las mismas acciones están en la paleta de comandos (`Ctrl+K`). **Configuración**, **Ayuda** y **Acerca de** se cierran con su botón **Cerrar**, con `Esc` o con un segundo clic en su entrada del menú lateral, y vuelves a la vista anterior (o al árbol si no hay ninguna). La barra lateral se pliega y se vuelve a fijar abierta con el botón bajo el logo **BoldoAtlas**. Plegada, se despliega sobre el contenido al dejar el mouse encima un momento (o al llegar a ella con `Tab`) y se vuelve a plegar al salir o con `Esc`; esto se apaga en **Configuración › Apariencia › Abrir la barra lateral al pasar el mouse**. Con la ventana angosta (menos de 1100 px) la barra se pliega sola. El panel de una unidad se cierra con la **×** de su encabezado.

## Qué proyecto está abierto

El título de la ventana y la barra superior muestran el nombre de la organización con la insignia **Principal** (por ahora hay una sola base). Al pulsarlos se abre **Datos del proyecto**: el modo (portable o instalado), la ruta del archivo de la base, su tamaño y la última modificación, con **Copiar ruta** y **Abrir carpeta**.

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
