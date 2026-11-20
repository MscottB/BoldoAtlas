# Task 23b, entrega 1, exportar como imagen: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** exportar el organigrama, o una rama, como SVG, PNG o JPG, o copiarlo como imagen, en tres niveles de detalle, con vista previa.

**Architecture:** dos funciones puras arman el dibujo:
- `niveles.ts` decide qué lleva cada tarjeta;
- `treeSvg.ts` dibuja el SVG con las posiciones del mismo layout de elkjs que usa el lienzo.

La ventana rasteriza el SVG en un `canvas` para el PNG y el JPG. Rust guarda con el «Guardar como» que ya usa el Excel, generalizado. Un diálogo con vista previa se abre desde tres lugares.

**Tech Stack:** Vue 3, elkjs (ya instalado), canvas y el portapapeles del navegador, Tauri 2 y Vitest en node.

**Spec:** `docs/superpowers/specs/2026-11-20-exportar-imagen-design.md`

## Global Constraints

- **Textos:** en español simple y directo; el inglés dice lo mismo.
- **Pruebas:** Vitest en `node`, sin DOM. Los componentes se prueban con `renderToString` y la lógica va en funciones puras. Lo que solo funciona en el navegador (`canvas`, `Image`, portapapeles) queda en un módulo delgado, y lo calculable va aparte con sus pruebas.
- **App real:** no se lanza en local. La prueba en la app real es el arnés del CI de Windows (`scripts/probar-app.mjs`), y ningún arnés toca datos reales (comprueba `rutaBd`).
- **Dependencias:** ninguna nueva. No se usa `html-to-image`: genera `foreignObject` y la entrega del PDF no lo podría usar.
- **El SVG:** siempre con la paleta clara. Es SVG puro (`<rect>`, `<text>`, `<path>`, `<image>` para el logo), sin `foreignObject` ni CSS externo, y los textos van escapados (`&`, `<`, `>`, `"`).
- **Aceptación:** sale el aviso de «queda sin cifrar» de `features/excel/aviso.ts` (`crearAviso`) antes de guardar o de copiar, en cada exportación.
- **Sitio:** no dice versiones, «próximamente», el PDF ni lo que falta. `site/novedades.json` acumula.
- **Al terminar código:** `graphify update .`. En Bash, `git -C` y nunca `cd`.
- **Entrega:** un PR con `version:menor`.

## Review Focus

1. **Datos de personas en Estructura.** Que se cuelen por una etiqueta, el título de una zona, el texto de una conexión lateral o el `title` o `desc` del SVG. Prueba: `estructura_sin_datos_de_personas`, en la Task 1.
2. **Textos con caracteres especiales.** Un nombre con `&`, `<` o comillas no debe romper el SVG. Prueba: `escapa_los_textos`, en la Task 1.
3. **Imágenes enormes.** Una escala que pasa el máximo del `canvas` (16384 px por lado y 268.435.456 px de área) no debe dar una imagen en blanco: baja la escala y lo dice. Prueba: `escala_que_cabe`, en la Task 2.
4. **Guardar con otra extensión.** Guardar un PNG con el nombre `a.svg` no debe dejar un archivo con una extensión que no corresponde a su contenido. Prueba: `guardar_corrige_la_extension`, en la Task 2.
5. **La fecha elegida.** Con «Organigrama a una fecha», la imagen dibuja la estructura de esa fecha y la nombra en el encabezado. Prueba: `encabezado_con_la_fecha_elegida`, en la Task 1. La Task 3 pasa la fecha.

---

## Task 1: Qué lleva cada nivel y el dibujo SVG

**Files:**
- Create: `src/features/export/niveles.ts`, `src/features/export/treeSvg.ts` y sus pruebas.

**Interfaces:**
- Consumes:
  - `subgrafoVisible`, `grafoElk`, `posiciones`, `calcularLayout`, `aristasDibujadas` y `lateralesADibujar` (`features/arbol/layout.ts`);
  - `ConfigVista`, `tamUnidad`, `jefeEnTarjeta` y `separaciones` (`features/arbol/vista.ts`);
  - las zonas (`features/arbol/zonas.ts`);
  - `iniciales` (`src/lib`).

  Úsalas sin copiarlas.
- Produces:
  - `export type Nivel = "estructura" | "presentacion" | "pantalla"`.
  - `export interface Tarjeta { id: string; titulo: string; lineas: string[]; color: string | null; mas: number }`. `mas` es la cantidad de unidades ocultas bajo una rama plegada; 0 si no hay.
  - `tarjetasDe(nivel: Nivel, entrada: EntradaNivel): Tarjeta[]` en `niveles.ts`. `EntradaNivel` lleva las unidades visibles, los puestos, las asignaciones vigentes a la fecha, la `ConfigVista` y la cantidad de unidades bajo cada plegada.
  - `dibujarSvg(e: EntradaSvg): { svg: string; ancho: number; alto: number }` en `treeSvg.ts`. `EntradaSvg` lleva:
    - `nivel`;
    - `tarjetas`;
    - las posiciones de `posiciones()`;
    - las aristas y las laterales a dibujar;
    - las zonas, salvo en Presentación;
    - la leyenda, solo en «Como en pantalla»;
    - `encabezado: { organizacion: string; alcance: string; fecha: string; logo: string | null }`.
  - Con `nivel === "presentacion"`, el lienzo se amplía con márgenes blancos hasta 16:9 exacto.

- [ ] **Step 1: Pruebas que fallan:**
  - `niveles.test.ts`:
    - `estructura_sin_datos_de_personas`: con personas cargadas (nombres, correos y teléfonos con un marcador), las tarjetas de Estructura y el SVG entero no contienen ningún marcador. Las tarjetas solo llevan el nombre de la unidad, `lineas` va vacía y no hay leyenda.
    - `presentacion_lleva_jefatura_o_vacante`: una unidad con jefatura lleva nombre y cargo; sin jefatura, «Vacante».
    - `pantalla_sigue_la_config`: con `ConfigVista` sin dotación, las tarjetas no la llevan; con dotación, sí.
    - `rama_plegada_lleva_mas_n`.
  - `treeSvg.test.ts`:
    - `escapa_los_textos`: un nombre `A & <B> "C"` queda escapado.
    - `encabezado_con_la_fecha_elegida`.
    - `presentacion_es_16_9`: `ancho / alto === 16 / 9`.
    - `sin_foreign_object`.
    - `fondo_claro_siempre`.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `npm run typecheck` y `npm run lint`.
- [ ] **Step 5: Commit** `feat(imagen): qué lleva cada nivel y el dibujo SVG`.

## Task 2: Formatos, portapapeles y guardar

**Files:**
- Create: `src/features/export/formatos.ts` (puro) y `src/features/export/raster.ts` (navegador), con la prueba de lo puro.
- Modify: `src-tauri/src/excel.rs`. `excel_guardar` pasa a ser `archivo_guardar`, que recibe la extensión y la descripción del filtro del diálogo (`xlsx`, `png`, `jpg`, `svg`) y rechaza cualquier otra. `UltimoExcel` pasa a ser «último archivo exportado». Si cambias nombres, ajusta `lib.rs` y las llamadas de la ventana.
- Modify: `src/db/cliente.ts`. `excelGuardar` y `excelAbrirCarpeta` quedan como `archivoGuardar(nombre, bytes, ext)` y `archivoAbrirCarpeta()`; actualiza a quien los usaba (Excel).

**Interfaces:**
- Produces:
  - `escalaQueCabe(ancho: number, alto: number, escala: 1|2|3|4): { escala: number; bajada: boolean }` en `formatos.ts`. Cumple `max(ancho, alto) * escala ≤ 16384` y `ancho * alto * escala² ≤ 120000000`.
  - `nombreArchivo(organizacion: string, alcance: string, nivel: Nivel, ext: "png"|"jpg"|"svg", fecha: string): string`. Es seguro para Windows: sin `\ / : * ? " < > |`.
  - `svgAImagen(svg: string, ancho: number, alto: number, o: { escala: number; formato: "png"|"jpg"; fondo: "blanco"|"transparente" }): Promise<Uint8Array>` en `raster.ts`. JPG siempre con fondo blanco.
  - `copiarImagen(png: Uint8Array): Promise<void>` en `raster.ts`, con `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`.

- [ ] **Step 1: Pruebas que fallan:**
  - `formatos.test.ts`: `escala_que_cabe` (cabe, baja por lado y baja por área) y `nombre_archivo_seguro`.
  - En Rust:
    - `guardar_corrige_la_extension`: con el nombre `a.svg` y la extensión `png`, el destino termina en `.png`. Reutiliza `intercambio::con_extension`.
    - `guardar_rechaza_otra_extension`.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `typecheck`, `lint`, `cargo test` y `cargo clippy --all-targets -- -D warnings`. El Excel sigue guardando (su prueba existente pasa).
- [ ] **Step 5: Commit** `feat(imagen): PNG, JPG, copiar y guardar con el mismo diálogo del Excel`.

## Task 3: El diálogo, con vista previa, y sus tres entradas

**Files:**
- Create:
  - `src/features/export/DialogoImagen.vue`;
  - `src/features/export/preparar.ts`: arma la `EntradaSvg` desde el store para un alcance, con la casilla «Abrir todas las ramas» y la fecha elegida;
  - sus pruebas.
- Modify:
  - la página Importar y exportar (`/importar-exportar`): una entrada «Imagen del organigrama». La app no tiene un menú «Exportar»: esta página cumple ese papel (ruling del plan);
  - `features/arbol/BarraLienzo.vue`: un botón;
  - `features/arbol/MenuLienzo.vue`: en el clic derecho sobre una unidad, «Exportar esta rama como imagen», con esa rama como alcance;
  - `src/i18n/es.json` y `en.json`.

**Interfaces:**
- Consumes: la Task 1, la Task 2, `crearAviso`, la fecha elegida del store y `colapsados` del lienzo.
- Produces: `prepararImagen(o: { alcance: "todo" | { rama: string }; nivel: Nivel; abrirTodo: boolean }): Promise<EntradaSvg>` y `cuantasTarjetas(o): number`, para el aviso de más de 1.000 (`LIMITE = 1000`, el de «Expandir todo» si ya existe esa constante).

**Comportamiento:**
- **Opciones:** alcance, nivel, formato (PNG, JPG o SVG), fondo y escala para PNG, «Abrir todas las ramas del alcance», vista previa, y los botones «Guardar…» y «Copiar imagen».
- **Vista previa:** el SVG reducido. Se recalcula con un retardo de 300 ms tras cada cambio, en el worker de layout, sin congelar la ventana.
- **Recuerda** nivel, formato, fondo y escala con `guardarPreferencia` y `leerPreferencia`, pero no el alcance.
- **Guardar:**
  1. aviso de aceptación;
  2. `escalaQueCabe`; si baja la escala, un toast lo dice;
  3. `svgAImagen` (o el SVG tal cual);
  4. `archivoGuardar`;
  5. un toast con «Abrir carpeta».
- **Copiar imagen:** aviso, PNG a 2x y `copiarImagen`. Si falla, un toast con el error.
- **Organización de al lado:** se puede exportar.

- [ ] **Step 1: Pruebas que fallan:**
  - `preparar.test.ts`:
    - con «Abrir todas» las ramas salen desplegadas, y sin la casilla salen como en pantalla;
    - la rama como alcance trae solo esa rama;
    - con fecha elegida, salen las unidades de esa fecha;
    - `cuantasTarjetas` cuenta bien.
  - `DialogoImagen.test.ts` (`renderToString`): las opciones, los botones y el aviso cuando hay más de 1.000 tarjetas.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `typecheck` y `lint`.
- [ ] **Step 5: Commit** `feat(imagen): diálogo con vista previa desde la página, la barra y el clic derecho`.

## Task 4: Ayuda, sitio, arnés y medición

**Files:**
- Create: `ayuda/{es,en}/exportar-imagen.md`, registrada como las otras páginas (`ayuda/orden.json` y lo que pida su prueba).
- Modify:
  - `site/novedades.json`: novedad nueva al principio, en es y en;
  - `site/textos/{es,en}/funciones.json` y `site/comparador.json`: suman exportar como imagen, sin PDF;
  - `scripts/probar-app.mjs`: paso nuevo.
- **Paso nuevo del arnés `exportarImagen`:**
  - abre el diálogo por un atributo `data-accion`, no por texto, porque el CI corre en inglés;
  - elige Estructura y guarda un SVG y un PNG en la carpeta de prueba. El «Guardar como» nativo no se maneja desde el arnés, así que el comando acepta un destino de prueba solo cuando lo pide el arnés, como hacen otros pasos que guardan (revisa cómo prueban hoy el Excel);
  - comprueba que los archivos existen;
  - comprueba que el SVG no contiene el nombre de la persona sembrada.
- **Medición:** con `sembrar-grande.mjs`, cuánto tardan la vista previa y un PNG a 2x de toda la organización. Anotarlo en el PR.

- [ ] **Step 1:** `site/` `npm test` pasa, sin versiones ni «Próximamente».
- [ ] **Step 2:** `node --check scripts/probar-app.mjs` pasa.
- [ ] **Step 3: Commit** `docs(imagen): ayuda, sitio y arnés`. `graphify update .`.
- [ ] **Step 4:** abrir el PR con `version:menor`.
