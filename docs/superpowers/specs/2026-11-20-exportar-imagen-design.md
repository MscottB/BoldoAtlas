# Task 23b, entrega 1, exportar el organigrama como imagen: diseño

El autor lo aprobó por partes el 2026-11-20. Detalla la primera entrega de la Task 23b del plan de la fase 2 (`docs/superpowers/plans/2026-10-28-fase2-nucleo.md`, Anexo 10, paso 2). Se basa en la spec principal, §11 «Capturas» y «Niveles de detalle», y la corrige donde se contradicen.

## Qué se logra

- El organigrama, o una parte, se exporta como imagen en SVG, PNG o JPG, o se copia al portapapeles para pegarlo en PowerPoint, Word o un correo.
- Hay tres niveles de detalle: **Estructura**, sin datos de personas, para compartir fuera; **Presentación**, para una diapositiva; y **Como en pantalla**, lo que muestra el lienzo.
- Todo sale del mismo dibujo SVG, que la segunda entrega usará para el PDF.

## Decisiones del autor

1. **Dos entregas.** Esta es la imagen. La segunda, el PDF de organigramas grandes, trae hojas, orientación, varias páginas con marcas de continuación y `pdfmake`.
2. **Las ramas salen como están en pantalla.** La casilla «Abrir todas las ramas del alcance» las despliega todas. Si eso pasa de unas mil tarjetas, avisa con la cifra, como «Expandir todo». Una rama plegada muestra «+N unidades» en su tarjeta.
3. **El diálogo tiene vista previa.** Se actualiza al cambiar el nivel, el alcance o la casilla, y se arma con una breve espera, sin congelar la ventana.
4. **Corrección a la spec principal:** «Como en pantalla» no lleva fotos. La Task 27c las sacó del escritorio.

## Cómo funciona

- **El dibujo**, en `src/features/export/treeSvg.ts`, es una función pura. Recibe las unidades del alcance, sus posiciones y el nivel, y devuelve el texto de un SVG.
  - Las posiciones salen del mismo elkjs y del mismo worker del lienzo (`features/arbol/layout.ts`), así que la imagen tiene la misma forma que el lienzo.
  - El encabezado lleva el logo, el nombre de la organización, el alcance y la fecha: la de hoy o la elegida en «Organigrama a una fecha».
  - Siempre usa la paleta clara, aunque la app esté en tema oscuro.
- **Lo que lleva cada nivel** lo decide `src/features/export/niveles.ts`, una función pura.
- **Formatos:**
  - **SVG:** el texto tal cual.
  - **PNG:** el SVG dibujado en un `canvas` a 1x, 2x, 3x o 4x, con fondo blanco o transparente.
  - **JPG:** igual, con fondo blanco.
  - **Copiar imagen:** el PNG al portapapeles con `navigator.clipboard.write`, sin dependencias nuevas.
- **Guardar:** Rust escribe el archivo con el mismo mecanismo y el mismo «Guardar como» que el Excel (`excel.rs`, `excel_guardar`), y después ofrece «Abrir carpeta». Si conviene, el comando se generaliza para los dos usos en lugar de duplicarse.
- **Aceptación:** antes de guardar o de copiar sale el mismo aviso de «queda sin cifrar» que el Excel (`features/excel/aviso.ts`), en todos los niveles y en cada exportación.
- **Organizaciones enormes:** si el PNG a la escala elegida pasa el tamaño máximo de un `canvas`, la app baja la escala hasta que cabe y lo dice. El SVG no tiene ese límite.

## Qué lleva cada nivel

- **Todos:**
  - el encabezado;
  - la fecha elegida en «Organigrama a una fecha»;
  - nada de lo eliminado;
  - la marca «+N unidades» en las ramas plegadas.
- **Estructura:**
  - **lleva** el nombre de cada unidad, las líneas, las zonas y las conexiones laterales;
  - **no lleva** ningún nombre, correo ni teléfono de una persona, ni dotación, vacantes, puestos ni la leyenda de colores.
- **Presentación:**
  - **lleva** el nombre de la unidad y su jefatura (nombre y cargo), con letra más grande, y «Vacante» en gris si no tiene jefatura;
  - **no lleva** dotación, colores ni etiquetas;
  - la imagen se encuadra en 16:9 con márgenes blancos.
- **Como en pantalla:** lleva lo que muestra el lienzo con la configuración de Personalizar:
  - los datos de la tarjeta activos (iniciales de la jefatura, dotación, etiquetas);
  - «Colorear por» y su leyenda;
  - las zonas y las conexiones laterales;
  - los puestos, si se están viendo.

## El diálogo

- **Se abre desde** la página «Importar y exportar» (la app no tiene un menú «Exportar»), un botón en la barra del árbol y el clic derecho en una unidad («Exportar esta rama como imagen», con esa rama como alcance).
- **Opciones:**
  - el alcance: toda la organización, una gerencia o una rama;
  - el nivel;
  - el formato;
  - el fondo y el tamaño del PNG;
  - la casilla «Abrir todas las ramas del alcance»;
  - la vista previa.
- **Botones:** «Guardar…» y «Copiar imagen».
- **Recuerda** lo elegido la última vez, salvo el alcance.
- **En la organización de al lado,** que es de solo lectura, también se puede exportar.

## Textos

- La ayuda nueva `ayuda/{es,en}/exportar-imagen.md` se registra como las demás páginas.
- Va una novedad en `site/novedades.json`.
- El sitio y el comparador suman la exportación de imágenes. No hablan del PDF hasta que exista, ni de versiones o «próximamente».

## Pruebas

- **Vitest (node, `renderToString`):**
  - `treeSvg` y `niveles`.
  - **La prueba obligatoria:** el SVG de Estructura, armado con personas cargadas, no contiene ninguno de sus nombres ni correos.
  - Presentación encuadra en 16:9.
  - La rama plegada lleva «+N unidades».
  - El diálogo y la vista previa.
- **Rust:** la prueba del guardado.
- **Arnés en la app real (CI de Windows),** comprobando `rutaBd`:
  1. abre el diálogo;
  2. guarda un PNG y un SVG en la carpeta de prueba;
  3. comprueba que los archivos existen y que el SVG de Estructura no tiene nombres de personas.
- **Medición:** con la organización grande, cuánto tardan la vista previa y un PNG a 2x.

## Entrega

Un PR con este diseño y su plan, y luego un PR de código con `version:menor`. La segunda entrega, el PDF, tendrá su propio diseño.
