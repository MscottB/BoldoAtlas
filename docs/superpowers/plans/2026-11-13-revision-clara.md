# Task 29c, Revisión de datos más clara: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisión abre con un resumen en tres niveles que dice qué importa y por qué. Cada aviso dice qué significa y cómo se arregla, con la acción a un clic. Se filtra por rama, y un aviso se puede marcar «Así está bien», con su motivo, para que no vuelva. Todo sigue claro con mil avisos.

**Architecture:** El cálculo sigue en funciones puras sobre el estado del store (`revision.ts`). Ahí se agregan el nivel, la clave de cada aviso, las unidades donde vive y el filtro por rama. Las marcas «Así está bien» son un JSON en la tabla `meta` (clave `revision_bien`), sin migración. Se leen con `cargar()` y se escriben con `escribir()`. Un módulo puro (`marcas.ts`) las lee con tolerancia, las agrega, las quita y poda las que ya no sirven. La vista se arma con un resumen, secciones plegables y filas virtuales con botones de acción.

**Tech Stack:** Vue 3, Pinia, vue-i18n, `@vueuse/core` (`useVirtualList`), vue-sonner, Vitest en `node` (SSR con `renderToString`, sin jsdom), arnés `scripts/arnes-organizaciones.mjs` en el CI de Windows.

**Spec:** Task 29c de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md` (Anexo 8) y §8 «Revisión de datos» de `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md`. La parte del historial (desde cuándo, qué cambio lo causó, volver atrás) espera a la Task 19c y no entra aquí.

## Decisiones tomadas al planificar

**[VISIBLE]** cambia algo que el autor verá. Las decisiones 1 a 3 y la 11 las tomó el autor el 2026-11-13.

1. **[VISIBLE] Tres niveles.**
   - **Importante:** sin jefatura, correos repetidos y vacantes de más de 90 días.
   - **Para revisar:** personas sin puesto, nombres parecidos, vacantes recientes (90 días o menos, o sin fecha) y unidades vacías.
   - **Orden y limpieza:** valores sin uso.

   Los reemplazos vigentes siguen aparte: solo informan y no cuentan.
2. **«Así está bien» vive en la base, sin tabla nueva.** Va en `meta.revision_bien`. Viaja en respaldos y copias completas. No viaja con una rama exportada ni se combina al importar: en la otra base se marca de nuevo.
3. **[VISIBLE] Acciones.** Casi todas abren el lugar justo. Solo dos arreglan ahí mismo, con Deshacer en el aviso: **Desactivar** un valor sin uso y **Eliminar** una unidad vacía.
4. **[VISIBLE] La persona sin puesto se abre con «Abrir ficha», no con «Dar puesto».** La ficha muestra los puestos en solo lectura: a una persona se le da un puesto desde el puesto. La frase del aviso lo dice.
5. **La clave de un aviso no cambia con el nivel.** Una vacante usa `vacantes:<puestoId>`, sea larga o reciente. Si se marcó a los 30 días, sigue marcada al pasar los 90. Un grupo de correos o de nombres usa sus ids ordenados. Si entra o sale una persona, es otro aviso y vuelve a salir.
6. **Se podan las marcas de avisos que ya no existen** cada vez que se marca o se desmarca. Si algo se arregla y después vuelve a fallar, vuelve a avisar.
7. **[VISIBLE] Filtro por rama.**
   - Usa `SelectorUnidad`, como el Directorio. Se ve la unidad y todo lo que cuelga de ella.
   - Un grupo de correos o de nombres entra si alguna de sus personas tiene hoy un puesto en la rama.
   - Las personas sin puesto, los valores sin uso y los grupos sin puesto en ninguna unidad se ocultan, y una línea dice cuántos quedaron fuera.
   - El filtro vive en la vista, sin guardarse. Si la unidad elegida desaparece, vuelve a «Toda la organización».
8. **[VISIBLE] Plegado.** Las secciones de Importante empiezan abiertas, y las demás, los reemplazos y «Marcados como bien» empiezan plegadas. Cada una recuerda cómo la dejaste. Para eso, `usePlegable` gana un valor por defecto.
9. **[VISIBLE] Solo lectura** (a una fecha o con la otra organización al lado). Se ven el resumen, el filtro y las acciones que abren. Se esconden «Así está bien», «Volver a avisar», «Desactivar» y «Eliminar». Además, `guardarMarcasRevision` rechaza la escritura en solo lectura, porque `escribir()` no lo revisa por sí mismo.
10. **[VISIBLE] Capturas nuevas desde el CI.** El arnés saca la captura de Revisión en español e inglés, en WebP de 888 × 440, con `Page.captureScreenshot`. Reemplazan `ayuda/img/{es,en}/revision-lista.webp`, que también usa la página de funciones del sitio. La de hoy muestra listas que ya no son así.
11. **[VISIBLE] Web y README al día, sin versiones junto a las funciones.**
    - Revisado el 2026-11-13: el sitio no dice en qué versión llegó cada función. «Novedades» y «Funciones» muestran el título y el texto; Descargas muestra el número de la última versión, que hace falta para descargar.
    - El README sí quedó atrás: dice «alpha» (una insignia y una frase), y su lista de funciones no tiene Comparar organizaciones, la vista dividida ni la otra organización al lado.
    - Este PR pone al día la portada del sitio, la página de funciones, «Novedades» y los dos README (`README.md`, `README.es.md`). La lista del README no nombra versiones, y el estado dice «versión de prueba», como `site/acerca.md`.
    - Las notas de cada versión en GitHub y en la ventana de actualización de la app sí llevan su número: son las notas de esa versión.

**Comprobado en el código:**
- `useOrganizacion().cargar()` ya llama a `leerMeta()` y `soltar()` limpia `org`.
- `guardarMeta(clave, valor)` está en `src/db/repos/meta.ts`.
- El store ya tiene `desactivarValor`, `reactivarValor`, `desactivarLeyenda`, `reactivarLeyenda`, `eliminarUnidad` (con `ultimoBorrado`) y `deshacer()`.
- `BarraSeleccion.vue:92` muestra el patrón del aviso con Deshacer.
- `descendientes(unidades, id)` está en `features/arbol/jerarquia.ts`.
- `App.vue:66` lee `useAvisos().value.total` para el contador del menú.
- El arnés busca hoy los `<details>` de Revisión por su título (`arnes-organizaciones.mjs:1894`). Pasa a usar `data-tipo` y `data-accion`.

## Global Constraints

- Todo texto para el autor y de la app en español simple y directo; el inglés dice lo mismo.
- Vitest corre en `node`, sin DOM: los componentes se prueban con `renderToString` y la lógica va en funciones puras. No agregar jsdom ni happy-dom.
- La app no se lanza en local. La prueba en la app real corre solo en el CI de Windows (`instalador.yml`, trabajo `organizaciones`).
- Ningún arnés toca datos reales: antes de escribir comprueba `rutaBd`.
- Sin dependencias nuevas.
- El sitio y los README no dicen en qué versión llegó una función, ni «próximamente», ni lo que falta.
- `graphify update .` después de cambiar código. En Bash, `git -C`, nunca `cd`.
- Un solo PR de código, con la etiqueta `version:menor`.

## Review Focus

1. **`meta.revision_bien` dañado o raro** (JSON roto, un número, una clave `__proto__`, un motivo de 5.000 caracteres): se ignora lo que no sirve y la pantalla abre igual. Prueba en la Task 1.
2. **Una persona entra o sale de un grupo de correos marcado:** el aviso vuelve. Prueba en la Task 1.
3. **Una vacante marcada pasa los 90 días:** sigue marcada y no salta a Importante. Prueba en la Task 1.
4. **La unidad del filtro se elimina, o se pasa a otra organización:** el filtro vuelve a «Toda la organización» sin error. Prueba de `ramaDe` en la Task 1.
5. **Solo lectura:** no queda ningún botón que escriba, ni a una fecha ni al lado. Prueba SSR en la Task 3 y comprobación en el arnés (Task 4).

---

### Task 1: Avisos con nivel, clave, rama y marcas (funciones puras)

**Files:**
- Modify: `src/features/revision/revision.ts`
- Create: `src/features/revision/marcas.ts`
- Test: `src/features/revision/revision.test.ts`, `src/features/revision/marcas.test.ts`

**Interfaces:**
- Produces, en `revision.ts`:
  - `type TipoAviso = "sinJefatura" | "correos" | "vacantesLargas" | "sinPuesto" | "nombres" | "vacantesRecientes" | "vacias" | "sinUso"`
  - `type Nivel = "importante" | "revisar" | "limpieza"`
  - `const NIVELES: readonly { nivel: Nivel; tipos: readonly TipoAviso[] }[]`, en el orden de la decisión 1.
  - `const DIAS_VACANTE_LARGA = 90`: larga si `dias > 90`; `null` o ≤ 90, reciente.
  - `type Aviso`: unión discriminada por `tipo`, con `clave: string`, `unidades: string[]` (vacío = sin rama) y `fila` (`FilaUnidad`, `FilaVacante`, `{ personaId; nombre }`, `GrupoPersonas` o `FilaValor`, según el tipo).
  - `GrupoPersonas` gana `unidades: string[]`: unidades de los puestos vivos donde sus personas tienen hoy una asignación vigente, sin repetir.
  - `FilaReemplazo` gana `unidadId: string`.
  - `function listarAvisos(a: Avisos): Aviso[]`, en el orden de `NIVELES`.
  - `function ramaDe(unidades: Unidad[], id: string | null): Set<string> | null`: la unidad viva y sus descendientes; `null` si `id` es `null` o la unidad no existe o está borrada.
  - `interface Revision { secciones: { nivel: Nivel; tipo: TipoAviso; avisos: Aviso[] }[]; marcados: { aviso: Aviso; marca: Marca }[]; reemplazos: FilaReemplazo[]; fueraDeRama: number; total: number }`
  - `function revisar(a: Avisos, marcas: Marcas, rama: Set<string> | null): Revision`:
    - `secciones` tiene un elemento por cada tipo de `NIVELES`, también los vacíos, solo con lo pendiente.
    - `fueraDeRama` cuenta los pendientes que el filtro dejó fuera.
    - `total` cuenta todos los pendientes sin el filtro de rama, para el menú.
  - Se elimina `contarAvisos`. El contador pasa a `revisar(...).total`.
- Produces, en `marcas.ts`:
  - `interface Marca { motivo: string; fecha: string }` (fecha `AAAA-MM-DD`)
  - `type Marcas = Record<string, Marca>`
  - `const MOTIVO_MAX = 200`
  - `function leerMarcas(texto: string | undefined): Marcas`
  - `function marcar(m: Marcas, clave: string, motivo: string, hoy: string, vigentes: Set<string>): Marcas | null`: `null` si el motivo queda vacío o pasa de `MOTIVO_MAX` tras `trim()`.
  - `function desmarcar(m: Marcas, clave: string, vigentes: Set<string>): Marcas`
  - `function podar(m: Marcas, vigentes: Set<string>): Marcas`
  - `vigentes` es el conjunto de las claves de `listarAvisos(a)`, marcadas o no.

**Claves de aviso (exactas):**
- `sinJefatura:<unidadId>`
- `vacias:<unidadId>`
- `vacantes:<puestoId>`, para las largas y para las recientes
- `sinPuesto:<personaId>`
- `correos:<ids ordenados, unidos por ",">`
- `nombres:<ids ordenados, unidos por ",">`
- `sinUso:<tabla>:<id>`

`leerMarcas` solo acepta:
- claves que calzan con `^(sinJefatura|vacias|vacantes|sinPuesto|correos|nombres|sinUso):[\w:,-]+$`;
- un motivo de texto, no vacío y de `MOTIVO_MAX` o menos tras `trim()`;
- una fecha con `^\d{4}-\d{2}-\d{2}$`.

Lo demás se descarta, y un JSON roto o que no es un objeto da `{}`.

- [ ] **Step 1: Pruebas que fallan en `revision.test.ts`**, con los ayudantes de hoy (`con`, `trab`, `HOY`):
  - `listarAvisos` reparte las vacantes en dos tipos: 91 días es `vacantesLargas`; 90 días y `dias === null` son `vacantesRecientes`. Ambas tienen la clave `vacantes:<puestoId>`.
  - la clave de un grupo de correos es la misma con las personas en otro orden, y cambia si entra una persona más;
  - `GrupoPersonas.unidades` trae la unidad del puesto vigente de cada persona, y queda vacío si nadie tiene puesto;
  - `revisar` con una marca de `sinJefatura:<id>` la saca de su sección y la pone en `marcados`, y `total` baja en 1;
  - `revisar` con `rama = ramaDe(unidades, idGerencia)` deja los avisos de la gerencia y de sus áreas. Las personas sin puesto y los valores sin uso no se muestran, y `fueraDeRama` los cuenta. `total` no cambia con la rama;
  - `revisar` mantiene las ocho secciones aunque estén vacías, en el orden de `NIVELES`;
  - `ramaDe(unidades, "no-existe")` y `ramaDe(unidades, idBorrada)` dan `null`;
  - en la prueba de la organización grande que ya existe: `listarAvisos` da 1.000 avisos o más, y `revisar` con 1.000 marcas tarda menos de 200 ms (`performance.now()`).
- [ ] **Step 2: Pruebas que fallan en `marcas.test.ts`:**
  - `leerMarcas(undefined)`, `leerMarcas("")`, `leerMarcas("{roto")`, `leerMarcas("3")` y `leerMarcas("[]")` dan `{}`;
  - `leerMarcas('{"__proto__":{"motivo":"x","fecha":"2026-01-01"}}')` da `{}`, y `Object.getPrototypeOf` del resultado sigue siendo `Object.prototype`;
  - descarta un motivo de 201 caracteres, un motivo vacío, una fecha `"ayer"` y una clave `otro:1`;
  - `marcar(m, "vacias:u1", "  nueva  ", "2026-11-13", vigentes)` guarda `{ motivo: "nueva", fecha: "2026-11-13" }`;
  - `marcar` con un motivo de solo espacios o de 201 caracteres da `null`;
  - `marcar` y `desmarcar` podan las claves que no están en `vigentes`;
  - `desmarcar` de una clave que no existe devuelve lo mismo, podado.
- [ ] **Step 3: Correr y ver que fallan.** `npx vitest run src/features/revision` → FAIL (no existen `listarAvisos`, `revisar`, `ramaDe` ni `marcas.ts`).
- [ ] **Step 4: Implementar** las firmas de arriba.
  - `leerMarcas` arma el resultado con `Object.fromEntries` a partir de las entradas válidas, nunca con asignación directa.
  - `ramaDe` usa `descendientes` de `jerarquia.ts`.
- [ ] **Step 5: Ajustar los usos de `contarAvisos`** (`useAvisos.ts` y sus pruebas) a `revisar(a, {}, null).total` por ahora. La Task 2 agrega las marcas.
- [ ] **Step 6: Correr y ver que pasan.** `npx vitest run src/features/revision` → PASS. `npm run typecheck` y `npm run lint` → exit 0.
- [ ] **Step 7: Commit.** `git -C <worktree> commit -m "Revisión: avisos con nivel, clave, rama y marcas"`.

### Task 2: Las marcas en la base y el contador del menú

**Files:**
- Modify: `src/stores/organizacion.ts`, `src/db/repos/meta.ts` (comentario de claves), `src/features/revision/useAvisos.ts`
- Test: `src/stores/organizacion.test.ts`, `src/features/revision/revision.test.ts` (o un `useAvisos.test.ts` nuevo)

**Interfaces:**
- Consumes: `leerMarcas`, `Marcas` (Task 1); `revisar` (Task 1).
- Produces:
  - `useOrganizacion().marcasRevision: Ref<string>`: el texto crudo de `meta.revision_bien`, o `""`. Se llena en `cargar()` y vuelve a `""` en `soltar()`.
  - `useOrganizacion().guardarMarcasRevision(m: Marcas): Promise<Resultado>`: en solo lectura, `rechazarSoloLectura()`; si no, `escribir(() => guardarMeta("revision_bien", JSON.stringify(m)))`.
  - `useAvisos(): ComputedRef<{ avisos: Avisos; marcas: Marcas; vigentes: Set<string>; total: number }>`, donde `total = revisar(avisos, marcas, null).total`.

- [ ] **Step 1: Pruebas que fallan**, con la base de prueba de `organizacion.test.ts`, como las de `guardarOrg`:
  - `guardarMarcasRevision({ "vacias:u1": { motivo: "nueva", fecha: "2026-11-13" } })` da `ok`, y después de recargar, `marcasRevision` trae ese JSON;
  - con `fechaVista` puesta, `guardarMarcasRevision` da `ok: false` con el mensaje de solo lectura y no escribe;
  - `useAvisos().value.total` baja en 1 cuando se marca un aviso que existe.
- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run src/stores/organizacion.test.ts src/features/revision` → FAIL.
- [ ] **Step 3: Implementar** las interfaces de arriba.
- [ ] **Step 4: Correr y ver que pasan.** Igual que el Step 2 → PASS; `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit.** `"Revisión: «Así está bien» se guarda en la base y el menú no lo cuenta"`.

### Task 3: La pantalla nueva

**Files:**
- Modify: `src/features/revision/VistaRevision.vue`, `src/features/revision/FilasRevision.vue`, `src/lib/plegable.ts`, `src/components/BloquePlegable.vue`, `src/i18n/es.json`, `src/i18n/en.json`
- Create: `src/features/revision/ResumenRevision.vue`, `src/features/revision/DialogoBien.vue`
- Test: `src/features/revision/VistaRevision.test.ts` (nuevo), `src/lib/plegable.test.ts` (si existe; si no, en el archivo de pruebas de `BloquePlegable`)

**Interfaces:**
- Consumes: `useAvisos()` (Task 2), `revisar`, `ramaDe`, `NIVELES`, `marcar`, `desmarcar` (Task 1), `useOrganizacion().guardarMarcasRevision` y `soloLectura`.
- Produces:
  - `usePlegable(clave, forzar?, porDefecto = false)`: `porDefecto` es lo que vale si no hay nada guardado. `BloquePlegable` gana el prop `abiertoPorDefecto?: boolean`.
  - `FilasRevision` recibe `filas: Fila[]`, con `interface Fila { clave: string; texto: string; detalle?: string; hija?: boolean; acciones: { id: "abrir" | "asignar" | "jefatura" | "eliminar" | "desactivar" | "bien" | "volver"; etiqueta: string; hacer: () => void }[] }`.
    - Cada acción es un `<button data-accion="<id>">`, con `aria-label` igual a `"<etiqueta>: <texto>"`.
    - El texto y el detalle dejan de ser un botón.
  - Cada sección es un `BloquePlegable` con `data-tipo="<TipoAviso>"`, `data-tipo="reemplazos"` o `data-tipo="marcados"`.

**La pantalla, de arriba abajo:**
1. Título, número de avisos pendientes (`aria-live="polite"`) y el filtro (**Rama:** `SelectorUnidad`, con «Toda la organización» como opción vacía).
2. `ResumenRevision`: un bloque por nivel, con su nombre, su frase de por qué y la lista de tipos con avisos, con su número. Cada tipo es un enlace (`href="#revision-<tipo>"`) que abre y lleva a su sección. Un nivel sin avisos dice «Todo en orden».
3. Si `fueraDeRama > 0`, la línea de `revision.fueraDeRama`.
4. Las secciones con avisos, en el orden de `NIVELES` (`id="revision-<tipo>"`). Cada una lleva su título, su número, su frase (`revision.<tipo>.ayuda`) y sus filas. Una sección vacía no se muestra: el resumen ya la nombra.
5. Reemplazos vigentes, plegada.
6. «Marcados como bien (N)», plegada. Cada fila muestra el aviso, «motivo · fecha» y **Volver a avisar**.

**Acciones por tipo:**

| Tipo | Botón | Hace |
|---|---|---|
| sinJefatura | Elegir jefatura (`jefatura`) | `router.push({ path: "/", query: { ver: id } })` |
| vacantesLargas, vacantesRecientes | Asignar titular (`asignar`) | `usePuesto().abrir(puestoId)` |
| sinPuesto; personas de correos y nombres | Abrir ficha (`abrir`) | `useFicha().intentarAbrir(id)` |
| vacias | Eliminar (`eliminar`) | `org.eliminarUnidad(id)`; aviso «Unidad eliminada» con Deshacer, como en `BarraSeleccion.vue:92` |
| sinUso | Desactivar (`desactivar`) | `desactivarValor(tabla, id)` o `desactivarLeyenda(id)`; aviso «Valor desactivado» con Deshacer, que llama a `reactivarValor` o a `reactivarLeyenda` |
| reemplazos | Ver puesto (`abrir`) | `usePuesto().abrir(puestoId)` |
| todo aviso pendiente (en grupos, la fila del grupo) | Así está bien (`bien`) | abre `DialogoBien` |
| marcados | Volver a avisar (`volver`) | `guardarMarcasRevision(desmarcar(marcas, clave, vigentes))` |

- Un `Resultado` con `ok: false` se muestra con `toast.error(r.mensaje)`.
- Con `soloLectura`, no se crean las acciones `eliminar`, `desactivar`, `bien` ni `volver`.

**`DialogoBien`:**
- Usa el `Dialog` de `components/ui`. El título es «Así está bien» y la descripción, el texto del aviso.
- Tiene un `Textarea` con la etiqueta «Motivo», `maxlength` 200 y el ejemplo «Por ejemplo: es una unidad nueva y todavía no tiene personas.».
- **Guardar** está desactivado mientras el motivo esté vacío. **Cancelar** cierra sin guardar.
- Al guardar: `guardarMarcasRevision(marcar(marcas, clave, motivo, hoyISO(new Date()), vigentes)!)`. Si da error, el diálogo queda abierto y muestra el mensaje. Al cerrar, el foco vuelve al botón que lo abrió (`useRetornoFoco`).

**Textos (`es.json`, bajo `revision`; el inglés dice lo mismo).** Se conservan `titulo`, `avisos`, `dias` y `nombresGrupo`, y `tablas` queda igual. Se eliminan `sinAvisos`, `vacantes.*` y `enOrden`, si ya nadie los usa.

- `niveles.importante`: «Importante» / «Nadie responde por estas unidades, o hay datos que pueden estar duplicados.»
- `niveles.revisar`: «Para revisar» / «Puede que estén bien, pero conviene mirarlos.»
- `niveles.limpieza`: «Orden y limpieza» / «No afectan a nadie; quitarlos deja las listas más cortas.»
- `todoEnOrden`: «Todo en orden»
- `sinJefatura`: «Unidades sin jefatura» / «Nadie responde hoy por estas unidades: elige su puesto de jefatura y dale un titular o un reemplazo.»
- `correos`: «Correos repetidos» / «Dos fichas con el mismo correo suelen ser la misma persona cargada dos veces: elimina la que sobra o corrige el correo.»
- `vacantesLargas`: «Vacantes de más de 90 días» / «Llevan más de tres meses sin titular: asígnale uno, o elimina el puesto si ya no se usa.»
- `sinPuesto`: «Personas sin puesto vigente» / «Hoy no ocupan ni reemplazan ningún puesto: asígnalas desde el puesto, o elimínalas si ya no trabajan aquí.»
- `nombres`: «Nombres parecidos» / «Mismo nombre, sin contar tildes ni el orden de las palabras: si es la misma persona, elimina la ficha que sobra; si no, márcalo como bien.»
- `vacantesRecientes`: «Vacantes recientes» / «Sin titular hace 90 días o menos, o sin fecha: asígnale uno cuando lo tengas.»
- `vacias`: «Unidades vacías» / «No tienen puestos ni subunidades: agrégale puestos, o elimínala si ya no existe.»
- `sinUso`: «Valores sin uso» / «Nada los usa: desactívalos para que no aparezcan al elegir.»
- `reemplazos`: «Reemplazos vigentes» / «Solo informa quién reemplaza hoy en cada puesto; no cuenta como aviso.»
- `acciones`: `jefatura` «Elegir jefatura», `asignar` «Asignar titular», `abrir` «Abrir ficha», `verPuesto` «Ver puesto», `eliminar` «Eliminar», `desactivar` «Desactivar», `bien` «Así está bien», `volver` «Volver a avisar»
- `bien`: `titulo` «Así está bien», `motivo` «Motivo», `ejemplo` (el de arriba), `guardar` «Guardar», `cancelar` «Cancelar»
- `marcados`: «Marcados como bien»
- `marca`: «{motivo} · {fecha}»
- `rama`: «Rama»; `todaLaOrganizacion`: «Toda la organización»
- `fueraDeRama`: «{n} aviso no pertenece a ninguna unidad y no se ve con este filtro | {n} avisos no pertenecen a ninguna unidad y no se ven con este filtro»
- `eliminada`: «Unidad eliminada»; `desactivado`: «Valor desactivado»

- [ ] **Step 1: Pruebas que fallan en `VistaRevision.test.ts`**, armadas como `VistaDirectorio.soloLectura.test.ts`, con el store lleno con `$patch` (una unidad sin jefatura, una vacía, una vacante de 120 días, un valor sin uso y una marca guardada):
  - el HTML trae los tres nombres de nivel, en orden, y «Todo en orden» en el nivel sin avisos;
  - trae `data-tipo="sinJefatura"`, `data-tipo="vacantesLargas"` y `data-tipo="marcados"`, y no trae `data-tipo="correos"` (sección vacía);
  - trae `data-accion="bien"`, `data-accion="eliminar"`, `data-accion="desactivar"` y `data-accion="volver"`;
  - con `MODO_LADO` y también con `fechaVista`, no trae ninguno de esos cuatro, y sí trae `data-accion="jefatura"` y `data-accion="asignar"`.
- [ ] **Step 2: Prueba que falla de `usePlegable`:** con `porDefecto = true` y nada guardado, `abierto` es `true`. Si el usuario lo pliega, queda guardado `false` y gana.
- [ ] **Step 3: Correr y ver que fallan.** `npx vitest run src/features/revision src/lib` → FAIL.
- [ ] **Step 4: Implementar** la pantalla, `ResumenRevision`, `DialogoBien`, `FilasRevision` y `usePlegable`.
  - Las filas siguen virtuales y de una línea. Sus botones no cambian el alto de la fila.
  - Los títulos de sección usan `t("revision.<tipo>.titulo")`.
- [ ] **Step 5: Correr y ver que pasan.** `npx vitest run` → PASS. `npm run typecheck`, `npm run lint` y la prueba de claves de i18n → exit 0.
- [ ] **Step 6: Commit.** `"Revisión: resumen por niveles, acciones a un clic, filtro por rama y «Así está bien»"`.

### Task 4: Arnés en la app real y capturas de la ayuda

**Files:**
- Modify: `scripts/arnes-organizaciones.mjs`, `.github/workflows/instalador.yml`
- Test: `scripts/arnes-organizaciones.test.ts` (si cambia algo puro), el propio arnés en CI

**Interfaces:**
- Consumes: `data-tipo` y `data-accion` (Task 3); `capturar(app, carpeta, nombre)`, que ya existe.
- Produces: `capturarRevision(app, carpeta)`, que deja `revision-lista-es.webp` y `revision-lista-en.webp`.

- [ ] **Step 1: Ajustar el bloque «lado a lado» de Revisión** (hoy en `arnes-organizaciones.mjs:1887-1903`).
  - La vacante se busca con `[data-tipo^="vacantes"] [data-accion="asignar"]` dentro del marco.
  - Se comprueba que el marco no tenga ningún `[data-accion="bien"]`, `[data-accion="volver"]`, `[data-accion="eliminar"]` ni `[data-accion="desactivar"]`.
- [ ] **Step 2: Agregar las comprobaciones en el panel principal**, antes de `irAlLado("/revision")`. Primero se comprueba que el `rutaBd` de la app es el de la portable del arnés y no una carpeta de datos del usuario.
  - Ir a `/revision` y leer el contador del menú.
  - Pulsar el primer `[data-accion="bien"]`, escribir «Prueba del arnés» en el motivo y pulsar **Guardar**.
  - `verQue`: el contador bajó en 1, y `[data-tipo="marcados"]` incluye «Prueba del arnés».
  - Pulsar su **Volver a avisar**. `verQue`: el contador vuelve al número de antes.
  - Sin errores en la consola.
- [ ] **Step 3: `capturarRevision`.** Con Revisión en el panel principal y antes de marcar nada:
  - Llamar a `Page.captureScreenshot` con `format: "webp"` y un `clip` de 888 × 440 desde la esquina superior izquierda de la sección de Revisión. Se guarda como `revision-lista-es.webp`.
  - Poner `boldo:idioma` en `"en"`, recargar, capturar `revision-lista-en.webp` y volver a `"es"`.
- [ ] **Step 4: Subir las capturas** en `instalador.yml` como el artefacto `capturas-revision`, igual que `capturas-comparar`, también si el arnés falló.
- [ ] **Step 5:** `npx vitest run scripts` → PASS. Commit: `"Arnés: Revisión con «Así está bien», solo lectura al lado y capturas"`.

### Task 5: Ayuda, sitio, README, novedad y PR

**Files:**
- Modify: `ayuda/es/revision.md`, `ayuda/en/revision.md`, `ayuda/img/es/revision-lista.webp`, `ayuda/img/en/revision-lista.webp`, `site/textos/es/funciones.json`, `site/textos/en/funciones.json`, `site/textos/{es,en}/inicio.json` (si la portada nombra Revisión), `site/novedades.json`, `README.md`, `README.es.md`

- [ ] **Step 1: Reescribir `ayuda/{es,en}/revision.md`**, con la misma forma de hoy («En resumen», captura y pasos). Cubre:
  - los tres niveles y por qué importa cada uno;
  - una línea por tipo con su acción;
  - Eliminar y Desactivar con Deshacer;
  - «Así está bien»: motivo obligatorio, dónde se ven los marcados, Volver a avisar, que un grupo que cambia vuelve a avisar, y que las marcas son de esta base y no viajan con una rama exportada;
  - el filtro por rama y lo que queda fuera;
  - que a una fecha o al lado solo se mira.

  Pon `id` en los encabezados para el ancla de la novedad (`asi-esta-bien` / `looks-fine`). Actualiza el `alt` de la captura.
- [ ] **Step 2: Item `revision` de `site/textos/{es,en}/funciones.json`.** Cambia `texto`, `puntos` y `alt` para que hablen del resumen por niveles, la acción a un clic, el filtro por rama y «Así está bien».
- [ ] **Step 3: Portada del sitio.** Revisa `site/textos/{es,en}/inicio.json` y la descripción de `site/funciones.md`. Donde nombren lo que hace Revisión, ponlo al día. La portada ya toma las últimas novedades de `novedades.json`.
- [ ] **Step 4: Una entrada nueva al principio de `site/novedades.json`**, con `id` `"revision-clara"` y `pagina` `"revision"`. El `titulo` es «Revisión que dice qué importa» (en: «A Review that says what matters»). El `texto` va en dos frases simples, y `ancla` apunta al Step 1. `npx vitest run scripts/novedades.test.ts` → PASS.
- [ ] **Step 5: README (`README.md` y `README.es.md`).**
  - En «Features» / «Funciones», la línea de Revisión dice lo que trae ahora: resumen de lo importante, acción a un clic, filtro por rama y «Así está bien».
  - Agrega las funciones que faltan: comparar dos organizaciones, ver dos pestañas a la vez (vista dividida) y ver otra organización al lado en solo lectura.
  - Quita la insignia «status: alpha» y cambia «it is an alpha version: a test release» (y su par en español) por «it is still a test release» / «todavía es una versión de prueba», como `site/acerca.md`.
  - Ninguna línea dice en qué versión llegó una función.
- [ ] **Step 6:** `graphify update .`. `npx vitest run`, `npm run typecheck` y `npm run lint` → exit 0. Commit.
- [ ] **Step 7: PR.** Título «Revisión de datos más clara», con la etiqueta `version:menor`. En la descripción: las decisiones [VISIBLE] y la medición de `revisar` con 1.000 marcas.
- [ ] **Step 8: Capturas.** Cuando el CI de Windows pase:
  - bajar `capturas-revision` con `gh run download`;
  - mirarlas;
  - copiarlas a `ayuda/img/{es,en}/revision-lista.webp`;
  - hacer commit y empujar.
- [ ] **Step 9: Revisión final del PR completo**, arreglar lo que salga y volver a verde. Fusionar, borrar la rama, comprobar que la versión se publica y que el sitio muestra la novedad, y anotar en el ledger `.superpowers/sdd/2026-10-28-fase2-nucleo/progress.md`: «Task 29c: complete».
