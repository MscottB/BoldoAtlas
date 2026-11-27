# Task 23d, visor HTML: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** guardar el organigrama, o una rama, como un solo archivo `.html` que se abre sin internet. En el archivo se puede acercar, mover, plegar ramas (que se reordenan), buscar y ver las personas de cada unidad, con el mismo dibujo de la imagen y el PDF.

**Architecture:**
- **En la app:** `datos.ts` junta, con las mismas funciones de la imagen, todo lo que el visor necesita, sin lo que el nivel no lleva. `html.ts` arma el archivo con los datos escapados, el programa y una CSP con sus huellas.
- **En el archivo:** el programa del visor (`src/features/visor/programa/`) reordena con `layout.ts` (elk) y dibuja con `treeSvg.ts` cada vez que se pliega. Un complemento de Vite lo empaqueta en un texto que la app importa.
- **En el diálogo:** «Visor HTML» es un formato más de `DialogoImagen.vue`.

**Tech Stack:** Vue 3, Vite 8 (rolldown), elkjs 0.12, Tauri 2, Vitest en node y Edge sin interfaz por CDP en el arnés.

**Spec:** `docs/superpowers/specs/2026-11-27-visor-html-design.md`

## Global Constraints

- **Textos:** en español simple y directo; el inglés dice lo mismo. Los del visor salen de `src/i18n/{es,en}.json` (claves `visor.*`) y viajan en los datos, en el idioma de la app al exportar.
- **Pruebas:**
  - Vitest corre en `node`, sin DOM: los componentes se prueban con `renderToString` y la lógica va en funciones puras.
  - El DOM del visor se prueba en el arnés, en Edge.
  - Los datos se prueban con el store cargado como en `preparar.test.ts`: `datos()` de `src/features/export/fixture.ts`. Es Gerencia General (`g`) › Finanzas (`a1`) y Operaciones (`a2`); Operaciones › Logística (`s1`) › Bodega (`s3`), y Mantención (`s2`).
    - Ximena (`w1`) es la titular de la jefatura de `g` y Bruno (`w2`), la de `a1`. Carla (`w3`) solo reemplaza en `p-x`.
    - Cada persona lleva el correo `ZQX.<id>@correo.cl` y el teléfono `+56 9 ZQX <id>`.
- **App real:** el arnés del CI de Windows corre en inglés. Los selectores van por `data-accion` en la app y por `data-visor` en el archivo, y se comprueba `rutaBd`.
- **Reutilizar sin copiar:**
  - de la imagen: `prepararImagen` (partido en dos, ver Task 1), `tarjetasDe`, `tamanos`, `dibujarSvg`, `crearAviso`, `archivoGuardar`, `nombreArchivo`, `avisarGuardado` y `LIMITE_TARJETAS`;
  - del lienzo: `subgrafoVisible`, `grafoElk`, `posiciones`, `cajasDibujadas`, `aristasDibujadas`, `lateralesADibujar`, `zonasDibujadas`, `descendientes`, `separaciones`, `datosDePuestos` y `normalizarTexto` (`src/lib/texto.ts`).
- **Privacidad:**
  - Lo que el nivel no lleva no entra a los datos. En Estructura no se leen nombres, correos ni teléfonos.
  - Sin las casillas marcadas no se leen correos ni teléfonos. Con ellas, solo los del titular.
  - Nunca van notas, fotos, costos ni la `descripcion` de unidades y puestos.
- **Seguridad:**
  - los datos van en `<script type="application/json" id="datos-visor">`, con `<`, `>`, `&`, U+2028 y U+2029 como `<`, `>`, `&`, ` ` y ` `;
  - el visor pone los textos con `textContent`, nunca `innerHTML`, salvo el SVG de `dibujarSvg`, que ya sale escapado;
  - la CSP: `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data:; base-uri 'none'; form-action 'none'`.
- **Dependencias:** ninguna nueva. El empaquetado usa `build` de `vite`.
- **Sitio:** no dice versiones, «próximamente» ni lo que falta. `novedades.json` acumula.
- **Al terminar:** `graphify update .`. En Bash, `git -C` y nunca `cd`.
- **Entrega:** un PR con `version:menor`.

## Review Focus

1. **Un nombre que se cuela en Estructura o un correo sin la casilla.** Puede colarse por la tarjeta, el panel, la búsqueda, la leyenda, el título de la página o el nombre del archivo.
   - Prueba: `estructura_no_lleva_personas` y `sin_casillas_no_lleva_contacto`, en la Task 1, y `html_de_estructura_sin_personas`, en la Task 2, buscando en el HTML entero.
2. **Un texto que rompe el archivo:** `</script>`, `<!--`, comillas o U+2028 en nombres de unidades, zonas, conexiones o la organización.
   - Prueba: `textos_peligrosos_quedan_escapados`, en la Task 2. Además, el programa empaquetado no contiene `</script` ni `<!--`.
3. **Plegar en la organización grande.** Debe reordenar sin congelar la página por segundos.
   - Medición en la Task 4.
4. **Una rama como alcance.** La raíz del visor es esa unidad: no aparecen sus superiores ni sus hermanas, y el panel muestra la ruta completa.
   - Prueba: `rama_como_alcance`, en la Task 1.
5. **Teclado en la lista.** `←` en una rama cerrada o sin ramas sube a su superior; `↑` y `↓` saltan lo plegado.
   - Prueba: `recorrido_de_la_lista`, en la Task 3.

---

## Task 1: Los datos del visor (puros) y `treeSvg` interactivo

**Files:**
- Modify:
  - `src/features/export/preparar.ts`: separar `contenidoImagen` (todo menos elk) de `prepararImagen`, sin cambiar lo que devuelve;
  - `src/features/export/treeSvg.ts`: la opción `interactivo` en `OpcionesDibujo`.
- Create: `src/features/visor/datos.ts` y `datos.test.ts`.
- Test: `src/features/export/treeSvg.test.ts`.

**Interfaces:**
- Produces:
  - `contenidoImagen(o: PedidoImagen): ContenidoImagen`, síncrona, con `{ g, unidades, plegadas, tam, opcionesLayout, tiposAlinear, tarjetas, leyenda, encabezado, zonasDatos }`. `prepararImagen` la llama y solo suma elk, posiciones, cajas, aristas, laterales y zonas dibujadas.
  - `OpcionesDibujo.interactivo?: { conRamas: ReadonlySet<string>; plegadas: ReadonlySet<string> }`:
    - cada tarjeta va dentro de `<g data-id="…" tabindex="0" role="button" aria-label="{título}">`;
    - las de `conRamas` suman un botón `<g data-plegar="…" tabindex="0" role="button" aria-label="…">`: un círculo con «+» si está en `plegadas` y con «−» si no, al centro del borde de abajo, o del borde derecho si la dirección es horizontal. Sus etiquetas son `visor.desplegar` y `visor.plegar` vía `e.t`;
    - sin la opción, el SVG queda idéntico al de hoy.
  - `interface PersonaPanel { cargo: string; nombre?: string; reemplazo?: string; correo?: string; telefono?: string }`. Sin `nombre` es vacante.
  - `interface DatosVisor`:
    - `{ version: 1; nivel; idioma: "es" | "en"; generado: string }`, con `generado` en fecha y hora para leer;
    - `encabezado`: el de `EntradaSvg`;
    - `unidades: Unidad[]`, las del alcance, con `descripcion: null`;
    - `puestos: Puesto[]`, solo los que dibuja «Como en pantalla» con «Ver puestos», con `descripcion: null`;
    - `conexiones`, `tiposAlinear`, `jefeEnTarjeta`, `tam`, `opcionesLayout` y `config: ConfigVista`;
    - `tarjetas: Tarjeta[]`, de todas las unidades y puestos, con `mas: 0`;
    - `zonas: { zonas: Zona[]; zonaUnidades: { zona_id: string; unidad_id: string }[] } | null`;
    - `leyenda`;
    - `plegadas: string[]`, al abrir;
    - `panel: Record<string, { ruta: string[]; jefatura?: PersonaPanel; personas: PersonaPanel[] }>`;
    - `textos: Record<string, string>`: las claves `visor.*`, `imagen.masUnidades`, `puesto.vacante` y `puesto.reemplazoDe`.
  - `datosVisor(o: PedidoImagen & { correo: boolean; telefono: boolean }): DatosVisor`:
    - lee el store a la fecha que se ve, como `prepararImagen`;
    - las tarjetas salen de `contenidoImagen({ ...o, abrirTodo: true })`, y `plegadas`, de `contenidoImagen(o)`;
    - el panel sale de `datosDePuestos` y `vigentes`:
      - en Estructura, los puestos van solo con `cargo`;
      - el correo y el teléfono son los del titular, solo con su casilla;
      - `jefatura` es el puesto `jefe_puesto_id`, que no se repite en `personas`.

- [ ] **Step 1: Pruebas que fallan** en `datos.test.ts`:
  - `estructura_no_lleva_personas`: `JSON.stringify(datosVisor({ nivel: "estructura", correo: true, telefono: true, … }))` no contiene «Ximena», «Bruno», «Carla», `@correo.cl` ni `+56 9`. Sí contiene «Bodega» y «Analista ZQX».
  - `sin_casillas_no_lleva_contacto`:
    - en Presentación, sin casillas: no contiene `@correo.cl` ni `+56 9`;
    - con ambas: `panel.g.jefatura` lleva `ZQX.w1@correo.cl` y `+56 9 ZQX w1`, y nada contiene `ZQX.w3@correo.cl`, porque Carla solo reemplaza.
  - `rama_como_alcance`: con `{ rama: "a2" }`, los ids de `unidades` son `a2`, `s1`, `s2` y `s3`, y `panel.s3.ruta` es `["Gerencia General", "Operaciones", "Logística", "Bodega"]`.
  - `plegadas_al_abrir`: sin `abrirTodo`, igual a `contenidoImagen(o).plegadas`; con `abrirTodo`, vacía.
  - `sin_descripciones`: ninguna unidad ni puesto lleva `descripcion` distinta de null.
- [ ] **Step 2: Pruebas que fallan** en `treeSvg.test.ts`:
  - `interactivo_marca_tarjetas_y_botones`: un `data-id` por tarjeta, `data-plegar` solo en las de `conRamas`, y «+» en las plegadas;
  - `sin_interactivo_igual_que_antes`: el SVG de hoy sin cambios.
- [ ] **Step 3:** `npx vitest run src/features/visor src/features/export/treeSvg.test.ts` → FAIL.
- [ ] **Step 4:** Implementar `contenidoImagen`, la opción `interactivo` y `datosVisor`.
- [ ] **Step 5:** `npx vitest run src/features` → PASS, con las pruebas de la imagen, el PDF y el manual sin cambios. Luego `npm run lint && npm run typecheck`.
- [ ] **Step 6: Commit** `feat(visor): datos del visor HTML y tarjetas interactivas en treeSvg`

## Task 2: El programa empaquetado y el archivo HTML

**Files:**
- Create:
  - `scripts/visor-programa.mjs`: el complemento de Vite;
  - `src/features/visor/programa/dibujo.ts`, `main.ts` y `estilos.ts`;
  - `src/features/visor/programa.d.ts`: `declare module "virtual:visor-programa" { const codigo: string; export default codigo }`;
  - `src/features/visor/html.ts`, `html.test.ts` y `programa/dibujo.test.ts`.
- Modify: `vite.config.ts` y `vitest.config.ts`, que suman `visorPrograma()` a `plugins`.

**Interfaces:**
- Consumes: `DatosVisor` (Task 1) y `dibujarSvg` con `interactivo`.
- Produces:
  - `visorPrograma(): Plugin`. Resuelve `virtual:visor-programa` y lo carga así:
    - `build` de `vite` con `configFile: false`, `logLevel: "silent"` y el alias `@`;
    - `build: { write: false, minify: true, lib: { entry: "src/features/visor/programa/main.ts", formats: ["iife"], name: "VisorBoldo" } }`;
    - devuelve `export default ${JSON.stringify(codigo)}`;
    - suma cada módulo de la salida con `this.addWatchFile`.
  - `dibujar(d: DatosVisor, plegadas: ReadonlySet<string>): Promise<{ svg: string; ancho: number; alto: number }>`, en `programa/dibujo.ts`:
    - el mismo camino de `prepararImagen`: `subgrafoVisible` → `grafoElk` → elk en la misma página (`elk.bundled.js`, sin worker) → `posiciones` → `cajasDibujadas` → `dibujarSvg(…, { interactivo })`;
    - `mas` de cada plegada = `descendientes(d.unidades, id).size`;
    - `t` lee `d.textos`, reemplaza `{n}` y `{nombre}`, y elige la forma de `a | b` (singular con n = 1, como vue-i18n).
  - `ESTILOS: string`, en `programa/estilos.ts`: el CSS del visor, con la paleta clara de `treeSvg`.
  - `armarHtml(d: DatosVisor, programa: string): Promise<string>`, en `html.ts`:
    - lanza un error si `programa` contiene `</script` o `<!--`;
    - el `<title>` con la organización y el alcance, escapados para HTML;
    - `<html lang>` según `d.idioma`;
    - un `<noscript>` con `visor.sinJavascript`;
    - las huellas con `crypto.subtle.digest("SHA-256", …)` en base64.
  - `leerDatos(html: string): DatosVisor`, para las pruebas y el arnés: extrae el bloque `#datos-visor` y lo parsea.
  - `main.ts` en esta Task solo lee `#datos-visor`, llama a `dibujar` con `d.plegadas` y pone el SVG en `<main data-visor="dibujo">`. La interfaz completa es la Task 3.

- [ ] **Step 1: Pruebas que fallan** en `html.test.ts`, con `programa` importado de `virtual:visor-programa`:
  - `textos_peligrosos_quedan_escapados`: una unidad `</script><img src=x onerror="window.x=1">`, una zona `<!-- a`, la organización `"&'` y una conexión con U+2028. El HTML no contiene esos textos en claro, y `leerDatos(html)` los devuelve iguales.
  - `html_de_estructura_sin_personas`: el HTML entero de Estructura no contiene «Ximena», «Bruno» ni «Carla».
  - `csp_con_huellas`: la meta CSP lleva `default-src 'none'`, y las dos huellas son el SHA-256 del contenido exacto del `<script>` del programa y del `<style>`.
  - `programa_seguro`: `programa` no contiene `</script` ni `<!--`, y `armarHtml(d, "a</script>b")` lanza un error.
  - `programa_sin_vue`: `programa` no contiene `createApp` y pesa menos de 2,5 MB.
- [ ] **Step 2: Pruebas que fallan** en `dibujo.test.ts`, con `datosVisor` del fixture:
  - `dibujar_igual_que_la_imagen`: con todo abierto, el mismo `ancho` y `alto` que `dibujarSvg(await prepararImagen({ …, abrirTodo: true }))`;
  - `plegar_reordena`: plegar `a2` baja la cantidad de `data-id`, y su tarjeta dice «+3 unidades».
- [ ] **Step 3:** `npx vitest run src/features/visor` → FAIL.
- [ ] **Step 4:** Implementar el complemento, `dibujo.ts`, `estilos.ts`, el `main.ts` mínimo y `html.ts`.
- [ ] **Step 5:** `npx vitest run src/features/visor` → PASS. `npx vite build` termina, y el texto empaquetado no está en el bundle principal: solo se importa desde `html.ts`.
- [ ] **Step 6: Commit** `feat(visor): programa empaquetado y archivo HTML con CSP`

## Task 3: La interfaz del visor

**Files:**
- Create:
  - `src/features/visor/programa/estado.ts` y `estado.test.ts`;
  - `src/features/visor/programa/interfaz.ts`.
- Modify: `programa/main.ts`, `estilos.ts`, `src/i18n/es.json` y `en.json` (claves `visor.*`).

**Interfaces:**
- Consumes: `DatosVisor` y `dibujar` (Task 2).
- Produces, en `estado.ts`, todas puras:
  - `plegar(p: Set<string>, id: string): Set<string>`, `desplegar(…)` y `abrirHasta(p, unidades, id): Set<string>`, que quita las plegadas en la ruta de `id`;
  - `buscar(d: DatosVisor, texto: string): { id: string; titulo: string; detalle: string }[]`, con `normalizarTexto`: unidades por nombre y, si el panel los lleva, personas y cargos. Máximo 50, en el orden del árbol;
  - `filasDeLista(d, plegadas): { id: string; nivel: number; conRamas: boolean; abierta: boolean }[]`;
  - `moverEnLista(filas, actual: string, tecla: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End"): { foco: string; abrir?: string; cerrar?: string }`. `←` en una rama abierta la cierra; en una cerrada o sin ramas, sube a su superior.
- `interfaz.ts`, armada con `createElement` y `textContent`, con un `data-visor` en cada parte:
  - **La barra:** logo, organización, `alcance · fecha`, «Generado el {generado}», la búsqueda con su lista de resultados (`role="listbox"`), los botones de acercar, alejar y encuadrar, y el cambio Diagrama | Lista.
  - **Diagrama:**
    - arrastrar mueve y la rueda acerca hacia el puntero, cambiando el `viewBox`;
    - `+`, `−` y `0`, fuera de la búsqueda;
    - un clic o `Enter` en `[data-id]` abre el panel; un clic, `Enter` o `Espacio` en `[data-plegar]` pliega;
    - mientras `dibujar` trabaja, «Ordenando…» (`role="status"`), y se descarta un resultado viejo si se pidió otro;
    - tras plegar, el foco vuelve al botón de esa tarjeta.
  - **Lista:** `role="tree"` con `treeitem`, `aria-level`, `aria-expanded` y foco con `tabindex` móvil, según `moverEnLista`. `Enter` abre el panel.
  - **Panel** (`role="dialog"`, `Esc` lo cierra):
    - la ruta, la jefatura y las personas;
    - «Vacante» y «Reemplazo de {nombre}»;
    - el correo como `mailto:` y el teléfono como `tel:`, con `href` armado con `encodeURIComponent`.
  - **Buscar y elegir:** `abrirHasta`, vuelve a dibujar, centra la tarjeta, la resalta con una clase y abre el panel.

- [ ] **Step 1: Pruebas que fallan** en `estado.test.ts`, con `datosVisor` del fixture:
  - `abrir_hasta`: con `a2` y `s1` plegadas, `abrirHasta(…, "s3")` deja ambas abiertas; con `a1` también plegada, `a1` sigue plegada;
  - `buscar_sin_tildes`: «logistica» encuentra «Logística»; en Estructura, «ximena» no encuentra nada; en Presentación, sí;
  - `recorrido_de_la_lista`, con todo abierto salvo lo que diga cada caso:
    - `↓` desde `a2` plegada va a la fila siguiente a sus hijos;
    - `←` en `s3` (sin ramas) va a `s1`;
    - `←` en `s1` abierta devuelve `cerrar: "s1"`;
    - `→` en `s1` cerrada devuelve `abrir: "s1"`;
    - `Home` y `End` van a la primera y a la última fila.
- [ ] **Step 2:** `npx vitest run src/features/visor/programa/estado.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `estado.ts`, `interfaz.ts`, los estilos (foco visible y contraste AA, medido con `contraste()`) y las claves `visor.*` en es y en.
- [ ] **Step 4:** `npx vitest run src/features/visor src/i18n` → PASS, con las mismas claves en es y en. Luego `npm run lint && npm run typecheck`.
- [ ] **Step 5: Probar a mano.** `html.test.ts` escribe el visor del fixture en `BOLDO_VISOR_SALIDA`, si esa variable existe. Abrirlo desde la carpeta en Edge y en Firefox: plegar, buscar, la lista con teclado y el panel. Sin errores de CSP en la consola.
- [ ] **Step 6: Commit** `feat(visor): barra, diagrama, lista, búsqueda y panel del visor`

## Task 4: El formato en el diálogo, textos, arnés y medición

**Files:**
- Modify:
  - `src/features/export/DialogoImagen.vue` y `DialogoImagen.test.ts`;
  - `src/features/export/formatos.ts` y `formatos.test.ts`: `nombreArchivo` acepta `"html"`;
  - `src/db/cliente.ts`: `archivoGuardar` acepta `"html"`;
  - `src-tauri/src/excel.rs`: `filtro_de("html") = Some("HTML")`, con su prueba;
  - `src/i18n/es.json` y `en.json`;
  - `ayuda/orden.json`, `site/novedades.json` y `site/textos/{es,en}/funciones.json`;
  - `scripts/probar-app.mjs`.
- Create:
  - `ayuda/es/exportar-visor.md` y `ayuda/en/exportar-visor.md`;
  - `src/features/visor/medirVisor.test.ts`.

**Interfaces:**
- Consumes: `datosVisor` (Task 1), `armarHtml` y `virtual:visor-programa` (Task 2).
- `DialogoImagen.vue`:
  - `FORMATOS` suma `"html"` («Visor HTML»);
  - con `html`, muestra las casillas Correo y Teléfono (`data-accion="visor-correo"` y `"visor-telefono"`), desmarcadas y apagadas en Estructura, y guardadas en la preferencia `imagen`;
  - oculta «Copiar imagen» y lo propio del PNG y el PDF;
  - al guardar, tras el aviso: `armarHtml(datosVisor(…), programa)` → `archivoGuardar(nombre, bytes, "html")` → `avisarGuardado`;
  - `programa` y `html.ts` se cargan con `import()` dinámico, para no cargarlos con el diálogo.

- [ ] **Step 1: Pruebas que fallan:**
  - en `DialogoImagen.test.ts`: con formato `html` aparecen las dos casillas, en Estructura salen apagadas, y no aparece «Copiar imagen»;
  - en `formatos.test.ts`: `nombreArchivo(…, "html", …)` termina en `.html`;
  - en `excel.rs`: `filtro_de("html")` es `Some("HTML")`, y `"htm"` y `"HTML"` siguen rechazados.
- [ ] **Step 2:** `npx vitest run src/features/export` y `cargo test --manifest-path src-tauri/Cargo.toml excel` → FAIL.
- [ ] **Step 3: Implementar,** con los textos:
  - la ayuda `exportar-visor` en es y en: qué lleva cada nivel, las casillas, que es una foto y que no pide nada a la red. Se registra en `ayuda/orden.json` después de `exportar-imagen`;
  - la novedad en `site/novedades.json`, con `"pagina": "exportar-visor"`;
  - la frase del visor en Funciones, en es y en.
- [ ] **Step 4:** `npx vitest run`, `cargo test --manifest-path src-tauri/Cargo.toml` y `npm test` en `site/` → PASS. Luego `npm run lint && npm run typecheck`.
- [ ] **Step 5: El arnés.** En `scripts/probar-app.mjs`, `exportarVisor(exe, carpeta)`, después de `exportarImagen` y con su misma siembra:
  1. renombra una unidad sembrada a `</script><img src=x onerror="window.__xss=1">`, comprobando `rutaBd`;
  2. guarda un visor de Presentación con `BOLDO_GUARDAR_EN`;
  3. abre el archivo en `msedge.exe --headless=new --remote-debugging-port=0 --user-data-dir=<carpeta>/edge`, dentro de la carpeta de prueba. El puerto sale de `DevToolsActivePort`;
  4. con `conectarCdp` y `Network.enable`, comprueba:
     - que dibuja más de una `[data-id]`;
     - que plegar la raíz deja una sola tarjeta;
     - que buscar el nombre de la unidad sembrada la encuentra;
     - que `ArrowDown` en la lista mueve el foco;
     - que no hubo `Network.requestWillBeSent` fuera del propio archivo ni de `data:`;
     - que no hubo entradas de log con «Content Security Policy»;
     - que `window.__xss` es `undefined` y el nombre se ve como texto;
  5. cierra Edge.
- [ ] **Step 6: Medición** en `medirVisor.test.ts`, como `medirPdf.test.ts`: solo con `BOLDO_MEDIR`, no corre en CI.
  - Con la organización grande, mide el tiempo de `datosVisor` + `armarHtml`, el peso del archivo, y el tiempo de `dibujar` al abrir, con «Abrir todas» y tras plegar una gerencia.
  - Las cifras se anotan en el PR. Si plegar con todo abierto pasa de 3 s, avisar al autor antes de seguir.
- [ ] **Step 7: Commit** `feat(visor): exportar el organigrama como visor HTML`. Después `graphify update .` y abrir el PR con `version:menor`.
