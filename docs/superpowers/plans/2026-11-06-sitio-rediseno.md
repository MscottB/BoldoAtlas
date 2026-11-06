# Rediseño del sitio web: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar el sitio de BoldoAtlas en páginas de producto (Inicio, Funciones, Seguridad y privacidad) con un menú «Producto ▾», un aspecto nuevo y el manual con su propia cabecera.

**Architecture:** Mismo VitePress. Los textos salen de los componentes a JSON por página e idioma en `site/textos/`. Cuatro piezas comunes (`Portada`, `BloqueFuncion`, `Garantias`, `LlamadaDescarga`) arman tres componentes de página (`Inicio`, `Funciones`, `Seguridad`). Un `Layout.vue` propio envuelve el tema por defecto para separar la cabecera del producto de la del manual, y lleva las anclas viejas de la portada a su lugar nuevo.

**Tech Stack:** VitePress 1.6.4, Vue 3, TypeScript, `node --test` (Node 26, que importa `.ts` directamente).

**Spec:** `docs/superpowers/specs/2026-11-06-sitio-rediseno-design.md`

## Global Constraints

- Todo se hace dentro de `site/` (más `README.md` y `README.es.md` en la Task 5). No se agregan dependencias.
- Todo lo que el sitio afirma es cierto hoy en el código. Los textos nuevos salen del manual (`ayuda/es/*.md`, `ayuda/en/*.md`), de `SECURITY.md` o de los textos que ya están en `site/.vitepress/theme/Presentacion.vue`. Nada se inventa: ni testimonios, ni clientes, ni precios.
- Sin «Próximamente», «por ahora», fases, funciones futuras ni números de versión. Nada de lo que le falta al producto: de `SECURITY.md` se toma «Qué protege hoy la app», nunca «Qué no protege». Nada que explique cómo está armada la página.
- Seguridad: «te ayuda a cumplir», nunca «cumple».
- Español e inglés con el mismo contenido y las mismas claves. En inglés, todo enlace interno empieza con `/en/`.
- Sin cookies, analítica ni rastreo. Sin fotos de archivo: solo capturas de `docs/capturas/sitio/` o de `ayuda/img/<idioma>/`.
- Accesibilidad: contraste AA, teclado, foco visible, `alt` en cada captura y `@media (prefers-reduced-motion: reduce)` sin transiciones.
- Colores: azul noche `#1e2a38`, cobre `#c8743f` y fondo cálido `#f6f3ef` en las páginas de producto. Tema oscuro equivalente. Títulos de Inicio de 40 a 56 px; cuerpo de producto de 17 px.
- Celular (375 px): una columna, sin desplazamiento horizontal; la captura de la portada va debajo del texto.
- `site/novedades.json` no cambia: el rediseño del sitio no es una novedad de la app.
- Formato: `npx prettier --write --end-of-line auto <archivos>` desde la raíz del repo, con su `.prettierrc`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos del sitio desde `site/`: `npm test` y `npm run build`.

## Review Focus

1. **Enlaces viejos desde fuera** (un correo o un README con `…/BoldoAtlas/#funciones` o `…/en/#confianza`): deben llegar a su lugar nuevo, también en inglés y con las anclas de cada función (`#arboles`, `#compartir` y las demás). Lo cubre la prueba de `destinoAncla` en la Task 5.
2. **Cambiar de idioma en una página nueva** (`/funciones` → English): no debe dar 404. Lo cubre la prueba «cada página tiene su par en inglés» en la Task 1.
3. **Un enlace al manual con un ancla que ya no existe** después de editar `ayuda/`: la prueba debe fallar. Lo cubre la prueba de enlaces de la Task 1.
4. **Tema oscuro**: una captura con versión clara y oscura debe mostrar la del tema activo, y el fondo cálido debe tener su equivalente oscuro con contraste AA. Se revisa en el navegador en la Task 6.
5. **Buscar desde una página de producto**: el buscador solo aparece en el manual y solo encuentra páginas del manual. Lo cubre la prueba sobre `config.mts` en la Task 5.

---

### Task 1: Reglas compartidas y prueba de textos

**Files:**
- Create: `site/scripts/reglas.mjs`
- Create: `site/scripts/textos.test.mjs`
- Create: `site/textos/es/comunes.json`, `site/textos/en/comunes.json`
- Modify: `site/scripts/novedades.test.mjs` (usa `reglas.mjs` en vez de su propia `PROHIBIDO` y su propio slug)

**Interfaces:**
- Produces, en `site/scripts/reglas.mjs`:
  - `PROHIBIDO: RegExp`, la misma expresión que hoy está en `novedades.test.mjs`;
  - `slugTitulo(titulo: string): string`, el mismo cálculo que hoy está en línea en `novedades.test.mjs`;
  - `anclasAyuda(idioma: "es" | "en", pagina: string): string[]`, los slugs de los títulos `##` y `###` de `ayuda/<idioma>/<pagina>.md`;
  - `recorrer(nodo, visita: (valor, clave) => void): void`, que recorre en profundidad objetos y arreglos de JSON.
- Produces `site/textos/<idioma>/comunes.json` con esta forma, la misma en los dos idiomas:

```json
{
  "garantias": ["Gratis y de código abierto", "Sin cuentas", "No necesita internet", "Windows · Linux · macOS"],
  "llamada": { "titulo": "", "texto": "", "descargar": "", "recomendada": "", "manual": "", "para": "", "nota": "" },
  "manual": { "titulo": "BoldoAtlas · Manual", "volver": "Volver al sitio" },
  "rutas": { "inicio": "/", "funciones": "/funciones", "seguridad": "/seguridad", "comparar": "/comparar", "novedades": "/novedades", "descargas": "/descargas", "acerca": "/acerca", "manual": "/manual/inicio" }
}
```

  `llamada` lleva los textos de `TEXTOS.<idioma>.final` de `Presentacion.vue`. En inglés, cada ruta lleva `/en` delante (`/en/`, `/en/funciones`…) y `manual` es `{ "titulo": "BoldoAtlas · Manual", "volver": "Back to the site" }`.
- Formas que la prueba reconoce en cualquier JSON de `site/textos/`:
  - un **enlace** es un objeto `{ "texto", "href" }`;
  - una **imagen** es un objeto con `nombre`, `ancho`, `alto`, `alt` y `temas`, y opcionalmente `ayuda` y `leyenda`, igual que `Funcion.imagen` en `Presentacion.vue`;
  - un **id** es el valor de una clave `id`.

- [ ] **Step 1: Escribir `site/scripts/textos.test.mjs` con estas pruebas, que deben fallar**

```js
test("cada archivo de textos tiene su par en inglés, con las mismas claves y el mismo largo en cada lista");
// forma(nodo): string para las hojas; arreglo de formas; objeto clave→forma. assert.deepEqual(forma(es), forma(en)).
test("ningún texto tiene versiones, «Próximamente», fases ni «cumple»");
// recorrer cada JSON de es/ y en/; cada string, salvo los valores de "href", con assert.doesNotMatch(valor, PROHIBIDO).
test("los enlaces internos en inglés empiezan con /en/ y los de español no");
test("cada enlace al manual va a una página y a un ancla que existen");
// /^(\/en)?\/manual\/([a-z-]+)(?:#([a-z0-9-]+))?$/ → existsSync(ayuda/<idioma>/<pagina>.md) y anclasAyuda(...).includes(ancla).
test("cada enlace a otra página del sitio va a una página que existe");
// "/" o "/en/" → index.md; "/x" o "/en/x" → site/x.md o site/en/x.md, que existirá cuando su task la cree.
// Las anclas de /funciones y /seguridad se comprueban contra los "id" de funciones.json y seguridad.json; las de
// páginas en markdown, contra sus títulos (slugTitulo) y sus {#id}.
test("cada captura existe y lleva texto alternativo");
// ayuda:true → ayuda/img/<idioma>/<nombre>.webp; temas:true → docs/capturas/sitio/<nombre>-<idioma>-claro.webp y
// -oscuro.webp; si no, docs/capturas/sitio/<nombre>.webp. Y alt.trim() no vacío.
test("cada página del sitio tiene su par en inglés");
// cada site/*.md (salvo README.md) tiene site/en/<mismo>.md.
```

- [ ] **Step 2: Correr `npm test` desde `site/`**

Esperado: FAIL, porque faltan `reglas.mjs` y `site/textos/`.

- [ ] **Step 3: Crear `reglas.mjs`, los dos `comunes.json` y cambiar `novedades.test.mjs` para que importe `PROHIBIDO` y `slugTitulo` de `reglas.mjs`**

La prueba de la lista de palabras prohibidas se queda en `novedades.test.mjs`.

- [ ] **Step 4: Correr `npm test`**

Esperado: PASS, con todas las pruebas de antes más las nuevas.

- [ ] **Step 5: Commit**

```bash
git add site/scripts/reglas.mjs site/scripts/textos.test.mjs site/scripts/novedades.test.mjs site/textos
git commit -m "docs: textos del sitio en site/textos y prueba que los revisa"
```

---

### Task 2: Piezas comunes e Inicio

**Files:**
- Create: `site/.vitepress/theme/tipos.ts`, `iconos.ts`, `imagenes.ts`, `textos.ts`
- Create: `site/.vitepress/theme/Portada.vue`, `BloqueFuncion.vue`, `Garantias.vue`, `LlamadaDescarga.vue`, `Inicio.vue`
- Create: `site/textos/es/inicio.json`, `site/textos/en/inicio.json`
- Create: `site/textos/es/funciones.json`, `site/textos/en/funciones.json`. Aquí van solo las 3 funciones que Inicio destaca; la Task 3 completa las 10.
- Modify: `site/.vitepress/theme/index.ts` (registra `Inicio`), `custom.css` (colores y tipografía de producto), `portadaNovedades.ts` (`PORTADA = 3`)
- Modify: `site/index.md`, `site/en/index.md`: `layout: page`, sin `hero`, con el `title` y la `description` de hoy y `<Inicio lang="es" />` o `<Inicio lang="en" />`
- Modify: `site/scripts/novedades.test.mjs` (la portada muestra 3; la prueba de «hayMas» mira `Inicio.vue`; la lista de palabras prohibidas suma los `.vue` nuevos)

**Interfaces:**
- Consumes: `comunes.json` y su forma, de la Task 1.
- Produces:
  - `tipos.ts`:
    - `type Lang = "es" | "en"`;
    - `interface Enlace { texto: string; href: string }`;
    - `interface Imagen { nombre: string; ancho: number; alto: number; alt: string; temas: boolean; ayuda?: boolean; leyenda?: string }`;
    - `interface Funcion { id: string; etiqueta: string; titulo: string; texto: string; puntos: string[]; imagen: Imagen; enlace?: Enlace }`.
  - `iconos.ts`: `ICONOS: Record<string, string>`, movido tal cual desde `Presentacion.vue`.
  - `imagenes.ts`: `fuenteImagen(lang: Lang, imagen: Imagen, tema: "claro" | "oscuro"): string` (la `fuente` de `Presentacion.vue`) y `enlace(href: string): string` (`withBase` salvo para `http…`).
  - `textos.ts`: `textos(lang: Lang)`, que devuelve `{ comunes, inicio, funciones, seguridad }` desde los JSON. `seguridad` se suma en la Task 4.
  - Piezas:
    - `Portada.vue`: props `{ lang: Lang }`. Lee `inicio.portada` y `comunes.garantias`.
    - `BloqueFuncion.vue`: props `{ lang: Lang; funcion: Funcion; inverso?: boolean; resumen?: boolean }`.
      - Completo: `<article :id="funcion.id">`, título `h2`, puntos y enlace.
      - Con `resumen`: sin `id`, título `h3`, sin puntos, y un enlace «Ver más» / «Learn more» a `rutas.funciones#<id>`.
    - `Garantias.vue`: props `{ items: { icono: string; titulo: string; texto: string; enlace?: Enlace }[] }`.
    - `LlamadaDescarga.vue`: props `{ lang: Lang }`. Lee `comunes.llamada` y `comunes.rutas`.
  - `inicio.json`:

```json
{
  "portada": { "titulo": "", "texto": "", "descargar": "", "imagen": { "nombre": "arbol", "ancho": 1100, "alto": 915, "temas": true, "alt": "" } },
  "beneficios": { "etiqueta": "", "titulo": "", "items": [{ "titulo": "", "texto": "", "enlace": { "texto": "", "href": "" } }] },
  "destacadas": { "etiqueta": "", "titulo": "", "ids": ["arboles", "personas", "fechas"], "todas": "" },
  "nuevo": { "etiqueta": "", "titulo": "", "todas": "" },
  "garantias": { "items": [{ "icono": "codigo", "titulo": "", "texto": "", "enlace": { "texto": "", "href": "" } }] }
}
```

  - `funciones.json`: `{ "etiqueta", "titulo", "bajada", "cifras", "nota", "items": Funcion[], "comparar": { "titulo", "texto", "enlace" } }`.

- [ ] **Step 1: Ajustar `novedades.test.mjs`, que debe fallar**

Cambios en las pruebas:
- `PORTADA` es 3: «la portada toma solo las 3 primeras». La lista de prueba sigue con 9 y espera los ids `n0` a `n2`.
- «la portada enlaza a todas las novedades solo si hay más de 3»:
  - lee `Inicio.vue` y comprueba `const hayMas = novedades.length > PORTADA`;
  - comprueba que el enlace a todas use `t.comunes.rutas.novedades`.
- La lista de palabras prohibidas suma `Inicio.vue`, `Portada.vue`, `BloqueFuncion.vue`, `Garantias.vue` y `LlamadaDescarga.vue`.

- [ ] **Step 2: Correr `npm test`**

Esperado: FAIL, porque `PORTADA` es 6 y falta `Inicio.vue`.

- [ ] **Step 3: Escribir `inicio.json` y `funciones.json` en los dos idiomas**

Origen de cada texto:
- `portada`: el mensaje del hero de `index.md` de hoy, con un título corto.
- `beneficios`: 4 de las 6 `razones` de `Presentacion.vue`, cada una con una línea de texto y su enlace.
- `cifras` y `nota`: las de `porQue`.
- `comparar`: el de `porQue.comparar`.
- Las 3 funciones destacadas: `arboles`, `personas` y `fechas`, de `funciones.items`.
- `garantias.items`: los 4 de `confianza`. Su enlace va a `/seguridad#<id>`, con los ids de seguridad que fija la Task 4. Hasta esa task, la prueba de enlaces avisa que falta la página; para no dejarla en rojo, en esta task enlazan a `/descargas#verificar-la-descarga` y al repositorio, como hoy, y la Task 4 los cambia.

- [ ] **Step 4: Escribir las piezas, `Inicio.vue`, los estilos y las dos páginas**

Orden de `Inicio.vue`:
1. `Portada`.
2. `<section aria-labelledby="por-que">` con los beneficios. El `h2` lleva `id="por-que"`.
3. Destacadas: las funciones de `funciones.items` cuyo `id` está en `destacadas.ids`, con `BloqueFuncion resumen`, alternando `inverso`, y un enlace con `destacadas.todas` a `comunes.rutas.funciones`. Los enlaces que salen de `comunes.rutas`, como este y el «Ver más» de cada bloque, no pasan por la prueba de enlaces; el sitio los tiene completos al terminar la Task 3.
4. `<section aria-labelledby="lo-nuevo">` con `<Novedades :lang ultimas />` y el enlace a todas si `hayMas`.
5. `Garantias` con `inicio.garantias.items`.
6. `LlamadaDescarga`.

Estilos de `Portada.vue`:
- Fondo `#f6f3ef`, con un equivalente oscuro en `.dark`.
- Dos columnas desde 768 px y una columna debajo de eso.
- La captura usa `transform: perspective(…) rotateY(…)` hacia el texto, y sin rotación debajo de 768 px.
- Las capturas con `temas` llevan `solo-claro` y `solo-oscuro`, como en `Presentacion.vue`.
- Con `prefers-reduced-motion: reduce`, sin transiciones.

En `custom.css`: el fondo cálido y el cuerpo de 17 px, bajo la clase `.es-producto` que pondrá la Task 5. Hasta entonces, `Inicio.vue` puede poner su propio fondo.

- [ ] **Step 5: Correr `npm test` y `npm run build`**

Esperado: las dos pasan.

- [ ] **Step 6: Mirar `/` y `/en/` con `npm run preview`**

Revisar en tema claro, en oscuro y a 375 px de ancho.

- [ ] **Step 7: Formatear y hacer commit**

```bash
git add site
git commit -m "docs: Inicio nuevo con portada, beneficios, funciones destacadas y garantías"
```

---

### Task 3: Página Funciones

**Files:**
- Create: `site/.vitepress/theme/Funciones.vue`
- Create: `site/funciones.md`, `site/en/funciones.md`: `layout: page`, `title` («Funciones» / «Features»), `description`, y `<Funciones lang="es" />` o `<Funciones lang="en" />`
- Modify: `site/textos/es/funciones.json`, `site/textos/en/funciones.json` (las 10 funciones)
- Modify: `site/.vitepress/theme/index.ts` (registra `Funciones`), `site/scripts/novedades.test.mjs` (suma `Funciones.vue`, `funciones.md` y `en/funciones.md` a la lista de palabras prohibidas)

**Interfaces:**
- Consumes: `BloqueFuncion`, `LlamadaDescarga`, `textos()` y `Funcion`, de la Task 2.
- Produces: estos `id` en `funciones.json`, en este orden. La Task 5 redirige a ellos:

| id | Función | Captura |
|---|---|---|
| `arboles` | árbol y zonas | `arbol`, con temas |
| `conexiones` | conexiones | `arbol-conexion`, de la ayuda |
| `organizaciones` | varias organizaciones | `inicio-organizacion`, de la ayuda |
| `personas` | puestos, fichas y vacantes | `ficha`, con temas |
| `fechas` | ver a una fecha | `fecha`, con temas |
| `revision` | Revisión | `revision-lista`, de la ayuda |
| `directorio` | directorio y búsqueda | `directorio`, con temas |
| `compartir` | exportar e importar | `importar-revision`, de la ayuda |
| `portable` | respaldos y portable | `respaldos`, con temas |
| `sistemas` | idiomas y sistemas | `idioma-en-oscuro` |

Las funciones que ya existen en `Presentacion.vue` se copian tal cual. Las 3 nuevas salen del manual:
- `conexiones`: `ayuda/<idioma>/arbol.md`, sección «Conexiones».
- `organizaciones`: `ayuda/<idioma>/organizaciones.md`.
- `revision`: `ayuda/<idioma>/revision.md`.

Cada una lleva su enlace al tema del manual. «Zonas» deja de ser un punto de `arboles` y pasa al texto de esa función. La línea de varias organizaciones que hoy está en `portable` pasa a `organizaciones`.

- [ ] **Step 1: Agregar a `textos.test.mjs` la prueba «funciones.json trae las 10 funciones, en orden y con estos id», que debe fallar**

```js
assert.deepEqual(funciones.items.map((f) => f.id), ["arboles", "conexiones", "organizaciones", "personas", "fechas", "revision", "directorio", "compartir", "portable", "sistemas"]);
```

La prueba corre para `es` y para `en`.

- [ ] **Step 2: Correr `npm test`**

Esperado: FAIL.

- [ ] **Step 3: Completar los dos `funciones.json` y escribir `Funciones.vue` y las dos páginas**

Orden de `Funciones.vue`:
1. Cabecera con `etiqueta`, `h1` con `titulo` y `bajada`.
2. Las `cifras` con su `nota`.
3. Los 10 `BloqueFuncion`, alternando `inverso`.
4. La caja `comparar`, con enlace a `rutas.comparar`.
5. `LlamadaDescarga`.

- [ ] **Step 4: Correr `npm test` y `npm run build`, y mirar `/funciones` y `/en/funciones` en claro, oscuro y 375 px**

Esperado: las pruebas y el build pasan.

- [ ] **Step 5: Formatear y hacer commit**

```bash
git add site
git commit -m "docs: página Funciones con las diez funciones y su captura"
```

---

### Task 4: Seguridad y privacidad, Acerca de con preguntas, y adiós a Presentacion.vue

**Files:**
- Create: `site/.vitepress/theme/Seguridad.vue`
- Create: `site/seguridad.md`, `site/en/seguridad.md`: `layout: page`, `title` («Seguridad y privacidad» / «Security and privacy»), `description`, y `<Seguridad lang="es" />` o `<Seguridad lang="en" />`
- Create: `site/textos/es/seguridad.json`, `site/textos/en/seguridad.json`
- Modify: `site/acerca.md`, `site/en/acerca.md`
- Modify: `site/textos/<idioma>/inicio.json` (las garantías enlazan a `/seguridad#<id>`)
- Modify: `site/.vitepress/theme/textos.ts` (suma `seguridad`), `index.ts` (registra `Seguridad`; quita `Presentacion`)
- Delete: `site/.vitepress/theme/Presentacion.vue`
- Modify: `site/scripts/novedades.test.mjs`, `site/scripts/comparador.test.mjs`. Ya no leen `Presentacion.vue`: las rutas `comparar` y `novedades` se comprueban en `site/textos/<idioma>/comunes.json`. La lista de palabras prohibidas suma `Seguridad.vue`, `seguridad.md` y `en/seguridad.md`.

**Interfaces:**
- Consumes: `textos()`, `Garantias` y `LlamadaDescarga`, de la Task 2.
- Produces: `seguridad.json` con `{ "etiqueta", "titulo", "bajada", "secciones": [{ "id", "titulo", "parrafos": string[], "puntos"?: string[], "enlace"?: Enlace }] }` y estos `id`, en este orden:

| id | Sección | Origen |
|---|---|---|
| `donde-quedan` | dónde quedan los datos | `ayuda/<idioma>/inicio.md` («Dónde quedan tus datos») |
| `conexion` | la única conexión automática y cómo apagarla | `ayuda/<idioma>/actualizaciones.md` |
| `cifrado` | archivos `.boldo` cifrados | `ayuda/<idioma>/exportar-importar.md` |
| `archivos-externos` | las bases `.db` que abres desde otra carpeta | `ayuda/<idioma>/organizaciones.md` |
| `verificar` | verificar la descarga y abrir un programa sin firma | `site/descargas.md` |
| `reportar` | reportar un problema | `SECURITY.md` |
| `cumplir` | «te ayuda a cumplir» | `SECURITY.md` y la `confianza` de hoy |

`SECURITY.md` se usa solo en «Qué protege hoy la app» y «Cómo reportar una vulnerabilidad».

En `acerca.md` y `en/acerca.md` se agrega `## Preguntas frecuentes {#preguntas}` (`## Frequently asked questions {#preguntas}`). Debajo va un `### pregunta` con su respuesta en markdown por cada item de `preguntas` de `Presentacion.vue`, con sus enlaces.

- [ ] **Step 1: Agregar a `textos.test.mjs` las pruebas, que deben fallar**

```js
test("seguridad.json trae sus 7 secciones, en orden y con estos id");
// ["donde-quedan", "conexion", "cifrado", "archivos-externos", "verificar", "reportar", "cumplir"] en es y en
test("Acerca de trae las preguntas frecuentes en los dos idiomas");
// acerca.md y en/acerca.md tienen el título con {#preguntas} y al menos 6 títulos ###
test("las garantías de Inicio enlazan a Seguridad");
// cada inicio.garantias.items[].enlace.href empieza con rutas.seguridad
```

- [ ] **Step 2: Correr `npm test`**

Esperado: FAIL.

- [ ] **Step 3: Escribir los textos, `Seguridad.vue`, las páginas y las preguntas; borrar `Presentacion.vue` y cambiar las pruebas que la leían**

Orden de `Seguridad.vue`:
1. Cabecera.
2. Una `section` por item de `secciones`, con `h2 :id="s.id"`.
3. `LlamadaDescarga`.

Verificar con `grep -rn Presentacion site/` que ya nada la nombra. El grep no debe encontrar nada.

- [ ] **Step 4: Correr `npm test` y `npm run build`, y mirar `/seguridad`, `/acerca` y sus páginas en inglés en claro, oscuro y 375 px**

Esperado: las pruebas y el build pasan.

- [ ] **Step 5: Formatear y hacer commit**

```bash
git add -A site
git commit -m "docs: página de seguridad y privacidad, preguntas en Acerca de y la portada vieja repartida"
```

---

### Task 5: Menú, cabecera del manual, anclas viejas y README

**Files:**
- Create: `site/.vitepress/theme/anclasViejas.ts`
- Create: `site/.vitepress/theme/Layout.vue`
- Create: `site/scripts/sitio.test.mjs`
- Modify: `site/.vitepress/config.mts`
- Modify: `site/.vitepress/theme/index.ts` (`Layout`), `custom.css`
- Modify: `README.md`, `README.es.md` (los enlaces de arriba suman Funciones y Seguridad)

**Interfaces:**
- Consumes: `comunes.manual` y `comunes.rutas`, de la Task 1.
- Produces, en `anclasViejas.ts`: `destinoAncla(ruta: string, hash: string): string | null`.
  - `ruta` va sin `base`: `/` o `/en/`. `hash` va con `#`.
  - Para otra ruta, o un hash que no está en la tabla, devuelve `null`.
  - `#por-que` y `#lo-nuevo` siguen en Inicio y devuelven `null`.

| hash | destino (en inglés, con `/en` delante) |
|---|---|
| `#funciones` | `/funciones` |
| `#arboles`, `#personas`, `#fechas`, `#directorio`, `#portable`, `#compartir`, `#sistemas` | `/funciones#<mismo>` |
| `#confianza` | `/seguridad` |
| `#preguntas` | `/acerca#preguntas` |

- [ ] **Step 1: Escribir `site/scripts/sitio.test.mjs`, que debe fallar**

```js
test("las anclas viejas de la portada llevan a su lugar nuevo, en los dos idiomas", () => {
  assert.equal(destinoAncla("/", "#funciones"), "/funciones");
  assert.equal(destinoAncla("/", "#compartir"), "/funciones#compartir");
  assert.equal(destinoAncla("/en/", "#confianza"), "/en/seguridad");
  assert.equal(destinoAncla("/en/", "#preguntas"), "/en/acerca#preguntas");
  assert.equal(destinoAncla("/", "#por-que"), null);
  assert.equal(destinoAncla("/", "#lo-nuevo"), null);
  assert.equal(destinoAncla("/descargas", "#funciones"), null);
  assert.equal(destinoAncla("/", "#otra"), null);
});
test("el menú: Producto ▾ con sus 4 páginas, luego Manual, Acerca de y Descargar, en los dos idiomas");
// lee config.mts como texto: "Producto" con items Funciones, Seguridad y privacidad, Comparar y Novedades, en ese orden;
// "Product" con Features, Security and privacy, Compare y What's new; sin "Por qué" ni "Why".
test("el buscador solo indexa el manual");
// config.mts: search.options._render devuelve "" si env.relativePath no está bajo manual/ ni en/manual/.
```

- [ ] **Step 2: Correr `npm test`**

Esperado: FAIL.

- [ ] **Step 3: Implementar `destinoAncla`, el menú y el buscador**

Menú en `config.mts`:
- `nav` en español: `{ text: "Producto", items: [Funciones, Seguridad y privacidad, Comparar, Novedades] }`, Manual (`activeMatch: "/manual/"`), Acerca de, Descargar (`/descargas`).
- `nav` en inglés: lo mismo, con `/en/`.
- Sale «Por qué».

Buscador: `search.options._render(src, env, md)` hace `md.render(src, env)` y devuelve `""` fuera del manual.

- [ ] **Step 4: Escribir `Layout.vue`**

Envuelve `DefaultTheme.Layout`:
- Clase raíz `es-manual` si la ruta, sin `base`, empieza con `/manual/` o `/en/manual/`, y `es-producto` si no.
- En el manual:
  - slot `nav-bar-title-after` con `comunes.manual.titulo`;
  - slot `nav-bar-content-before` con un enlace a `rutas.inicio` y el texto `comunes.manual.volver`;
  - el mismo enlace en `nav-screen-content-before`, para el menú del celular.
- En `onMounted` y en cada cambio de ruta: si `destinoAncla(ruta, location.hash)` da un destino, `router.go(withBase(destino))`.

Estilos en `custom.css`:
- `.es-manual .VPNavBarMenu` y `.es-manual .VPNavScreenMenu` ocultos.
- `.es-producto .VPNavBarSearch` oculto.
- El enlace del menú que termina en `/descargas` en cobre, como botón, con foco visible.
- El fondo cálido y el cuerpo de 17 px de la Task 2, bajo `.es-producto`.

- [ ] **Step 5: Cambiar los enlaces de arriba de `README.md` y `README.es.md`**

Sitio · Funciones · Seguridad y privacidad · Descargar, con las URL `https://mscottb.github.io/BoldoAtlas/funciones` y `/seguridad`, y sus pares `/en/` en el README en inglés.

- [ ] **Step 6: Correr `npm test` y `npm run build`, y probar en `npm run preview`**

Esperado: las pruebas y el build pasan. En el navegador:
- `/BoldoAtlas/#compartir` llega a `/BoldoAtlas/funciones#compartir`.
- En el manual se ven el título, «Volver al sitio», el buscador y el menú lateral, sin «Producto».
- En Inicio no aparece el buscador.
- El menú del celular funciona en los dos casos.

- [ ] **Step 7: Formatear y hacer commit**

```bash
git add site README.md README.es.md
git commit -m "docs: menú Producto, cabecera propia del manual y anclas viejas que llevan a su lugar"
```

---

### Task 6: Comprobación final y capturas para el autor (sin commit)

- [ ] **Step 1: Correr `npm ci`, `npm test` y `npm run build` desde `site/`**

Esperado: todo pasa.

- [ ] **Step 2: Mirar cada página en `npm run preview`**

Páginas: Inicio, Funciones, Seguridad, Comparar, Novedades, Descargas, Acerca de y una del manual, en español y en inglés. Revisar cada una:
- en tema claro y en tema oscuro;
- a 1280 px y a 375 px, sin desplazamiento horizontal;
- con teclado (Tab llega al menú, al desplegable y al botón Descargar, con foco visible);
- con contraste AA en el fondo cálido y en el oscuro.

- [ ] **Step 3: Guardar capturas y mostrárselas al autor antes de abrir el PR**

Capturas de cada página en claro y oscuro, y de Inicio y Funciones a 375 px, en el scratchpad de la sesión.

- [ ] **Step 4: Abrir el PR**

Después del visto bueno del autor, el PR va con el título `docs: rediseño del sitio web`. Es solo de sitio y documentación: publica la web y no genera una versión de la app.
