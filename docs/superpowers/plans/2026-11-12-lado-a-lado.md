# Varias organizaciones, entrega 3 (Lado a lado) y Task 29b: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver dos pestañas a la vez, lado a lado o una sobre otra, con un divisor movible. Con la misma organización, los dos paneles se editan; con otra organización, el segundo panel muestra cualquiera de sus vistas de trabajo en solo lectura, sin que nada se mezcle.

**Architecture:** El panel principal sigue siendo el de hoy, con el router de la app. El segundo panel monta su pestaña con un router propio en memoria (`createMemoryHistory`), que se le entrega con `provide(routerKey)` y `provide(routeLocationKey)`: las vistas no cambian. Con otra organización, el segundo panel es un `<iframe>` de la misma app en «modo lado». El iframe tiene su propio JavaScript, con su Pinia, sus stores, su router y su `baseActual()`. Así ningún singleton se comparte. Habla con Rust por un puente que solo deja pasar `db_consultar`, siempre con el id de la otra. Rust la lee de un temporal de solo lectura, con `copiar_otra` de la entrega 2, y no tiene ningún comando que escriba en ella.

**Tech Stack:** Tauri 2, Rust (rusqlite), Vue 3, vue-router 5 (`createMemoryHistory`, `routerKey`, `routeLocationKey`), Pinia, vue-i18n, Vitest, el arnés de `scripts/arnes-organizaciones.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-02-varias-organizaciones-design.md`, sección «Entrega 3: Lado a lado», más «El seguro contra mezclas» y «Pruebas». Task 29b de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md` (Anexo 8). Sigue a `docs/superpowers/plans/2026-11-11-comparar-organizaciones.md` (entrega 2, publicada en 0.2.0).

## Decisiones tomadas al planificar

**[VISIBLE]** cambia algo que el autor verá.

1. **[VISIBLE] Dos PR, cada uno con `version:menor`.** El PR A trae la vista dividida con la misma organización (Task 29b). El PR B trae otra organización al lado. Cada uno se usa solo y lleva su ayuda, su novedad y su medición. El autor eligió (2026-11-12) que la otra organización muestre **todas las vistas** de trabajo: Árbol, Árboles, Directorio y Revisión. Eso duplica el trabajo de solo lectura, y por eso va aparte.
2. **Cómo se separan los stores de la otra organización (la spec lo deja al plan).** Se usa un `<iframe>` y no una segunda instancia en el mismo JavaScript. Hoy hay 50 archivos que llaman a `useOrganizacion()`, 7 que usan `baseActual()` y varios estados de módulo (`paletaAbierta`, `soltando`, las preferencias). Una segunda instancia obligaría a revisar cada llamada hecha fuera de un `setup`. Un descuido mostraría datos de la abierta en el panel de la otra o, peor, escribiría en la abierta con ids de la otra: dos organizaciones con el mismo origen comparten ids. El iframe separa todo por construcción, y Rust rechaza cualquier escritura con el id de la otra (`otra_base`). Lo que cuesta es memoria: un segundo Vue con sus datos. Se mide en la Task 10.
3. **El iframe no depende de que Tauri le dé IPC.** Al arrancar en modo lado, la app define su propio `window.__TAURI_INTERNALS__`. Su `invoke` solo deja pasar `db_consultar`, le fija `baseId` con el id de la otra, llama al `invoke` del padre (mismo origen) y copia el resultado con `structuredClone`, para que los objetos sean del iframe. Cualquier otro comando se rechaza con `solo_lectura`. `convertFileSrc` es el del padre, así que las fotos llegan por `foto://<idOtra>/<id>`.
4. **[VISIBLE] Cómo se abre.**
   - Botón **Dividir** en la barra superior: abre al lado una pestaña nueva con la misma vista. Con la vista ya dividida, el mismo botón la cierra.
   - Menú contextual de cada pestaña (es nuevo; clic derecho o `Mayús`+`F10`): **Abrir al lado** o **Quitar de al lado**.
   - En la paleta: **Dividir la vista** / **Cerrar la vista dividida** y, en el PR B, **Ver «<nombre>» al lado** por cada organización que no es la abierta.
   - En el PR B, también **Ver al lado** en el menú de cada tarjeta de Inicio que no es la abierta, junto a **Comparar con la abierta**.

   No se agrega un atajo para dividir: `Ctrl`+`\` no se escribe igual en un teclado latinoamericano, y la paleta ya está a dos teclas.
5. **[VISIBLE] Panel con foco.** Manda el último panel donde hubo un clic o al que entró el foco. Su encabezado se marca. Lo que no pertenece a un panel actúa sobre ese:
   - el menú lateral y la paleta navegan en él;
   - `Ctrl`+`T` abre ahí una pestaña nueva;
   - `Ctrl`+`W` cierra su pestaña;
   - `Ctrl`+`Tab` cambia su pestaña;
   - un clic en la barra de pestañas la muestra en él.

   `F6` pasa el foco al otro panel, como en Windows. Los atajos del lienzo (flechas, `Supr`, `F2`, `N`, `Ctrl`+`D`) ya actúan donde está el foco del teclado, así que solo tocan el lienzo de ese panel.
6. **[VISIBLE] Una pestaña no se muestra en los dos paneles.** Mostrar en un panel la pestaña que está en el otro los intercambia. Cerrar la pestaña de al lado cierra la vista dividida; cerrar la vista dividida deja esa pestaña en la barra como una más.
7. **[VISIBLE] Divisor.**
   - Se arrastra, y con el teclado se mueve con las flechas de 5 en 5 %. `Inicio` y `Fin` lo llevan al mínimo y al máximo, y un doble clic lo deja en 50 %.
   - Cada panel ocupa entre 20 % y 80 %.
   - Un botón en el encabezado de al lado cambia entre **Lado a lado** y **Una sobre otra**.
   - La proporción, la orientación y qué pestaña está al lado se guardan con las pestañas, por copia de la app, y vuelven con **Continuar donde estaba**.
8. **[VISIBLE] Otra organización al lado.**
   - El encabezado dice el nombre y el color de la organización y **Solo lectura**.
   - Las vistas de Configuración, Importar y exportar, Ayuda y Acerca de no se abren al lado: la navegación va al panel principal.
   - Lo que se ve es una foto tomada al abrir. No cambia mientras esté al lado, porque la otra organización no puede editarse en esta copia sin pasar a ser la abierta.
   - Si pasa a ser la abierta (su pestaña se activa en el panel principal), el panel de al lado se suelta y vuelve a montarse con sus datos vivos, ahora editable. Lo mismo al revés: si cambia la abierta, una pestaña de al lado que era suya pasa a solo lectura.
   - Eliminar esa organización cierra la vista dividida.
9. **Solo lectura en las vistas.** `useOrganizacion` gana `soloLectura = computed(() => !!fechaVista.value || MODO_LADO)`. Los 12 archivos que hoy usan `!!org.fechaVista` para ocultar acciones pasan a usarla. Las vistas que hoy no tienen un modo de solo lectura (Árboles, Directorio, Revisión, ficha de persona, diálogo de puesto, personas de la unidad) ocultan con ella sus acciones de editar. Si quedara un botón, su escritura igual falla con `solo_lectura` (decisión 3).
10. **[VISIBLE] Memoria.** Antes de abrir otra organización al lado se estima lo que agrega: `ESTIMADO = BASE_LADO + personas × POR_PERSONA + unidades × POR_UNIDAD`. Si `performance.memory.usedJSHeapSize + ESTIMADO > 0.8 × jsHeapSizeLimit`, se pregunta: «Puede que no haya memoria para las dos. ¿Abrir igual?». Las constantes salen de la medición de la Task 10 con la organización grande. Si el navegador no da `performance.memory`, no se pregunta.
11. **[VISIBLE] Metas de tiempo.** Con la organización grande (10.000 personas, 1.000 fotos), medidas en la portable:
    - **Dividir** con el Árbol en los dos paneles: menos de 3 s hasta ver el segundo lienzo.
    - **Ver al lado** otra organización grande: menos de 8 s, copia incluida.

    Si no se cumplen, se informa con los números en el PR y **se pregunta al autor**.
12. **El tema, el idioma y la escala del iframe.** El iframe se vuelve a montar (`:key`) cuando cambian. Es más simple que sincronizarlos y casi nunca pasa.
13. **Sin capturas nuevas hechas a mano.** La ayuda va sin imágenes nuevas, como en la entrega 2.

**Comprobado en el código:**
- vue-router 5 exporta `createMemoryHistory`, `routerKey`, `routeLocationKey`, `routerViewLocationKey` y `viewDepthKey`.
- Ningún archivo importa `@/router` aparte de `main.ts`. Las vistas usan `useRoute()` y `useRouter()` (23 archivos), así que heredan el router del panel.
- `useEstadoPestana` y `useUbicar` leen `pestanas.activa`, y deben leer la pestaña de su panel.
- `VistaArbol.vue` llama a `useVueFlow()` sin id y busca nodos con `document.querySelector('.vue-flow__node[data-id=…]')`. Con el mismo árbol en los dos paneles, encontraría el nodo del otro panel.
- La CSP no fija `frame-src` ni `frame-ancestors`, y `default-src 'self'` admite el iframe de la propia app.
- `comparar_organizaciones::{copiar_otra, leer}` ya dan la copia y su conexión de solo lectura.
- `fotos::respuesta_de` pasa por `con_conexion` y responde 404 para otra base.

## Global Constraints

- Nada de una organización llega a otra. En el PR B, Rust no tiene ningún camino que escriba con el id de la otra: `db_lote`, `fotos_guardar`, `fotos_compactar`, respaldos e intercambio responden `otra_base`. El archivo de la otra no cambia: mismo contenido y misma fecha de modificación.
- La otra se lee solo del temporal `Temporal::nuevo(&rutas.datos, "lado")`, abierto con `comparar_organizaciones::leer` (`READ_ONLY` y `query_only=ON`).
- El iframe no escribe preferencias: en modo lado, `guardarPreferencia`, `guardarPreferenciaOrg` y `borrarPreferenciasOrg` no hacen nada.
- Error nuevo: `solo_lectura`, traducido en `respaldos.error.solo_lectura` (es y en).
- Textos de interfaz en es y en: «Dividir», «Cerrar la vista dividida», «Abrir al lado», «Quitar de al lado», «Lado a lado», «Una sobre otra», «Ver al lado», «Solo lectura». En `site/novedades.json`, nada de versiones, fases ni «próximamente», y la novedad del PR A no anuncia la del PR B.
- **Pruebas nunca con datos reales del autor.** Rust: `tempfile` y `organizaciones::pruebas`; ninguna llama a `Estado::iniciar`. TS: `localStorage` simulado. El arnés aborta si `rutaBd` no está en su temporal y no deja ventanas a la vista. No se abre la app en el equipo: el arnés corre solo en CI de Windows (`instalador.yml`, trabajo `organizaciones`).
- Tras cambiar código: `graphify update .`. Antes de cada PR: `npm run typecheck`, `npm run lint`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.

## Review Focus

Cada línea tiene su prueba en la tarea indicada.

1. **El mismo subárbol en los dos paneles:** `F2`, las flechas, **Ubicar** y **Ver en el diagrama** actúan solo en el lienzo del panel con foco (Task 4).
2. **Cerrar la pestaña activa del panel principal con la vista dividida:** la que pasa a activa nunca es la de al lado, y la vista dividida sigue (Task 1).
3. **Cambiar la organización abierta con una pestaña de la anterior al lado:** esa pestaña pasa a solo lectura sin perder su ruta; si la que se abre es la de al lado, ese panel pasa a editable (Task 9).
4. **Una vista del iframe que llama a otro comando de Rust (`foto_bytes`, `info_proyecto`):** responde `solo_lectura` y la vista muestra el mensaje, sin quedar en blanco (Tasks 7 y 10).
5. **Pestañas guardadas con un `lado` que ya no existe, igual a la activa, o con `division` mal formada:** se leen sin vista dividida o con los valores por defecto, y nunca dejan la app sin arrancar (Task 1).

## Mapa de tareas y PR

| # | Tarea | Visibilidad | PR |
|---|---|---|---|
| 1 | Modelo de pestañas con `lado` y `division` | ninguna | A |
| 2 | Store de pestañas: panel con foco | ninguna | A |
| 3 | Router del panel, `VistaDividida` y divisor | **visible** | A |
| 4 | Lo que no es de un panel actúa en el que tiene foco | **visible** | A |
| 5 | Ayuda, novedad, sitio y medición del PR A | **visible**; puerta del PR A | A |
| 6 | Rust: la otra organización al lado, en solo lectura | ninguna | B |
| 7 | La app en modo lado: puente, arranque y `AppLado` | ninguna | B |
| 8 | Solo lectura en todas las vistas | ninguna | B |
| 9 | El panel de al lado con otra organización | **visible** | B |
| 10 | Ayuda, novedad, sitio y medición del PR B | **visible**; puerta del PR B | B |

PR A: «Vista dividida», rama `lado-a-lado-a`, etiqueta `version:menor`. PR B: «Otra organización al lado», rama `lado-a-lado-b` desde `main` con el PR A fusionado, etiqueta `version:menor`.

---

### Task 1: Modelo de pestañas con `lado` y `division`

**Visibilidad:** ninguna.

**Files:**
- Modify: `src/features/pestanas/pestanas.ts`
- Test: `src/features/pestanas/pestanas.test.ts`

**Interfaces:**
- Produces:
  - `Pestanas` gana `lado: string | null` y `division: Division`.
  - `export interface Division { orientacion: "horizontal" | "vertical"; proporcion: number }` y `export const DIVISION_INICIAL: Division = { orientacion: "horizontal", proporcion: 0.5 }`. `horizontal` es lado a lado.
  - `export const PROPORCION_MIN = 0.2`, `PROPORCION_MAX = 0.8`.
  - `export function alLado(m: Pestanas, id: string): Pestanas`: pone `id` al lado. Si `id` es la activa, intercambia la activa con la de al lado. Sin pestaña al lado, la activa pasa a la vecina con `cerrar`.
  - `export function sinLado(m: Pestanas): Pestanas`: `lado = null`.
  - `export function enPanel(m: Pestanas, panel: Panel, id: string): Pestanas`, con `export type Panel = "principal" | "lado"`: muestra `id` en ese panel, intercambiando si está en el otro.
  - `export function conProporcion(m: Pestanas, p: number): Pestanas`: acota entre `PROPORCION_MIN` y `PROPORCION_MAX`.
  - `unaPestana` devuelve `lado: null` y `DIVISION_INICIAL`.
  - `cerrar`: cerrar la de al lado deja `lado = null`; cerrar la activa nunca activa la de al lado, y si es la única que queda, quita la división.
  - `sinOrganizacion` quita `lado` si era de `org`.
  - `vecina(m, paso, panel)` salta la pestaña del otro panel.
  - `leerPestanas` valida `lado` (existe en la lista y no es la activa) y `division` (orientación conocida, proporción finita dentro del rango). Si no, `lado = null` o `DIVISION_INICIAL`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `alLado_intercambia_si_es_la_activa`.
  - `alLado_con_una_sola_pestana_no_cambia` (no hay otra que activar).
  - `enPanel_intercambia_entre_paneles`.
  - `cerrar_la_activa_no_activa_la_de_al_lado` (Review Focus 2): con la lista `[a, b, c]`, la activa `b` y `c` al lado, cerrar `b` activa `a`, y `lado` sigue siendo `c`.
  - `cerrar_la_de_al_lado_quita_la_division`.
  - `vecina_salta_la_del_otro_panel`.
  - `sinOrganizacion_quita_el_lado`.
  - `conProporcion_acota`: `0.05 → 0.2` y `0.95 → 0.8`.
  - `leerPestanas_lado_invalido` (Review Focus 5): un `lado` que no está en la lista, `lado === activa`, `division: { orientacion: "diagonal", proporcion: NaN }` y `division: "x"` dan `lado: null` y `DIVISION_INICIAL`. Las pestañas guardadas sin estos campos se leen igual que hoy.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas/pestanas.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** en `pestanas.ts`, manteniendo puras todas las funciones.
- [ ] **Step 4: Comprobar que pasan.** Run: `npx vitest run src/features/pestanas`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Pestañas: modelo de la vista dividida"`

### Task 2: Store de pestañas: panel con foco

**Visibilidad:** ninguna.

**Files:**
- Modify: `src/features/pestanas/usePestanas.ts`, `src/features/arbol/useUbicar.ts`
- Create: `src/features/pestanas/panel.ts`
- Test: `src/features/pestanas/usePestanas.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces, en `panel.ts`:
  - `export interface InfoPanel { panel: Panel; pestana: () => string }`
  - `export const PANEL: InjectionKey<InfoPanel>`
  - `export function usePanel(): InfoPanel`: lo inyectado o, si no hay, `{ panel: "principal", pestana: () => usePestanas().activa }`.
- Produces, en `usePestanas`:
  - Estado: `lado` (computed) y `division` (computed), `conFoco: Ref<Panel>`.
  - Acciones:
    - `dividir(): Resultado`: abre al lado una pestaña nueva con la ruta de la activa; con la vista ya dividida, la cierra.
    - `abrirAlLado(id: string): Resultado`
    - `cerrarDivision(): void`
    - `orientar(o: Division["orientacion"]): void`
    - `proporcion(p: number): void`
    - `enfocarPanel(p: Panel): void`
    - `rutaDelLado(ruta: string): void`: la escribe el router del panel de al lado.
  - Otras que cambian:
    - `activar(id)` muestra `id` en el panel `conFoco`. Si es `"principal"`, se comporta como hoy.
    - `siguiente`, `cerrar` de la activa y `abrirNueva` actúan sobre la pestaña del panel `conFoco`.
- `useEstadoPestana` y `useUbicar` usan `usePanel().pestana()` en vez de `pestanas.activa`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `dividir_abre_la_misma_ruta_al_lado_y_otra_vez_la_cierra`.
  - `con_foco_al_lado_activar_cambia_solo_ese_panel`: el router principal no navega.
  - `ctrl_w_con_foco_al_lado_cierra_esa_y_la_division`.
  - `ctrl_tab_con_foco_al_lado_salta_la_activa`.
  - `division_se_guarda_y_se_lee_con_las_pestanas` (localStorage simulado).
  - `useEstadoPestana_guarda_en_la_pestana_de_su_panel`: con `PANEL` provisto para la de al lado, el estado se guarda en esa pestaña y no en la activa.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `conFoco` no se guarda: al arrancar es `"principal"`. Con `lado === null`, `conFoco` vuelve a `"principal"`.
- [ ] **Step 4: Comprobar que pasan.** Run: `npx vitest run src/features`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Pestañas: panel con foco"`

### Task 3: Router del panel, `VistaDividida` y divisor

**Visibilidad:** **visible.**

**Files:**
- Modify: `src/router.ts` (exporta `rutas` y la usa en `createRouter`), `src/App.vue` (el `<main>` monta `VistaDividida`), `src/i18n/es.json`, `src/i18n/en.json`
- Create: `src/features/pestanas/routerLado.ts`, `src/features/pestanas/VistaDividida.vue`, `src/features/pestanas/PanelLado.vue`, `src/features/pestanas/Divisor.vue`
- Test: `src/features/pestanas/routerLado.test.ts`, `src/features/pestanas/VistaDividida.test.ts`

**Interfaces:**
- Consumes: Task 2 (`PANEL`, `usePestanas`).
- Produces:
  - `export function crearRouterLado(inicial: string): Router`: `createRouter({ history: createMemoryHistory(), routes: rutas })`, sin `scrollBehavior`. Un `afterEach` llama a `rutaDelLado(to.fullPath)`, y un `beforeEach` rechaza las rutas con `meta.sinMarco`.
  - `PanelLado.vue`, con la prop `id: string` (la pestaña). Crea su router, hace `provide(routerKey, r)`, `provide(routeLocationKey, rutaReactiva)` y `provide(PANEL, { panel: "lado", pestana: () => props.id })`, y monta `<RouterView :key="id" />`. `rutaReactiva` copia las claves de `r.currentRoute.value`, como hace vue-router al instalarse.
  - `VistaDividida.vue`: sin `lado`, el `<main>` de hoy. Con `lado`, los dos paneles en un `flex` (`flex-row` u `flex-col`), con `Divisor` entre ellos. Cada panel tiene un encabezado con el título de su pestaña y la marca de foco. El de al lado tiene además el botón de orientación y **Cerrar la vista dividida**. `@focusin` y `@pointerdown` en cada panel llaman a `enfocarPanel`.
  - `Divisor.vue`, con las props `orientacion` y `proporcion` y el evento `update:proporcion`. Es `role="separator"` con `aria-orientation`, `aria-valuenow`, `aria-valuemin="20"`, `aria-valuemax="80"` y `tabindex="0"`. Responde a las flechas (±0.05), `Inicio`, `Fin` y el doble clic (0.5), según la decisión 7.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `navegar_en_el_lado_no_cambia_el_router_principal`: tras `r.push("/directorio")`, `router.currentRoute` sigue en `/` y la pestaña de al lado tiene `/directorio`.
  - `el_lado_no_abre_la_bienvenida`.
  - `divisor_flechas_inicio_fin_y_doble_clic`: los valores esperados, acotados.
  - `sin_lado_se_ve_como_hoy`: un solo panel, sin encabezado ni divisor.
  - `con_lado_dos_paneles_y_foco`: un `focusin` en el de al lado lo marca y llama a `enfocarPanel("lado")`.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `organizaciones.cambiando` desmonta los dos paneles, como hoy desmonta la vista. En este PR, una pestaña de otra organización no se pone al lado: su menú no ofrece **Abrir al lado**, y `abrirAlLado` responde `{ ok: false, mensaje: t("pestanas.noAbre") }`. El PR B quita esa regla.
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Vista dividida: router del panel, divisor y paneles"`

### Task 4: Lo que no es de un panel actúa en el que tiene foco

**Visibilidad:** **visible.**

**Files:**
- Modify:
  - `src/App.vue` (`alPulsar` navega en el router del panel con foco)
  - `src/components/BarraSuperior.vue` (botón **Dividir**)
  - `src/components/PaletaComandos.vue` (entradas **Dividir la vista** / **Cerrar la vista dividida**; sus destinos van al panel con foco)
  - `src/features/pestanas/BarraPestanas.vue` (menú contextual, marca de la pestaña de al lado)
  - `src/features/atajos/atajos.ts` y `src/features/atajos/useAtajos.ts` (`F6` = `otroPanel`)
  - `src/features/arbol/VistaArbol.vue` (id de Vue Flow por pestaña y búsquedas de nodos dentro de su panel), más los componentes del árbol que llaman a `useVueFlow()`
  - `src/i18n/es.json`, `src/i18n/en.json`
- Create: `src/features/pestanas/routerConFoco.ts`
- Test: `src/features/atajos/atajos.test.ts`, `src/features/pestanas/usePestanas.test.ts`, `src/features/arbol/VistaArbol.panel.test.ts`

**Interfaces:**
- Consumes: Tasks 2 y 3.
- Produces:
  - `export function routerConFoco(): Router`: el principal o el del panel de al lado, que `PanelLado` registra al montarse y quita al desmontarse.
  - `Atajo` gana `"otroPanel"`, que `F6` da cuando hay vista dividida.
  - En `VistaArbol`: `useVueFlow(\`arbol-${usePanel().pestana()}\`)`, y una función local `nodoEn(id)` que busca con `raiz.value.querySelector` sobre el elemento raíz de la vista, en vez de `document`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `f6_da_otroPanel_solo_con_vista_dividida`.
  - `paleta_y_menu_lateral_navegan_en_el_panel_con_foco`.
  - `menu_de_pestana_abrir_y_quitar_de_al_lado`.
  - `mismo_arbol_en_dos_paneles_f2_y_ubicar_solo_en_el_suyo` (Review Focus 1): monta dos `VistaArbol` con la misma unidad, cada una con su `PANEL`. `F2` en la segunda edita su tarjeta, la de la primera no cambia, y **Ubicar** encuadra solo la segunda.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/atajos src/features/pestanas src/features/arbol`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Buscar en todo `src/features` los `document.querySelector` y `getElementById` que apuntan a algo de una vista. Los que pueden repetirse en dos paneles pasan a buscar dentro del panel. Los ids de elementos (`id=`) dentro de las vistas se arman con la pestaña cuando lo usan `aria-labelledby` o `for`. La lista de lo cambiado va en el PR.
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck`, `npm run lint` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Vista dividida: menú, paleta, atajos y lienzo por panel"`

### Task 5: Ayuda, novedad, sitio y medición del PR A

**Visibilidad:** **visible.** Puerta del PR A: no se fusiona sin la medición.

**Files:**
- Modify: `ayuda/es/pestanas.md`, `ayuda/en/pestanas.md` (sección `## Vista dividida` / `## Split view`, después de «Cambiar, ordenar y cerrar»), `ayuda/es/atajos.md`, `ayuda/en/atajos.md` (`F6`), `site/novedades.json`, `site/funciones.md` y `site/en/funciones.md` (una línea donde se describen las pestañas), `scripts/arnes-organizaciones.mjs`, `src/features/pestanas/PanelLado.vue` (`performance.measure("abrir-al-lado")`, desde `dividir` hasta el primer `nodesInitialized` del lienzo o el montaje de otra vista)
- Test: `src/i18n/ayuda.test.ts`, `site/scripts/novedades.test.mjs`, `scripts/arnes-organizaciones.test.ts`

- [ ] **Step 1: Escribir la ayuda**, igual en los dos idiomas: cómo dividir y cerrar, el divisor con mouse y teclado, la orientación, el panel con foco y `F6`, que una pestaña no está en los dos paneles y que se recuerda con las pestañas. Nada sobre otra organización.
- [ ] **Step 2: Agregar la novedad** al inicio de `site/novedades.json`, con el id `vista-dividida`, la página `pestanas` y las anclas `vista-dividida` y `split-view`. Título es: «Dos pestañas a la vez». Título en: «Two tabs at once». El texto, en dos o tres frases como las demás, dice qué se ve y cómo se abre.
- [ ] **Step 3: Medir en el arnés.** `medirDivision` va después de `medirComparacion`, con la grande ya sembrada. Divide 3 veces con el Árbol en los dos paneles y lee `performance.getEntriesByName("abrir-al-lado")`, más `performance.memory.usedJSHeapSize` antes y después. Sigue las reglas del arnés. Expected: mediana menor a 3000 ms (decisión 11). Imprime `dividir: <n> ms, memoria: +<m> MB`.
- [ ] **Step 4: Comprobar.** Run: `npx vitest run src/i18n/ayuda.test.ts scripts/arnes-organizaciones.test.ts` y `node --test site/scripts/novedades.test.mjs site/scripts/masReciente.test.mjs`. Expected: PASS. En CI de Windows, el trabajo `organizaciones` imprime la línea de `dividir`, que se pega en el PR.
- [ ] **Step 5: Commit, `graphify update .`, comprobaciones de Global Constraints y PR A** con `version:menor`. Se fusiona en verde y revisado.

---

### Task 6: Rust: la otra organización al lado, en solo lectura

**Visibilidad:** ninguna.

**Files:**
- Create: `src-tauri/src/lado.rs` (más su `mod` y `.manage(Lado::default())` en `src-tauri/src/lib.rs`, y el registro de los comandos)
- Modify: `src-tauri/src/comandos.rs` (`db_consultar`, `abrir_en`, `eliminar_en`), `src-tauri/src/fotos.rs` (`respuesta_de`), `src/db/cliente.ts`, `src/db/errores.ts`
- Test: `src-tauri/src/lado.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/fotos.rs`, `src/db/cliente.test.ts`

**Interfaces:**
- Consumes: `comparar_organizaciones::{copiar_otra, leer, Copia}`.
- Produces:
  - `#[derive(Default)] pub struct Lado`: un `Mutex<Option<Abierto>>`, con `Abierto { copia: Copia, conn: Connection }`.
  - `impl Lado`:
    - `pub fn con_lectura<T>(&self, id: &str, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String>`: si `id` no es el de la copia, `otra_base`.
    - `pub fn soltar_si(&self, id: &str)`: suelta la copia si `id` es el de ella.
    - `pub fn cerrar(&self)`.
  - `pub struct InfoLado { pub id: String, pub personas: u64, pub unidades: u64 }` (camelCase), con las personas y unidades vivas de la copia.
  - Comandos:
    - `lado_abrir(base_id: String, otra_id: String) -> InfoLado`, en un hilo aparte: valida `base_id` con `con_conexion`, llama a `copiar_otra(r, entrada, abierta, MIGRACIONES)` y reemplaza la anterior.
    - `lado_cerrar()`.
  - `db_consultar`: si `base_id` no es la abierta y es la del lado, consulta con `Lado::con_lectura`.
  - `fotos::respuesta_de`: lo mismo para la foto.
  - `abrir_en` y `eliminar_en` llaman a `lado.soltar_si(id)`.
  - En `cliente.ts`: `ladoAbrir(otraId: string): Promise<InfoLado>`, que pasa por el envoltorio que agrega `baseId`, y `ladoCerrar(): Promise<void>`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `lado_consulta_la_otra_y_no_la_abierta`: el mismo `SELECT` da los datos de cada una según el `base_id`.
  - `lado_no_escribe`: con el id del lado, `db_lote`, `fotos_guardar` y `fotos_compactar` dan `otra_base`. Un `INSERT` por `db_consultar` falla por `query_only`. El archivo original tiene el mismo contenido y la misma fecha de modificación.
  - `abrir_la_del_lado_la_suelta`: tras `abrir_en(otra)`, `con_lectura(otra)` da `otra_base` y el temporal ya no existe.
  - `eliminar_la_del_lado_la_suelta`.
  - `cambiar_a_una_tercera_no_suelta_el_lado`: tras `abrir_en(tercera)`, el lado sigue respondiendo.
  - `foto_del_lado_se_sirve_y_la_de_otra_base_da_404`.
  - `lado_abrir_consigo_misma_da_misma`.
  - En `cliente.test.ts`: `ladoAbrir` envía `baseId`.
- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml lado` y `npx vitest run src/db/cliente.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.** La abierta se mira primero: un id que es la abierta nunca va al lado.
- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` y `npx vitest run src/db`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Lado a lado: la otra organización en un temporal de solo lectura"`

### Task 7: La app en modo lado: puente, arranque y `AppLado`

**Visibilidad:** ninguna.

**Files:**
- Create:
  - `src/lado/modo.ts`: `export const MODO_LADO: boolean` y `export function idLado(): string`, leídos de `?lado=` de `location.search`.
  - `src/lado/puente.ts`
  - `src/lado/AppLado.vue`
  - `src/lado/arranque.ts`
- Modify: `src/main.ts` (con `MODO_LADO`, `arranque.ts` y nada más), `src/lib/preferencias.ts` (escrituras sin efecto con `MODO_LADO`), `src/db/errores.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/lado/puente.test.ts`, `src/lado/arranque.test.ts`, `src/lib/preferencias.test.ts`

**Interfaces:**
- Produces:
  - `export const PERMITIDOS = ["db_consultar"] as const`.
  - `export function instalarPuente(id: string, padre: Window): void`: define `window.__TAURI_INTERNALS__` según la decisión 3. Copia del padre `convertFileSrc`, `transformCallback` y `metadata`.
  - `export const VISTAS_LADO = ["arbol", "arboles", "directorio", "revision"]`.
  - `arranque.ts`, en este orden: `instalarPuente(idLado(), window.parent)`, `useTema().aplicar()`, `fijarBase(idLado())`, crear Pinia, `useOrganizacion().cargar()`, un router con hash propio cuyo `beforeEach` rechaza lo que no está en `VISTAS_LADO`, y montar `AppLado`. No llama a `migrarPreferencias`, al respaldo automático, a las actualizaciones, a la bandeja ni a `conectarCierre`.
  - Al navegar, `AppLado` avisa al padre con `window.parent.postMessage({ tipo: "boldo-lado-ruta", ruta }, location.origin)`.
  - `AppLado` monta el `RouterView`, `FichaTrabajador`, `DialogoPuesto` y el `Toaster`. No tiene barra lateral, barra superior ni pestañas.
  - Si la carga falla, `AppLado` muestra el motivo en el mismo panel.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `puente_solo_deja_db_consultar_con_el_id_del_lado`: `db_lote`, `foto_bytes`, `info_app` y `plugin:event|listen` rechazan con `solo_lectura`. `db_consultar` llega al padre con `baseId` del lado aunque se pida con otro.
  - `puente_devuelve_objetos_del_iframe`: el resultado pasa por `structuredClone`.
  - `preferencias_no_se_escriben_en_modo_lado`: `localStorage` sigue igual.
  - `router_del_lado_rechaza_configuracion_e_intercambio`.
  - `solo_lectura_se_traduce` (Review Focus 4): `traducirError("solo_lectura")` da el texto de `respaldos.error.solo_lectura`.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/lado src/lib`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Lado a lado: la app en modo lado"`

### Task 8: Solo lectura en todas las vistas

**Visibilidad:** ninguna. Sin `MODO_LADO` nada cambia, porque hoy `fechaVista` ya oculta lo mismo.

**Files:**
- Modify:
  - `src/stores/organizacion.ts` (`soloLectura`)
  - los 12 archivos que usan `!!org.fechaVista` para eso (`AccionesTarjeta.vue`, `MenuLienzo.vue`, `NodoUnidad.vue`, `useAtajos.ts`, …)
  - las vistas y los diálogos sin modo de solo lectura: `src/features/arboles/VistaArboles.vue`, `src/features/directorio/VistaDirectorio.vue`, `src/features/revision/VistaRevision.vue`, `src/features/trabajadores/FichaTrabajador.vue`, `src/features/puestos/DialogoPuesto.vue`, `src/features/unidades/PersonasUnidad.vue` y el panel de la unidad
- Test: un `*.soloLectura.test.ts` junto a cada vista o diálogo modificado

**Interfaces:**
- Produces: `soloLectura: ComputedRef<boolean>` en `useOrganizacion`.
- El texto «Solo lectura» del aviso de fecha (`arbol.fecha.soloLectura`) sigue igual. En modo lado, el aviso lo pone `LadoOtra` (Task 9).

- [ ] **Step 1: Escribir las pruebas que fallan.** Para cada vista y diálogo, montado con `soloLectura` en `true`: no hay botones ni entradas de menú de crear, editar, mover, eliminar o resolver. Los campos de la ficha y del puesto se muestran como texto o deshabilitados. Lo de leer (abrir una persona, filtrar, ordenar, ubicar) sigue.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Para encontrar lo que falta, buscar en las vistas cada llamada a una acción del store que escribe (las que llaman a `lote`). La lista de los lugares cambiados va en el PR.
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck`, `npm run lint` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Lado a lado: solo lectura en todas las vistas"`

### Task 9: El panel de al lado con otra organización

**Visibilidad:** **visible.**

**Files:**
- Create: `src/features/pestanas/LadoOtra.vue`, `src/features/pestanas/memoriaLado.ts`
- Modify:
  - `src/features/pestanas/PanelLado.vue` (elige `LadoOtra` si la pestaña es de otra organización)
  - `src/features/pestanas/usePestanas.ts` (quita la regla de la Task 3 y agrega `verAlLado(org: string)`)
  - `src/features/pestanas/BarraPestanas.vue`
  - `src/features/inicio/RecientesInicio.vue` (**Ver al lado**)
  - `src/components/PaletaComandos.vue`, `src/features/proyecto/menuApp.ts` (`entradasVerAlLado`)
  - `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/features/pestanas/memoriaLado.test.ts`, `src/features/pestanas/LadoOtra.test.ts`, `src/features/pestanas/usePestanas.test.ts`, `src/features/proyecto/menuApp.test.ts`

**Interfaces:**
- Consumes: `ladoAbrir`, `ladoCerrar` (Task 6); `VISTAS_LADO` y el mensaje `boldo-lado-ruta` (Task 7).
- Produces:
  - `export function caben(info: InfoLado, memoria?: { usedJSHeapSize: number; jsHeapSizeLimit: number }): boolean`, con `BASE_LADO`, `POR_PERSONA` y `POR_UNIDAD` exportadas. Sus valores iniciales salen de la memoria medida en el PR A; la Task 10 los ajusta.
  - `entradasVerAlLado(lista: Organizacion[], activa: string): { id: string; nombre: string }[]`.
  - `verAlLado(org)`: abre al lado una pestaña nueva de `org` en `/`, sin cambiar la organización abierta.
  - `LadoOtra.vue`, con la prop `id` (la pestaña):
    - Al montarse: `ladoAbrir(org)`, la estimación de `caben` (si no caben, pregunta como dice la decisión 10, y «No» cierra la vista dividida) y luego `<iframe :src="\`${location.pathname}?lado=${org}#${ruta}\`" :key="tema + idioma + escala" class="size-full">` con `title` igual al nombre de la organización.
    - Escucha `message` solo de `iframe.contentWindow` y con `origin === location.origin`, y con `boldo-lado-ruta` llama a `rutaDelLado`.
    - Al desmontarse llama a `ladoCerrar()`.
    - El encabezado muestra **Solo lectura** con el nombre y el color de la organización.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `caben_con_y_sin_performance_memory`.
  - `ver_al_lado_no_cambia_la_abierta`: `abrirOrganizacion` no se llama y `baseActual()` sigue igual.
  - `mensaje_de_otro_origen_o_de_otra_ventana_se_ignora`.
  - `navegar_a_configuracion_con_foco_en_la_otra_va_al_principal`.
  - `abrir_la_del_lado_en_el_principal_la_vuelve_editable` (Review Focus 3).
  - `cambiar_la_abierta_deja_al_lado_en_solo_lectura_con_su_ruta` (Review Focus 3).
  - `eliminar_la_del_lado_cierra_la_division`.
  - `entradasVerAlLado` deja fuera la abierta y conserva el orden de la lista.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas src/features/proyecto`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck`, `npm run lint` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Lado a lado: otra organización en el panel de al lado"`

### Task 10: Ayuda, novedad, sitio y medición del PR B

**Visibilidad:** **visible.** Puerta del PR B: no se fusiona sin la medición ni sin el recorrido del iframe en CI.

**Files:**
- Modify: `ayuda/es/organizaciones.md`, `ayuda/en/organizaciones.md` (sección `## Ver al lado` / `## View side by side`, después de «Comparar»), `ayuda/es/pestanas.md`, `ayuda/en/pestanas.md` (una línea que enlaza a esa sección), `site/novedades.json`, `site/funciones.md`, `site/en/funciones.md`, `scripts/arnes-organizaciones.mjs`, `src/features/pestanas/memoriaLado.ts` (constantes medidas), `src/features/pestanas/LadoOtra.vue` (`performance.measure("ver-al-lado")`)
- Test: `src/i18n/ayuda.test.ts`, `site/scripts/novedades.test.mjs`, `scripts/arnes-organizaciones.test.ts`

- [ ] **Step 1: Escribir la ayuda**, igual en los dos idiomas: cómo se abre (Inicio, paleta, menú de la pestaña), que es de solo lectura y por qué, qué vistas se ven, que es una foto tomada al abrir, qué pasa al abrir esa organización y el aviso de memoria.
- [ ] **Step 2: Agregar la novedad** al inicio de `site/novedades.json`, con el id `ver-al-lado`, la página `organizaciones` y las anclas `ver-al-lado` y `view-side-by-side`. Título es: «Otra organización al lado». Título en: «Another organization side by side». El texto, en dos o tres frases, dice que se ve sin modificarla.
- [ ] **Step 3: Medir y recorrer en el arnés.** `medirLado` va después de `medirDivision`. Usa la `relacionada` y la `aparte` de `medirComparacion`.
  - Por la paleta, abre **Ver al lado** 3 veces con cada una y lee `ver-al-lado`, más la memoria antes y después.
  - En el iframe recorre Árbol, Árboles, Directorio y Revisión. Comprueba que se ve la otra (su nombre en el árbol), que no hay errores en la consola y que no quedan botones de editar.
  - Desde el iframe, `window.__TAURI_INTERNALS__.invoke("db_lote", …)` da `solo_lectura`. Desde el padre, `db_lote` con el id del lado da `otra_base`.
  - El archivo de la otra no cambió (Review Focus 4 y Global Constraints).
  - Con lo medido fija `BASE_LADO`, `POR_PERSONA` y `POR_UNIDAD`, con un margen del 50 % por encima. Expected: mediana menor a 8000 ms (decisión 11). Imprime `ver al lado: <n> ms, memoria: +<m> MB`.
- [ ] **Step 4: Comprobar.** Run: `npx vitest run src/i18n/ayuda.test.ts scripts/arnes-organizaciones.test.ts` y `node --test site/scripts/novedades.test.mjs site/scripts/masReciente.test.mjs`. Expected: PASS. En CI de Windows, las líneas de `ver al lado` y del recorrido, que se pegan en el PR.
- [ ] **Step 5: Commit, `graphify update .`, comprobaciones de Global Constraints y PR B** con `version:menor`. Se fusiona en verde y revisado. Se comprueba que la versión se publica.
