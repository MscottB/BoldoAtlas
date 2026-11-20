# Task 23b, entrega 2, exportar el organigrama en PDF: diseño

El autor lo aprobó por partes el 2026-11-20. Es la segunda entrega de la Task 23b del plan de la fase 2 (`docs/superpowers/plans/2026-10-28-fase2-nucleo.md`, Anexo 10, paso 2). Se apoya en la primera entrega, «exportar como imagen» (`docs/superpowers/specs/2026-11-20-exportar-imagen-design.md`, PR #111), y en la spec principal, §11 «PDF» y «Organigramas grandes».

## Qué se logra

- El organigrama, o una rama, se exporta en PDF vectorial, en hojas carta, oficio, A4, A3 o A2, en vertical u horizontal.
- Si no cabe en una hoja, se reparte en una de tres formas: **en una página**, **por ramas** (con marcas de continuación) o **en cuadrícula** (para pegar como póster).
- Usa los mismos tres niveles, el mismo alcance y el mismo dibujo SVG que la imagen.

## Decisiones del autor

1. **`pdfmake`.** Dibuja el SVG como vectores y arma documentos (portada, índice, tablas, «página N de M»). Lo reutilizará el manual de la 23c. Es una dependencia nueva: se carga solo al exportar, en un worker. Se instala una versión publicada hace al menos dos semanas.
2. **Las tres formas de repartir:** en una página, por ramas y en cuadrícula.
3. **Dentro del mismo diálogo de la imagen**, como un formato más.
4. **Queda fuera:** las secciones de indicadores, procesos y RACI de la spec principal. Van con la 23c y el mapa de procesos, cuando existan.

## Qué ve la persona

- **Formato PDF.** En el diálogo «Imagen del organigrama», PDF es un formato más junto a PNG, JPG y SVG. Al elegirlo aparecen sus opciones:
  - **Hoja:** carta, oficio, A4, A3 o A2. La primera vez viene en carta.
  - **Orientación:** horizontal o vertical. La primera vez viene en horizontal.
  - **Repartir:** en una página, por ramas o en cuadrícula.
- **Lo que no cambia:**
  - el alcance, los tres niveles, «Abrir todas las ramas» con su aviso de más de 1.000 tarjetas, y el aviso de «queda sin cifrar» en cada exportación;
  - el diálogo recuerda las opciones, salvo el alcance.
- **Cada página lleva:**
  - arriba, el nombre de la organización, el alcance y la fecha (la de hoy o la elegida en «Organigrama a una fecha»);
  - abajo, el logo chico y «Página N de M».
- **Vista previa:** para PDF muestra la primera página y dice cuántas páginas saldrán.
- **Avisos:**
  - **en una página:** si la letra quedaría por debajo de 8 pt, el diálogo lo avisa antes de guardar y sugiere repartir por ramas o en cuadrícula;
  - **más de 200 páginas:** avisa con la cifra antes de seguir.
- **Al armar:** se ve el avance, por ejemplo «Página 12 de 40», sin congelar la ventana. Después se ofrece «Abrir carpeta».

## Cómo se reparte

Todo el reparto son funciones puras en `src/features/export/paginas.ts`, con pruebas. `pdfmake` solo pinta lo que ellas deciden.

- **`escalaParaHoja(ancho, alto, hoja, orientacion)`** devuelve la escala que hace caber el dibujo en el área útil de la hoja (sin márgenes, encabezado ni pie), y dice si con esa escala la letra baja de 8 pt.
- **En una página:** se dibuja todo con esa escala.
- **`repartirPorRamas(...)`** devuelve las páginas. Cada una tiene su raíz, las ramas cortadas con su número de «sigue en la página N», y su número de «viene de la página M».
  1. La primera página muestra la raíz del alcance y tantos niveles como quepan con letra de 8 pt o más.
  2. Cada rama cortada se dibuja como una tarjeta con el nombre de la unidad y «sigue en la página N».
  3. Cada rama cortada empieza su propia página, con «viene de la página M» arriba, y se reparte igual si tampoco cabe.
  4. Si una unidad tiene demasiadas hijas para caber a lo ancho con un solo nivel, sus hijas se reparten en varias páginas: «Ventas (continuación, 2 de 3)».
  5. Las páginas se numeran por niveles: las ramas del mismo nivel quedan juntas.
  6. Cada página se ordena con el mismo elkjs, worker y medidas (`tamanos`, `cajasDibujadas`) que el lienzo y la imagen, y se dibuja con `dibujarSvg`.
- **`cuadricula(ancho, alto, hoja, orientacion)`** devuelve las hojas y el recorte de cada una.
  1. El dibujo entero se lleva a la escala con letra de 8 pt.
  2. Se corta en hojas con 1 cm de solape. Cada hoja lleva «fila F, columna C» y marcas de corte en las esquinas.
  3. La primera página es un mapa chico de la cuadrícula numerada.
- **Privacidad:** cada página sale de `prepararImagen` y `dibujarSvg` con el nivel elegido. En Estructura no hay datos de personas, como en la imagen.

## Cómo se arma y se guarda

- Un worker carga `pdfmake` y sus fuentes solo al exportar, recibe los SVG de cada página con sus textos, arma el PDF y avisa el avance.
- **Guardar:** el `archivo_guardar` de la primera entrega suma la extensión `pdf`, con su filtro («PDF») en el diálogo nativo. El gancho de prueba `BOLDO_GUARDAR_EN` sirve igual.
- **El nombre del archivo** sale de `nombreArchivo`, con extensión `pdf`.

## Textos

- `ayuda/{es,en}/exportar-imagen.md` suma una sección «PDF», con las hojas, la orientación, las tres formas de repartir y los avisos.
- Va una novedad en `site/novedades.json`.
- La lista de funciones del sitio suma el PDF.
- No se agrega una fila al comparador sin fuentes revisadas.
- Sin versiones ni «próximamente».

## Pruebas

- **Vitest (node):**
  - `repartirPorRamas`:
    - cabe en una página;
    - una rama cortada, con «sigue» y «viene» bien numerados;
    - una unidad con muchas hijas que se reparte en «2 de 3»;
    - la numeración por niveles.
  - `cuadricula`: el número de hojas, el solape de 1 cm y los recortes en los bordes.
  - `escalaParaHoja`: cada hoja y orientación, y el umbral de 8 pt.
  - **Privacidad de punta a punta en PDF:** con Estructura y personas marcadas, el texto del PDF no contiene ninguna marca.
  - El diálogo con las opciones de PDF.
- **Rust:** `archivo_guardar` acepta `pdf`.
- **Arnés en la app real (CI de Windows):**
  - guarda un PDF de Estructura repartido por ramas;
  - comprueba que el archivo existe y empieza con `%PDF`;
  - comprueba `rutaBd`, y usa selectores por atributo.
- **Medición:**
  - con la organización grande, cuánto tarda y cuántas páginas salen por ramas y en cuadrícula;
  - cuánto suma `pdfmake` al paquete y que no entra al paquete principal.

## Entrega

Un PR con este diseño y su plan, y luego un PR de código con `version:menor`.
