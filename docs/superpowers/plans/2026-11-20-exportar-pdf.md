# Task 23b, entrega 2, exportar en PDF: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** exportar el organigrama, o una rama, en PDF vectorial. Hay cinco tamaños de hoja y dos orientaciones, y tres formas de repartir: en una página, por ramas o en cuadrícula.

**Architecture:**
- `paginas.ts` tiene funciones puras que deciden las páginas. El reparto por ramas mide cada subárbol con una función que se le pasa: en la app usa el layout real y en las pruebas, una medida falsa.
- `pdf.ts` arma la definición de documento de `pdfmake` con el SVG de cada página (`dibujarSvg`).
- Un worker carga `pdfmake` y genera los bytes.
- El diálogo de la imagen suma el formato PDF.
- Rust suma la extensión `pdf` a `archivo_guardar`.

**Tech Stack:** `pdfmake` (dependencia nueva, una versión publicada hace al menos dos semanas), Vue 3, elkjs, Tauri 2 y Vitest en node.

**Spec:** `docs/superpowers/specs/2026-11-20-exportar-pdf-design.md`

## Global Constraints

- **Textos.** En español simple y directo; el inglés dice lo mismo.
- **Pruebas.** Vitest en `node`, sin DOM: los componentes se prueban con `renderToString` y la lógica va en funciones puras. `pdfmake` funciona en node, así que la privacidad del PDF se prueba generándolo de verdad.
- **App real.** No se lanza en local. La prueba en la app real es el arnés del CI de Windows, que corre en inglés: los selectores van por atributo `data-accion`, nunca por texto, y se comprueba `rutaBd`.
- **CSP de la app.** `img-src 'self' data:`, sin `blob:` para imágenes. Si `pdfmake` necesita cargar fuentes o imágenes, que sea desde el paquete (vfs) o `data:`.
- **Dependencia.** Solo `pdfmake`, en una versión publicada hace al menos dos semanas, con su `package-lock.json`. No entra al paquete principal: se importa solo dentro del worker. Se mide su peso.
- **Reutilizar, sin copiar:**
  - de la entrega 1: `prepararImagen`, `dibujarSvg` (con `fondo`), `tamanos`, `cajasDibujadas`, `nombreArchivo`, `archivoGuardar` y el aviso de aceptación (`crearAviso`);
  - del lienzo: el worker de layout.
- **Sitio.** No dice versiones, «próximamente» ni lo que falta. No se suma una fila al comparador sin fuentes revisadas. `site/novedades.json` acumula.
- **Al terminar.** Correr `graphify update .`. En Bash, usar `git -C` y nunca `cd`.
- **Entrega.** Un PR con `version:menor`.

## Review Focus

1. **Datos de personas en Estructura dentro del PDF.** Pueden filtrarse por el encabezado de cada página, por las tarjetas «sigue en», por el mapa de la cuadrícula o por los metadatos del PDF (título, autor, asunto). Prueba: `pdf_estructura_sin_personas`, en la Task 2.
2. **Bucles en el reparto por ramas.** Una rama que no cabe ni sola, con un solo nivel, no debe repartirse sin fin. Prueba: `rama_que_no_cabe_ni_sola_termina`, en la Task 1.
3. **Numeración de «sigue» y «viene».** Cada «sigue en la página N» apunta a una página que existe y que empieza con «viene de» la página correcta. Prueba: `sigue_y_viene_coinciden`, en la Task 1.
4. **Recortes en la cuadrícula.** Cada parte del dibujo cae al menos en una hoja; los bordes con solape de 1 cm no dejan huecos; la última fila y la última columna no salen vacías. Prueba: `cuadricula_cubre_todo`, en la Task 1.
5. **Organizaciones enormes.** Con cientos de páginas, la ventana no se congela, hay avance y aviso sobre 200 páginas, y la memoria del worker no explota. Medición en la Task 4 y avance en la Task 3.

---

## Task 1: Las páginas, en funciones puras

**Files:**
- Create: `src/features/export/paginas.ts` y `paginas.test.ts`.
- Modify: `src/features/export/treeSvg.ts`, solo para exportar la letra más chica de cada nivel (`letraMinima(nivel): number`), sacada de `LETRA` y `LETRA_MAS`.

**Interfaces:**
- Produces:
  - `export type Hoja = "carta" | "oficio" | "a4" | "a3" | "a2"`.
  - `export type Orientacion = "horizontal" | "vertical"`.
  - `export type Reparto = "una" | "ramas" | "cuadricula"`.
  - `export const HOJAS: Record<Hoja, { ancho: number; alto: number }>`, en puntos, en vertical:
    - carta 612×792;
    - oficio 612×936 (216×330 mm, el oficio de Chile);
    - a4 595.28×841.89;
    - a3 841.89×1190.55;
    - a2 1190.55×1683.78.
  - `export const MARGEN = 28.35` (1 cm), `ENCABEZADO = 28` y `PIE = 22`, en puntos.
  - `export const LETRA_MIN_PT = 8` y `SOLAPE = 28.35` (1 cm).
  - `areaUtil(hoja, orientacion): { ancho: number; alto: number }`.
  - `escalaParaHoja(ancho, alto, hoja, orientacion, nivel): { escala: number; ilegible: boolean }`. Es `ilegible` si `letraMinima(nivel) * escala < LETRA_MIN_PT`. Una unidad SVG vale 1 punto.
  - `interface PaginaRamas { numero: number; raiz: string; profundidad: number; hijas?: { desde: number; hasta: number; parte: number; partes: number }; sigue: { unidad: string; pagina: number }[]; viene: number | null }`.
  - `repartirPorRamas(raiz: string, hijosDe: (id: string) => string[], medir: (raiz: string, profundidad: number, hijas?: [number, number]) => Promise<{ ancho: number; alto: number }>, hoja, orientacion, nivel): Promise<PaginaRamas[]>`. El algoritmo:
    1. Para cada página, busca la mayor profundidad que cabe con letra de al menos 8 pt.
    2. Las ramas cortadas se encolan; las páginas se numeran por niveles, en orden BFS.
    3. Si con profundidad 1 no caben todas las hijas, reparte las hijas en partes («2 de 3»).
    4. Si una sola unidad con profundidad 0 no cabe, la dibuja igual, a la escala que cabe, sin cortar más. Así no hay bucle.
  - `interface Hojita { fila: number; columna: number; x: number; y: number; ancho: number; alto: number }`.
  - `cuadricula(ancho, alto, hoja, orientacion, nivel): { escala: number; filas: number; columnas: number; hojas: Hojita[] }`.
    - Usa la escala de 8 pt.
    - Cada recorte está en coordenadas del dibujo, con `SOLAPE` hacia los lados que tienen vecina.

- [ ] **Step 1: Pruebas que fallan, en `paginas.test.ts`.** Para `repartirPorRamas`, con un `medir` falso:
  - `cabe_en_una_pagina`;
  - `rama_cortada_sigue_y_viene`;
  - `sigue_y_viene_coinciden`;
  - `muchas_hijas_en_partes` («2 de 3»);
  - `numeracion_por_niveles`;
  - `rama_que_no_cabe_ni_sola_termina`;
  - `escala_para_hoja_por_tamano_y_orientacion`;
  - `ilegible_bajo_8_pt`;
  - `cuadricula_cubre_todo`;
  - `cuadricula_solape_y_bordes`.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `typecheck` y `lint`.
- [ ] **Step 5: Commit** `feat(pdf): reparto en páginas por ramas, en cuadrícula y en una`.

## Task 2: El documento PDF y su worker

**Files:**
- Modify: `package.json` y `package-lock.json`, para agregar `pdfmake` (una versión publicada hace al menos dos semanas; anotar cuál y su fecha).
- Create:
  - `src/features/export/pdf.ts`: puro, arma la definición del documento;
  - `src/features/export/pdf.worker.ts`: carga `pdfmake` y genera los bytes, con avance;
  - `pdf.test.ts`.
- Modify: `src-tauri/src/excel.rs`, para que `filtro_de` sume `"pdf" => Some("PDF")`, con su prueba.
- Modify: `src/features/export/formatos.ts`, para que `nombreArchivo` acepte `"pdf"`.

**Interfaces:**
- Consumes: la Task 1, `dibujarSvg` y `EntradaSvg`.
- Produces:
  - `interface PaginaPdf { svg: string; ancho: number; alto: number; arriba?: string; recorte?: Hojita }`. `arriba` es el texto «viene de la página M» o «fila F, columna C».
  - `documentoPdf(paginas: PaginaPdf[], o: { hoja; orientacion; encabezado: { organizacion; alcance; fecha; logo: string | null } }): TDocumentDefinitions`.
    - Cada página lleva el encabezado y el pie («Página N de M», con el logo chico).
    - El SVG se pone con su escala para caber en el área útil.
    - En cuadrícula, cada hoja recorta su parte con un `viewBox` del SVG y lleva marcas de corte.
    - La primera página de la cuadrícula es el mapa.
    - Los metadatos `info` llevan solo el título genérico «Organigrama» y la fecha: ningún nombre de persona.
  - `armarPdf(paginas, o, alAvanzar: (hechas: number, total: number) => void): Promise<Uint8Array>`, del lado de la ventana, que habla con el worker.

- [ ] **Step 1: Pruebas que fallan, en `pdf.test.ts`:**
  - `documento_lleva_encabezado_y_pie`;
  - `metadatos_sin_personas`;
  - `pdf_estructura_sin_personas`. Esta genera el PDF de verdad con `pdfmake` en node, con personas marcadas pasadas por `prepararImagen` y `dibujarSvg` en Estructura. Busca las marcas en el texto del PDF; si el contenido va comprimido, pide `compress: false` en la prueba.
  - `pdf_empieza_con_%PDF`.

  En Rust, `guardar_acepta_pdf`.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `typecheck`, `lint`, `cargo test` y `clippy`. Medir y anotar cuánto suma `pdfmake` al paquete, y comprobar que no entra al chunk principal de `vite build`.
- [ ] **Step 5: Commit** `feat(pdf): documento con pdfmake en un worker y guardar .pdf`.

## Task 3: El formato PDF en el diálogo

**Files:**
- Modify:
  - `src/features/export/DialogoImagen.vue`;
  - `src/i18n/es.json` y `en.json`;
  - las pruebas del diálogo.
- Create: `src/features/export/paginasDeAlcance.ts`. Une `prepararImagen` con la Task 1: es el `medir` real con el layout y `tamanos`, y arma las `PaginaPdf` de cada forma de repartir. Lleva sus pruebas.

**Interfaces:**
- Consumes: las Tasks 1 y 2, y el diálogo y `prepararImagen` de la entrega 1.
- Produces: `paginasPdf(pedido: PedidoImagen, o: { hoja; orientacion; reparto }): Promise<PaginaPdf[]>`.

**Comportamiento:**
- El formato PDF se suma a PNG, JPG y SVG. Con PDF aparecen:
  - **Hoja:** carta, oficio, A4, A3 o A2. Por defecto, carta.
  - **Orientación:** horizontal o vertical. Por defecto, horizontal.
  - **Repartir:** en una página, por ramas o en cuadrícula. Por defecto, por ramas.
- Se recuerdan con `guardarPreferencia`, igual que el resto. El alcance no se recuerda.
- **Vista previa:** la primera página y «N páginas».
- **Avisos antes de guardar:**
  - en una página, si `ilegible` es verdadero, se sugiere repartir por ramas o en cuadrícula;
  - sobre 200 páginas, con la cifra.
- **Al guardar:**
  1. el aviso de aceptación;
  2. `armarPdf`, con un toast de avance «Página N de M»;
  3. `archivoGuardar(nombre, bytes, "pdf")`;
  4. «Abrir carpeta».
- «Copiar imagen» no se ofrece con PDF.
- **Atributos para el arnés:**
  - `data-accion="formato-pdf"`;
  - `hoja-*`;
  - `orientacion-*`;
  - `reparto-una`, `reparto-ramas` y `reparto-cuadricula`.

- [ ] **Step 1: Pruebas que fallan:**
  - `paginasDeAlcance.test.ts`: por ramas da varias páginas con «sigue» y «viene»; en una da una sola; en cuadrícula da el mapa más las hojas.
  - `DialogoImagen.test.ts`: las opciones de PDF, el aviso de ilegible y el de más de 200 páginas.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `npm test`, `typecheck` y `lint`.
- [ ] **Step 5: Commit** `feat(pdf): el formato PDF en el diálogo, con hoja, orientación y reparto`.

## Task 4: Ayuda, sitio, arnés y medición

**Files:**
- Modify:
  - `ayuda/{es,en}/exportar-imagen.md`, con una sección «PDF»;
  - `site/novedades.json`, con una novedad al principio, en es y en;
  - `site/textos/{es,en}/funciones.json`, sumando el PDF;
  - `scripts/probar-app.mjs`, con el paso `exportarPdf` o sumado a `exportarImagen`.

**Paso del arnés:**
- Usa el gancho `BOLDO_GUARDAR_EN` ya existente.
- Guarda un PDF de Estructura repartido por ramas.
- Comprueba que el archivo existe y empieza con `%PDF`.
- Va antes de `fotosSoloEnLaWeb`.

**Medición:** con `sembrar-grande.mjs`, en el scratchpad, medir cuánto tarda y cuántas páginas salen por ramas y en cuadrícula, en carta horizontal. Anotarlo en el PR.

- [ ] **Step 1:** `site/` `npm test` pasa.
- [ ] **Step 2:** `node --check scripts/probar-app.mjs` pasa.
- [ ] **Step 3: Commit** `docs(pdf): ayuda, sitio y arnés`. Después, `graphify update .`.
- [ ] **Step 4:** abrir el PR con `version:menor`.
