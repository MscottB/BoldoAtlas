# Task 23d, visor HTML: diseño

El autor lo aprobó por partes el 2026-11-27. Detalla la Task 23d del plan de la fase 2 (`docs/superpowers/plans/2026-10-28-fase2-nucleo.md`, Anexo 10, paso 2). Se basa en la spec principal, §11 «Visor HTML», y la corrige donde se indica.

## Qué se logra

- El organigrama, o una parte, se guarda como un solo archivo `.html` para compartirlo con quien no tiene la app. Se abre en cualquier navegador, sin servidor y sin internet.
- En el archivo se puede acercar, mover, plegar ramas, buscar y ver las personas de cada unidad.
- Se ve igual que la imagen y el PDF, porque usa el mismo dibujo (`treeSvg.ts`).
- Es una foto: dice cuándo se generó y no se actualiza. Para tener los cambios, se vuelve a exportar.

## Decisiones del autor

1. **Los tres niveles de la imagen y el PDF:** Estructura, Presentación y Como en pantalla, con **Presentación por defecto**, que ya lleva el cargo y el nombre de la jefatura. Correo y Teléfono son casillas aparte, desmarcadas.
2. **Un clic en una unidad abre un panel** con su ruta, su jefatura y sus personas. En Estructura muestra solo la ruta y los cargos de sus puestos, sin nombres.
3. **Plegar reordena el dibujo,** como en la app. El archivo lleva el mismo programa que ordena el lienzo (elk) y dibuja la imagen (`treeSvg.ts`). Pesa unos 2 MB más los datos.

**Corrección a la spec principal:** donde dice «vista guardada», el visor usa la configuración actual de Personalizar, como la imagen. Para usar una vista guardada, se aplica antes en el árbol. Las notas, las fotos y los costos nunca van, como dice la spec.

## Cómo funciona

Dos piezas: la app prepara los datos al exportar, y el archivo lleva su propio programa, que dibuja y reordena en el navegador.

- **La app prepara los datos** (`src/features/visor/datos.ts`, función pura con pruebas):
  - las tarjetas de todas las unidades del alcance, con lo que decide `niveles.ts` para el nivel elegido;
  - lo que muestra el panel de cada unidad;
  - las unidades con su superior, las conexiones laterales, las zonas, la leyenda de «Colorear por», la configuración de la vista y el encabezado (logo, organización, alcance y fecha de generación);
  - las ramas plegadas al abrir: como en pantalla, o todas abiertas con la casilla «Abrir todas las ramas del alcance», que avisa si pasa de mil tarjetas, como la imagen;
  - los textos de la interfaz del visor, en el idioma que tiene la app al exportar.
- **Lo que el nivel no incluye nunca entra al archivo.** En Estructura no hay ningún nombre, correo ni teléfono que esconder; sin las casillas marcadas, no va ningún correo ni teléfono.
- **El programa del visor** (`src/features/visor/programa/`):
  - usa los mismos `layout.ts` (elk), `treeSvg.ts`, `lateral.ts` y `zonas.ts` del lienzo y la imagen, sin Vue ni el store;
  - al plegar o desplegar, vuelve a ordenar con elk y a dibujar con `treeSvg.ts`, con «Ordenando…» mientras tanto;
  - elk corre en la misma página, sin worker: un archivo abierto desde una carpeta no puede crear workers en todos los navegadores.
- **Empaquetado:** un complemento chico en la configuración de Vite empaqueta el programa con esbuild, que ya viene con Vite, en un solo texto minificado. La app lo importa como texto y lo pega dentro del HTML al exportar. Sin dependencias nuevas. Las pruebas de Vitest usan la misma configuración, así prueban el programa real.
- **`treeSvg.ts`** suma una opción para el visor: marca cada tarjeta con su id y agrega el botón de plegar en las que tienen ramas. La imagen y el PDF no cambian.

## El archivo

### Lo que se ve

- **Una barra arriba:**
  - el logo, la organización, el alcance y «Generado el …»;
  - la búsqueda;
  - acercar, alejar y encuadrar;
  - el cambio entre **Diagrama** y **Lista**.
- **Diagrama:**
  - se arrastra para moverlo; se acerca con la rueda o con `+` y `−`; `0` encuadra;
  - cada tarjeta con ramas tiene un botón para plegarlas; un clic en la tarjeta abre el panel;
  - con teclado, `Tab` pasa de una tarjeta a otra, `Enter` abre el panel y `Espacio` pliega.
- **Lista:** las mismas ramas como un árbol de texto (`role="tree"`), para leer con teclado o con un lector de pantalla:
  - `↑` y `↓` se mueven, `→` abre la rama, `←` la cierra y `Enter` abre el panel;
  - comparte lo plegado con el diagrama.
- **Búsqueda:**
  - busca sin tildes ni mayúsculas en lo que lleva el archivo: unidades, y personas y cargos si el nivel los incluye;
  - al elegir un resultado, abre las ramas hasta llegar, lo centra, lo resalta y abre su panel.
- **Panel de la unidad:**
  - la ruta, la jefatura y las personas, con su cargo y nombre; «Vacante» en los puestos sin titular;
  - el correo y el teléfono, solo si se marcaron, como enlaces `mailto:` y `tel:`;
  - en Estructura, la ruta y los cargos de sus puestos, sin nombres.
- **Tema:** siempre la paleta clara, como la imagen.

### Seguridad

- **Los datos** van en un bloque `<script type="application/json">`, que el navegador no ejecuta. Dentro, `<`, `>`, `&`, U+2028 y U+2029 se escriben como `<` y similares: un nombre con `</script>` no puede cerrar el bloque.
- **El panel, la lista y la búsqueda** ponen los textos con `textContent`, nunca como HTML. El SVG ya sale escapado de `treeSvg.ts`.
- **Una CSP en el propio archivo** (`<meta http-equiv="Content-Security-Policy">`):
  - `default-src 'none'`: sin conexiones, letras ni imágenes de afuera;
  - el programa y los estilos permitidos solo por su huella (`sha256`), calculada al exportar;
  - imágenes solo `data:`, para el logo;
  - `base-uri 'none'` y `form-action 'none'`.
- **Funciona sin internet** en Chrome, Edge, Firefox y Safari, también abierto desde una carpeta o desde un correo descargado.

## El diálogo «Exportar visor HTML»

- **Se abre desde los mismos lugares que la imagen:** la página «Importar y exportar», el botón de la barra del árbol y el clic derecho en una unidad («Exportar esta rama como visor HTML», con esa rama como alcance).
- **Opciones:**
  - el alcance: toda la organización, una gerencia o una rama;
  - el nivel, con Presentación por defecto;
  - la casilla «Abrir todas las ramas del alcance»;
  - las casillas Correo y Teléfono, desmarcadas y apagadas en Estructura.
- **Vista previa:** el mismo dibujo de la imagen, que es lo que el visor muestra al abrir.
- **«Guardar…»** usa el mismo «Guardar como» y el mismo comando de Rust que la imagen, y después ofrece «Abrir carpeta».
- **Aceptación:** antes de guardar sale el mismo aviso de «queda sin cifrar» (`AvisoSinCifrar.vue`), en todos los niveles y en cada exportación. Sin aceptar no se escribe nada.
- **Recuerda** lo elegido la última vez, salvo el alcance.
- **En la organización de al lado,** que es de solo lectura, también se puede exportar.

## Textos

- La ayuda nueva `ayuda/{es,en}/exportar-visor.md` se registra como las demás páginas.
- Va una novedad en `site/novedades.json`.
- El sitio suma el visor en Funciones. No habla de versiones ni de «próximamente».

## Pruebas

- **Vitest (node):**
  - **Las obligatorias:**
    - el archivo de Estructura, armado con personas cargadas, no contiene ninguno de sus nombres, correos ni teléfonos;
    - sin las casillas marcadas, no va ningún correo ni teléfono;
    - un nombre como `</script><img src=x onerror=…>` queda escapado en el archivo y se lee igual al leer los datos;
    - la CSP está, con `default-src 'none'`, y sus huellas calzan con el programa y los estilos del archivo.
  - Los datos de cada nivel y del panel.
  - La lógica del visor como funciones puras: plegar, buscar, el recorrido de la lista con teclado y el armado del panel.
  - El diálogo.
- **Arnés en la app real (CI de Windows),** comprobando `rutaBd`:
  1. guarda un visor de la organización de prueba en la carpeta de prueba;
  2. lo abre en el navegador de la app;
  3. comprueba que dibuja las tarjetas, que plegar reordena, que buscar encuentra una unidad y que la lista se recorre con teclado;
  4. comprueba que no hace ningún pedido a la red, que la CSP no reclama y que el nombre con `</script>` no ejecuta nada.
- **Medición con la organización grande:** el tiempo para generar el archivo, su peso, cuánto tarda en abrir y cuánto en reordenar al plegar.

## Entrega

Un PR con este diseño y su plan, y luego un PR de código con `version:menor`.
