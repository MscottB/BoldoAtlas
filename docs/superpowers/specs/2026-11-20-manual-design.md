# Task 23c, manual de organización y funciones: diseño

El autor lo aprobó por partes el 2026-11-20. Detalla la Task 23c del plan de la fase 2 (`docs/superpowers/plans/2026-10-28-fase2-nucleo.md`, Anexo 10, paso 2) y la spec principal, §11 «Manual de organización y funciones». Se apoya en la exportación en PDF de la 23b (`docs/superpowers/specs/2026-11-20-exportar-pdf-design.md`, PR #113).

## Qué se logra

- Un PDF formal que ordena lo que ya está en la base: portada, índice, organigrama general y una sección por unidad con sus puestos, su descripción, quién los ocupa y sus vacantes.
- No pide datos nuevos.
- Sirve para uso interno, con nombres, y para compartir fuera, sin nombres.

## Decisiones del autor

1. **«Incluir a las personas» se elige al exportar.** Es una casilla, marcada la primera vez.
2. **El dibujo del organigrama va en dos lugares:**
   - un organigrama general al inicio, repartido por ramas como el PDF;
   - un dibujo chico en cada unidad: la unidad, sus hijas directas y sus puestos.
3. **Los procesos y el RACI se suman después**, cuando exista el mapa de procesos. Hasta entonces el manual no los menciona.

## Qué ve la persona

- **Dónde se abre:**
  - en la página «Importar y exportar», como «Manual de organización»;
  - con clic derecho sobre una unidad: «Manual de esta rama».
- **El diálogo:**
  - el alcance: toda la organización o una rama;
  - la casilla «Incluir a las personas»;
  - la hoja (carta, oficio, A4, A3 o A2) y la orientación. La primera vez viene en carta vertical.
  - Respeta la fecha elegida en «Organigrama a una fecha».
  - Recuerda las opciones, salvo el alcance.
- **Al guardar:**
  - se calcula todo, con avance y Cancelar;
  - después sale el aviso de «queda sin cifrar». Si son más de 200 páginas, lo dice con la cifra.
  - al final, «Guardar como» y «Abrir carpeta».
- **El manual, en orden:**
  1. **Portada:** logo, nombre de la organización, «Manual de organización y funciones», el alcance, la fecha, y la versión de la app y de los datos.
  2. **Índice:** cada unidad con su número (1, 1.1, 1.2…) y la página donde está.
  3. **Organigrama general:** repartido por ramas, con «sigue» y «viene».
  4. **Una sección por unidad**, en el orden del árbol:
     - número y nombre destacado, y la ruta (Gerencia › Área › Subárea);
     - la jefatura;
     - el dibujo chico: la unidad, sus hijas directas y sus puestos;
     - una tabla de puestos con cargo, descripción («Sin descripción» si falta), quién lo ocupa y si es vacante.
- **Sin «Incluir a las personas»:**
  - ningún nombre en ninguna parte: dibujos, tablas, índice, metadatos y nombre del archivo;
  - el puesto dice «Ocupado» o «Vacante»;
  - los dibujos van en el nivel Estructura.
- **Con «Incluir a las personas»:**
  - el titular de cada puesto y, si lo hay, el reemplazo;
  - los dibujos van en el nivel Presentación.
- **Cada página:** encabezado y «Página N de M», traducidos, como el PDF de la 23b.

## Cómo se arma

- **`src/features/export/manual.ts`, funciones puras:**
  - **`datosManual(pedido)`** junta las unidades del alcance en el orden del árbol, con su número, su ruta y su jefatura, y sus puestos con cargo, descripción, titular, reemplazo y vacante a la fecha elegida. Sin personas, los nombres ni siquiera se juntan.
  - **`documentoManual(datos, o)`** arma la definición de `pdfmake`: portada, índice (`toc` de `pdfmake`, que pone el número de página), organigrama general, secciones y tablas.
- **Lo que se reutiliza:**
  - el organigrama general sale de `paginasPdf` de la 23b, repartido por ramas;
  - el dibujo chico de cada unidad sale de `prepararImagen` y `dibujarSvg`, con esa unidad como alcance, un solo nivel abierto y sin encabezado propio;
  - el worker de `pdfmake` suma el manual como un segundo tipo de documento, con el mismo avance, Cancelar y «Guardar como» (`archivo_guardar`, `pdf`);
  - el encabezado, el pie, la cancelación y el aviso de cambio del organigrama son los del PDF.
- **Organizaciones grandes:** 2.000 unidades son 2.000 secciones, cada una con su dibujo. Todo se arma con avance y Cancelar, sin congelar la ventana.

## Textos

- Ayuda nueva: `ayuda/{es,en}/manual.md`, registrada como las demás.
- Una novedad en `site/novedades.json`.
- La lista de funciones del sitio suma el manual.
- Sin fila en el comparador, versiones, «próximamente» ni lo que falta.

## Pruebas

- **Vitest (node):**
  - `datosManual`:
    - la numeración (1, 1.1, 1.2) y el orden del árbol;
    - «Sin descripción», vacante y reemplazo;
    - una rama como alcance;
    - la fecha elegida;
    - sin personas, ningún nombre en los datos.
  - **Privacidad de punta a punta:** con «Incluir a las personas» desmarcada, el PDF real (`pdfmake` en node, con el texto decodificado) no tiene ningún nombre de persona. Un control marcado sí los tiene.
  - El índice lleva cada unidad.
  - El diálogo.
- **Arnés en la app real (CI de Windows):**
  - guarda un manual sin personas;
  - comprueba que empieza con `%PDF`;
  - comprueba que el nombre sembrado no aparece en claro;
  - usa `rutaBd` y selectores por atributo.
- **Medición:** con la organización grande, cuánto tarda y cuántas páginas salen.

## Entrega

Un PR con este diseño y su plan, y luego un PR de código con `version:menor`.
