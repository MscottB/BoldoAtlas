# BoldoAtlas — Fase 2: Núcleo (árbol, fichas, directorio) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el autor pueda crear y editar su organigrama en la app: unidades (gerencia, área, subárea), jerarquía y conexiones laterales en un lienzo, jefaturas, fichas de trabajadores y vacantes, mantenedores (cargo, tipo de contrato, sede, jornada), etiquetas, directorio, búsqueda `Ctrl+K`, tema claro/oscuro con acento, bienvenida con datos de ejemplo y configuración de la organización.

**Architecture:** La lógica vive en funciones puras testeables: repositorios que **arman sentencias SQL** (`Sentencia[]`) sin ejecutarlas, dominio de jerarquía y layout. Un store Pinia (`useOrganizacion`) carga todo con `consultar` y escribe con `lote` (una transacción por acción). Los componentes solo leen el store y llaman sus acciones. Los tests de repositorios y del store corren el SQL real sobre `node:sqlite` en memoria con el mismo esquema `0001_inicial.sql`.

**Tech Stack:** Vue 3 + TS, Pinia, Vue Flow + elkjs, shadcn-vue (Reka UI), `@lucide/vue`, `uuid` (v7), Vitest + `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md` (§4, §5, §7, §8 "Árbol", "Panel de unidad", "Ficha", "Directorio", §13 tema). Nota obligatoria: `docs/superpowers/notas/2026-10-28-prueba-rendimiento.md`.

**Fuera de esta fase:** procesos SIPOC/RACI e indicadores (Fase 3), exportaciones y carga masiva (Fase 4), `.boldo`/fusión/escenarios (Fase 5), sitio (Fase 6). Sus entradas en la interfaz aparecen deshabilitadas con la fase en que llegan.

## Global Constraints

- Ningún componente ni store escribe SQL: solo `src/db/repos/*`. Consultas siempre con `?`.
- Toda escritura de una acción del usuario va en **un** `lote()` (una transacción, `data_revision` +1).
- IDs: UUID v7 generados en el frontend (`uuid` → `v7()`); fechas `new Date().toISOString()`.
- Borrado siempre lógico (`deleted_at`); las lecturas normales filtran `deleted_at IS NULL`.
- Correo vacío o solo espacios se guarda como `NULL`.
- Gerencia y área **no** se guardan en el trabajador: se derivan de la jerarquía.
- Cargo, tipo de contrato, sede y jornada se eligen de sus mantenedores (tablas `cargos`, `tipos_contrato`, `sedes`, `jornadas`); la ficha nunca guarda esos datos como texto libre. Desactivar un valor es borrado lógico: sale de las listas, pero las fichas que lo usan lo conservan y lo muestran "(inactivo)".
- Lienzo: **sin** `only-render-visible-elements`; ramas **colapsadas por defecto** desde el nivel 2; nodos livianos (sin sombras ni transiciones por nodo).
- Guardado automático: no existe botón "Guardar"; indicador "Guardado" en la barra superior.
- Eliminar muestra un aviso con **Deshacer** durante 8 s.
- Accesibilidad: contraste AA en ambos temas, foco visible, todo operable por teclado, botones de solo ícono con `aria-label`.
- Textos en español. Íconos `@lucide/vue`. Colores de marca: `--primary` `#1E2A38`, `--marca` `#C8743F`.
- Preferencias por PC (tema, acento, escala, filtros del directorio) en `localStorage`, siempre dentro de `try/catch` con valores por defecto.
- Commits: Conventional Commits. Sin push ni etiquetas sin pedirlo.

## Review Focus

1. **Eliminar una unidad con subunidades o personas** (incluida la raíz): debe ofrecer mover su contenido a la unidad superior o cancelar; la raíz con contenido no se puede eliminar y lo explica. → Tests en Task 2 (`eliminarUnidad`) y Task 5 (store).
2. **Mover una unidad dentro de su propia rama** (arrastrando o editando el superior): se rechaza con un mensaje y no se escribe nada. → Test `creaCiclo` en Task 3 y acción `moverUnidad` en Task 5.
3. **Correo repetido con otras mayúsculas o espacios, o vacío**: mensaje claro ("Ya existe una persona con ese correo"); vacío se guarda como `NULL`. → Tests en Tasks 2 y 4.
4. **Deshacer después de "mover contenido y eliminar"**: las subunidades y personas vuelven a su superior original, no se quedan en el nuevo. → Test en Task 5 (`deshacer restaura el contenido movido`).
5. **Organización grande totalmente expandida (2.000 unidades)**: el lienzo debe seguir ≥ 30 FPS al arrastrar con el nodo real. → Medición en Task 14.
6. **Valor de mantenedor duplicado o desactivado**: agregar "analista  de Compras" cuando existe "Analista de compras" sugiere el existente en vez de duplicar; desactivar un cargo en uso no lo borra de las fichas ni del directorio. → Tests en Task 5 (`crearValor` y `desactivarValor`).

---

### Task 1: Base de UI y utilidades

**Files:**
- Create: `src/lib/ids.ts`, `src/lib/ids.test.ts`, `src/lib/preferencias.ts`, `src/lib/preferencias.test.ts`
- Create (vía CLI): `src/components/ui/{button,input,label,dialog,tabs,select,command,sonner,badge,tooltip,dropdown-menu,textarea,alert-dialog}`
- Modify: `package.json`, `src/App.vue` (montar `<Toaster />`)

**Interfaces:**
- Produces: `nuevoId(): string` (UUID v7), `ahora(): string` (ISO-8601 UTC); `leerPreferencia<T>(clave: string, porDefecto: T): T`, `guardarPreferencia(clave: string, valor: unknown): void` (prefijo de claves `boldo:`; nunca lanzan).

- [ ] **Step 1:** `npm i uuid` y `npx shadcn-vue@latest add button input label dialog tabs select command sonner badge tooltip dropdown-menu textarea alert-dialog`.
- [ ] **Step 2: Tests que fallan**

```ts
it('nuevoId genera UUID v7', () => expect(nuevoId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
it('ahora devuelve ISO UTC', () => expect(ahora()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/))
it('leerPreferencia usa el valor por defecto si localStorage falla', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
  expect(leerPreferencia('tema', 'claro')).toBe('claro'); expect(() => guardarPreferencia('tema', 'oscuro')).not.toThrow()
})
it('guarda y lee JSON con prefijo boldo:', () => { /* stub en memoria; guardarPreferencia('escala',110) → getItem('boldo:escala') === '110' */ })
```

- [ ] **Step 3:** Verificar que fallan (`npx vitest run src/lib`), implementar, verificar que pasan; `npm run lint && npm run typecheck`.
- [ ] **Step 4: Commit** `feat: utilidades de ids, preferencias y componentes base de shadcn-vue`

---

### Task 2: Mantenedores en el esquema, repositorios (sentencias SQL) y entorno de pruebas SQLite

**Files:**
- Modify: `src-tauri/migrations/0001_inicial.sql` (aún no publicada, se edita en el lugar), `src/db/esquema.test.ts`
- Create: `src/db/repos/unidades.ts`, `trabajadores.ts`, `catalogos.ts`, `etiquetas.ts`, `conexiones.ts`, `meta.ts`; `src/db/tipos.ts`
- Create: `src/db/prueba/sqlite.ts` (solo tests: abre `:memory:` con el esquema y ejecuta `Sentencia[]` en una transacción, imitando `db::lote`)
- Test: `src/db/repos/*.test.ts`

**Interfaces:**
- Consumes: `Sentencia` de `src/db/cliente.ts`; `nuevoId`, `ahora` (Task 1).
- Esquema (cambia `0001_inicial.sql`): cuatro tablas `cargos`, `tipos_contrato`, `sedes`, `jornadas` con columnas `id TEXT PRIMARY KEY NOT NULL, nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0), orden INTEGER NOT NULL DEFAULT 0, created_at, updated_at, deleted_at` y un índice único parcial `ux_<tabla>_nombre ON <tabla>(lower(trim(nombre))) WHERE deleted_at IS NULL`. En `trabajadores`, la columna `cargo TEXT` se reemplaza por `cargo_id TEXT REFERENCES cargos(id) DEFERRABLE INITIALLY DEFERRED` y se agregan `tipo_contrato_id`, `sede_id`, `jornada_id` (mismas reglas, cada uno con su índice). El CHECK de vacante pasa a `estado = 'activo' OR cargo_id IS NOT NULL`.
- Produces (`src/db/tipos.ts`): `Unidad { id, tipo: 'gerencia'|'area'|'subarea'|'otra', nombre, descripcion: string|null, parent_id: string|null, jefe_id: string|null, orden }`, `Trabajador { id, estado: 'activo'|'vacante', nombre: string|null, correo: string|null, telefono: string|null, cargo_id: string|null, tipo_contrato_id: string|null, sede_id: string|null, jornada_id: string|null, unidad_id, foto_png: string|null, notas: string|null }`, `TablaCatalogo = 'cargos'|'tipos_contrato'|'sedes'|'jornadas'`, `TABLAS_CATALOGO: readonly TablaCatalogo[]`, `ValorCatalogo { id, nombre, orden, deleted_at: string|null }`, `Etiqueta { id, nombre, color }`, `Conexion { id, origen_id, destino_id, etiqueta: string|null }`.
- Produces (cada función devuelve `Sentencia[]`, nunca ejecuta):
  - `catalogos`: `crearValor(tabla, nombre): { id, sentencias }`, `renombrarValor(tabla, id, nombre)`, `moverValor(tabla, id, orden)`, `desactivarValor(tabla, id)`, `reactivarValor(tabla, id)`. El nombre de tabla no puede ir como parámetro SQL: toda función valida `tabla` contra `TABLAS_CATALOGO` y lanza `Error('Catálogo desconocido')` si no está.
  - `unidades`: `crearUnidad(datos): { id, sentencias }`, `editarUnidad(id, cambios)`, `moverUnidad(id, nuevoPadre: string|null)`, `asignarJefe(id, jefeId: string|null)`, `eliminarUnidad(u: Unidad, contenido: { hijos: string[], personas: string[] })` (mueve hijos y personas a `u.parent_id` y marca `deleted_at`), `restaurarUnidad(id, contenido: { hijos: string[], personas: string[] })` (quita `deleted_at` y devuelve el contenido a `id`); lecturas `SQL_UNIDADES`.
  - `trabajadores`: `crearTrabajador(datos)`, `editarTrabajador(id, cambios)` (normaliza correo), `eliminarTrabajador(id)`, `restaurarTrabajador(id)`; `normalizarCorreo(c: string|null): string|null`.
  - `etiquetas`: `crearEtiqueta`, `etiquetarUnidad(unidadId, etiquetaId)`, `quitarEtiqueta(unidadId, etiquetaId)`.
  - `conexiones`: `crearConexion(origen, destino, etiqueta)`, `eliminarConexion(id)`.
  - `meta`: `guardarMeta(clave, valor)`; claves `org_nombre`, `logo_png`.
- Toda sentencia de edición fija `updated_at = ahora()`.

- [ ] **Step 0: Esquema.** Actualizar los tests de `src/db/esquema.test.ts` que usan `cargo` para que usen `cargo_id` (insertando antes un cargo) y agregar: `cargos` rechaza `" ANALISTA "` si existe `"analista"` (`/UNIQUE/`) y lo acepta si el existente está desactivado; `trabajadores.cargo_id` con un id inexistente falla al confirmar (`/FOREIGN KEY/`); la clave foránea de cada catálogo tiene índice (el test de índices existente debe seguir pasando). Verlos fallar, cambiar `0001_inicial.sql`, verlos pasar, y correr también `cargo test --manifest-path src-tauri/Cargo.toml` (la migración se incluye en Rust).
- [ ] **Step 1: Tests que fallan** (uno por función; se aplican con `src/db/prueba/sqlite.ts` y se consulta el resultado):
  - `crearValor('cargos', 'Analista')` crea el valor; `crearValor('usuarios', 'x')` lanza `'Catálogo desconocido'`; `desactivarValor` deja `deleted_at` y el trabajador que lo usaba conserva su `cargo_id`; `reactivarValor` lo devuelve.
  - `crearUnidad` crea raíz y subunidad con `parent_id` correcto.
  - `eliminarUnidad` con 2 hijos y 3 personas: hijos y personas quedan en el superior; la unidad queda con `deleted_at`.
  - `restaurarUnidad` devuelve hijos y personas a la unidad restaurada.
  - `normalizarCorreo("  ")` → `null`; `normalizarCorreo(" Ana@X.cl ")` → `"Ana@X.cl"` (quita espacios y conserva mayúsculas; la unicidad sin mayúsculas la impone el índice). `editarTrabajador` con correo `"  "` guarda `NULL`.
  - `crearTrabajador` vacante sin nombre y con cargo pasa; vacante sin cargo lanza `/CHECK/` al aplicar.
  - `etiquetarUnidad` dos veces la misma etiqueta lanza `/UNIQUE/`; `quitarEtiqueta` marca `deleted_at` y permite volver a etiquetar.
  - `crearConexion(a, a)` lanza `/CHECK/`.
  - `guardarMeta('org_nombre', 'X')` inserta o reemplaza (`INSERT … ON CONFLICT(clave) DO UPDATE`).
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan (`npx vitest run src/db`).
- [ ] **Step 3: Commit** `feat(db): mantenedores y repositorios de unidades, trabajadores, catálogos, etiquetas, conexiones y meta`

---

### Task 3: Dominio de la jerarquía

**Files:**
- Create: `src/features/arbol/jerarquia.ts`, `src/features/arbol/jerarquia.test.ts`

**Interfaces:**
- Consumes: `Unidad`, `Trabajador`.
- Produces:
  - `indexar(unidades: Unidad[]): Map<string, Unidad>`; `hijos(unidades, id): Unidad[]` (ordenados por `orden`, luego `nombre`).
  - `ruta(unidades, id): Unidad[]` (de la raíz a la unidad) y `rutaTexto(unidades, id): string` (`"Gerencia › Área › Subárea"`).
  - `descendientes(unidades, id): Set<string>` (sin incluirse).
  - `creaCiclo(unidades, id, nuevoPadre: string|null): boolean` (verdadero si `nuevoPadre` es `id` o uno de sus descendientes).
  - `dotacion(unidades, trabajadores, id): { directa: number, total: number, vacantes: number }` (activos directos; total = rama; vacantes de la rama).
  - `gerenciaYArea(unidades, unidadId): { gerencia: string|null, area: string|null, subarea: string|null }` (primer ancestro de cada tipo).

- [ ] **Step 1: Tests que fallan** con un árbol fijo de 6 unidades (GG › Operaciones › Mantención › {Mecánica, Eléctrica}; GG › Finanzas) y 8 trabajadores (2 vacantes):
  - `rutaTexto(…,'mecanica')` → `"Gerencia General › Operaciones › Mantención › Mecánica"`.
  - `creaCiclo(…, 'operaciones', 'mecanica')` → `true`; `creaCiclo(…, 'mecanica', 'finanzas')` → `false`; `creaCiclo(…, 'x', 'x')` → `true`; `creaCiclo(…, 'gg', null)` → `false`.
  - `dotacion(…, 'mantencion')` → `{ directa: 1, total: 5, vacantes: 1 }` (valores del fixture).
  - `gerenciaYArea(…, 'mecanica')` → `{ gerencia: 'Operaciones', area: 'Mantención', subarea: 'Mecánica' }`.
  - `hijos` ignora unidades con `deleted_at` (el fixture incluye una borrada).
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan.
- [ ] **Step 3: Commit** `feat(arbol): dominio de jerarquía, rutas, ciclos y dotación`

---

### Task 4: Mensajes de error comprensibles

**Files:**
- Create: `src/db/errores.ts`, `src/db/errores.test.ts`

**Interfaces:**
- Produces: `traducirError(e: unknown): string`.

- [ ] **Step 1: Tests que fallan** (texto de SQLite → mensaje):
  - `"UNIQUE constraint failed: index 'ux_trabajadores_correo'"` → `"Ya existe una persona con ese correo."`
  - `ux_etiquetas_nombre` → `"Ya existe una etiqueta con ese nombre."`; `ux_unidad_etiquetas` → `"La unidad ya tiene esa etiqueta."`
  - `"CHECK constraint failed: …estado = 'vacante' OR…nombre…"` → `"Falta el nombre de la persona."`; el de `cargo` → `"Una vacante necesita un cargo."`
  - `"CHECK constraint failed: origen_id <> destino_id"` → `"Una unidad no puede conectarse consigo misma."`
  - `ux_cargos_nombre`, `ux_tipos_contrato_nombre`, `ux_sedes_nombre`, `ux_jornadas_nombre` → `"Ese valor ya existe en la lista."`
  - `"FOREIGN KEY constraint failed"` → `"La unidad o persona relacionada ya no existe."`
  - Texto desconocido → se devuelve tal cual (nunca se oculta el error).
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan.
- [ ] **Step 3: Commit** `feat(db): traducción de errores de SQLite a mensajes en español`

---

### Task 5: Store de la organización

**Files:**
- Create: `src/stores/organizacion.ts`, `src/stores/organizacion.test.ts`, `src/lib/texto.ts`, `src/lib/texto.test.ts`

**Interfaces:**
- Consumes: `consultar`, `lote`, `leerMeta` (`src/db/cliente.ts`); repos (Task 2); jerarquía (Task 3); `traducirError` (Task 4).
- Produces `useOrganizacion()` con:
  - estado: `unidades: Unidad[]`, `trabajadores: Trabajador[]`, `etiquetas: Etiqueta[]`, `unidadEtiquetas: { unidad_id, etiqueta_id }[]`, `conexiones: Conexion[]`, `org: { nombre: string, logo: string|null }`, `cargado: boolean`, `guardando: boolean`, `error: string|null`, `ultimoBorrado: Borrado | null`.
  - getters: `raices`, `vacia` (sin unidades activas), `porId`.
  - acciones (todas `async`, devuelven `{ ok: true } | { ok: false, mensaje: string }` y recargan tras escribir): `cargar()`, `crearUnidad(datos)`, `editarUnidad(id, cambios)`, `moverUnidad(id, nuevoPadre)` (rechaza ciclos **antes** de escribir: `"No se puede mover una unidad dentro de su propia rama."`), `asignarJefe`, `eliminarUnidad(id)` (raíz con contenido → `"No se puede eliminar la unidad raíz mientras tenga contenido."`), `crearTrabajador`, `editarTrabajador`, `eliminarTrabajador`, `etiquetar`, `quitarEtiqueta`, `crearEtiqueta`, `crearConexion`, `eliminarConexion`, `guardarOrg(nombre, logo)`, `deshacer()`, `cargarEjemplo()` (organización de muestra en un solo `lote`).
  - `Borrado = { tipo: 'unidad'|'trabajador', id, contenido?: { hijos, personas }, vence: number }`; `deshacer()` solo actúa si `Date.now() < vence`.
  - Mantenedores: estado `catalogos: Record<TablaCatalogo, ValorCatalogo[]>` (incluye los desactivados); getters `activos(tabla)` (ordenados por `orden`, luego `nombre`) y `usos(tabla, id): number` (trabajadores no borrados que lo usan); acciones `crearValor(tabla, nombre)` → `{ ok: true, id } | { ok: false, mensaje, existente?: string }` (antes de escribir busca uno activo igual con `normalizarTexto`; si lo hay, no escribe y devuelve `mensaje: 'Ya existe «<nombre existente>» en la lista.'` y `existente: id`), `renombrarValor`, `moverValor`, `desactivarValor`, `reactivarValor`.
- Produces (`src/lib/texto.ts`): `normalizarTexto(s: string): string` (minúsculas, sin tildes ni diéresis, espacios colapsados y recortados; `'  Analista  de  Compras '` → `'analista de compras'`, `'Muñoz'` → `'munoz'`).
- Recarga completa tras cada escritura. `// shortcut: recarga todo tras cada escritura; si una org de 2.000 unidades se siente lenta, aplicar el cambio en memoria.`

- [ ] **Step 1: Tests que fallan.** `vi.mock('@/db/cliente')` con un adaptador sobre `src/db/prueba/sqlite.ts` (`consultar` → `prepare().all()`, `lote` → transacción + `data_revision`):
  - `crearUnidad` raíz + hija → `unidades.length === 2`, `ok: true`.
  - `moverUnidad(padre, hija)` → `{ ok: false, mensaje: 'No se puede mover una unidad dentro de su propia rama.' }` y la base no cambió (`data_revision` igual).
  - `eliminarUnidad` de una unidad con hijos y personas los deja en su superior; `deshacer restaura el contenido movido` → vuelven a la unidad restaurada.
  - `eliminarUnidad(raiz)` con hijos → `ok: false` con el mensaje de raíz.
  - `crearTrabajador` con correo repetido (`' ANA@x.cl '`) → `{ ok: false, mensaje: 'Ya existe una persona con ese correo.' }`.
  - `deshacer()` después de vencido no hace nada.
  - `cargarEjemplo()` deja ≥ 10 unidades, ≥ 1 conexión lateral, ≥ 1 vacante, ≥ 3 etiquetas y valores en los cuatro mantenedores en un solo `lote` (`data_revision` sube exactamente 1).
  - `crearValor('cargos', 'analista  de Compras')` con "Analista de compras" activo → `ok: false`, `existente` = su id, sin escribir; con el existente desactivado → crea uno nuevo.
  - `desactivarValor` de un cargo en uso: el trabajador conserva `cargo_id`, `activos('cargos')` ya no lo incluye y `usos` sigue contándolo.
  - `normalizarTexto` (en `texto.test.ts`): los dos ejemplos de la interfaz.
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan.
- [ ] **Step 3: Commit** `feat: store de la organización con deshacer y datos de ejemplo`

---

### Task 6: Tema, acento y escala

**Files:**
- Create: `src/features/tema/tema.ts`, `src/features/tema/tema.test.ts`, `src/features/tema/useTema.ts`
- Modify: `src/styles/main.css` (`--marca-foreground` calculado por JS), `src/main.ts` (aplicar tema antes de montar)

**Interfaces:**
- Produces: `ACENTOS: Record<'cobre'|'azul'|'verde'|'violeta', string>` (`#C8743F`, `#2563EB`, `#0D9488`, `#7C3AED`); `textoSobre(hex: string): '#ffffff'|'#111827'` (el de mayor contraste WCAG); `contraste(a: string, b: string): number`; `useTema()` → `{ tema: Ref<'claro'|'oscuro'|'sistema'>, acento, escala: Ref<90|100|110|125>, aplicar() }` (clase `.dark` en `<html>`, `--marca`, `--marca-foreground`, `font-size` raíz = escala %; escucha `prefers-color-scheme` cuando es "sistema"; persiste con `guardarPreferencia`).

- [ ] **Step 1: Tests que fallan:** `contraste('#ffffff','#000000')` ≈ 21; `textoSobre('#C8743F')` → el de mayor contraste de los dos; `textoSobre('#7C3AED')` → `'#ffffff'`; `textoSobre('#FDE68A')` → `'#111827'`.
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan.
- [ ] **Step 3: Commit** `feat: tema claro/oscuro/sistema, acento y escala de interfaz`

---

### Task 7: Layout del árbol

**Files:**
- Create: `src/features/arbol/layout.ts`, `src/features/arbol/layout.test.ts`

**Interfaces:**
- Consumes: jerarquía (Task 3).
- Produces:
  - `colapsadosIniciales(unidades): Set<string>` (toda unidad de profundidad ≥ 1 con hijos queda colapsada: se ven la raíz y su primer nivel).
  - `subgrafoVisible(unidades, conexiones, colapsados): { nodos: Unidad[], jerarquicas: [padre, hijo][], laterales: Conexion[] }` (las laterales solo si ambos extremos son visibles).
  - `calcularLayout(subgrafo, tam = { ancho: 220, alto: 112 }): Promise<Map<string, { x: number, y: number }>>` con elkjs `layered`/`DOWN`, `elk.spacing.nodeNode: 28`, `elk.layered.spacing.nodeNodeBetweenLayers: 64`; solo las aristas jerárquicas entran al layout.

- [ ] **Step 1: Tests que fallan:** con el fixture de Task 3 más 1 conexión lateral (Mecánica ↔ Finanzas):
  - `colapsadosIniciales` contiene `operaciones` y no contiene `gg`.
  - Con esos colapsados, `subgrafoVisible` muestra GG, Operaciones y Finanzas; la lateral no aparece (Mecánica oculta); al quitar `operaciones` y `mantencion` de colapsados aparece.
  - `calcularLayout` devuelve una posición por nodo visible y el hijo queda más abajo que el padre (`y` mayor).
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan.
- [ ] **Step 3: Commit** `feat(arbol): subgrafo visible con ramas colapsadas y layout elk`

---

### Task 8: Estructura de la app (barra lateral, barra superior, rutas)

**Files:**
- Modify: `src/App.vue`, `src/router.ts`, `src/main.ts`
- Create: `src/components/BarraSuperior.vue`, `src/components/IndicadorGuardado.vue`

**Interfaces:**
- Consumes: `useOrganizacion` (Task 5), `useTema` (Task 6).
- Produces: rutas `/` (Árbol), `/directorio`, `/configuracion`, `/acerca`, `/bienvenida`; las entradas Indicadores, Escenarios e Importar/Exportar se muestran deshabilitadas con tooltip "Llega en la Fase N". Barra superior: nombre de la organización, botón de búsqueda (`Ctrl K`), indicador "Guardado"/"Guardando…" (desde `guardando`), alternar tema, menú Exportar deshabilitado (Fase 4). `main.ts`: tras `cargar()`, si `vacia` → `/bienvenida`.

- [ ] **Step 1:** Implementar. Verificación: `npm run lint && npm run typecheck && npm run test`; `npm run tauri dev` → con base vacía abre en `/bienvenida`; la barra lateral se colapsa bajo 1100 px de ancho.
- [ ] **Step 2: Commit** `feat: estructura de la app con barra lateral, barra superior y rutas`

---

### Task 8c: Idiomas (es/en), Ayuda y menú reorganizado

Pedido del autor: app, README y sitio en español e inglés; sección Ayuda en la app y en la web; "Acerca de" abajo del menú, separado de las secciones del programa.

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/es.json`, `src/i18n/en.json`, `src/i18n/i18n.test.ts`, `ayuda/es/inicio.md`, `ayuda/en/inicio.md`, `ayuda/es/atajos.md`, `ayuda/en/atajos.md`, `src/vistas/VistaAyuda.vue`
- Modify: todos los componentes y vistas existentes con texto (`App.vue`, `BarraSuperior.vue`, `IndicadorGuardado.vue`, `PantallaError.vue`, `VistaAcerca.vue`, `VistaArbol.vue`, vistas provisionales), `src/stores/organizacion.ts` y `src/db/errores.ts` (mensajes por clave), `src/router.ts` (ruta `/ayuda/:pagina?`), `src/main.ts`

**Interfaces:**
- Produces: `i18n` (instancia de `vue-i18n`, modo composición, `legacy: false`), `idiomaInicial(navegador: string): 'es'|'en'`, `cambiarIdioma(idioma)` (persiste con `guardarPreferencia('idioma', …)`); `t()` disponible en componentes (`useI18n`) y fuera de ellos (`i18n.global.t`) para el store y `traducirError`. Las claves se agrupan por área (`nav.*`, `barra.*`, `acerca.*`, `errores.*`, `store.*`, `ayuda.*`).
- Menú: arriba Árbol · Directorio · Indicadores · Escenarios · Importar/Exportar (Árboles llega en T9b); abajo, separados por un divisor: Configuración · Ayuda · Acerca de.
- Ayuda: `VistaAyuda` lista las páginas del idioma activo y muestra la elegida; el Markdown se importa con `?raw` y se renderiza con `markdown-it` (HTML desactivado en el renderizador). Páginas iniciales: inicio (qué es BoldoAtlas, modo portable, dónde quedan los datos) y atajos.

- [ ] **Step 1: Tests que fallan:** `idiomaInicial('es-CL')` → `'es'`, `idiomaInicial('en-US')` → `'en'`, `idiomaInicial('pt-BR')` → `'en'`; `es.json` y `en.json` tienen exactamente las mismas claves (test que compara los conjuntos de claves aplanadas); con idioma `en`, `traducirError` de correo duplicado devuelve el texto en inglés; los tests existentes del store y de errores siguen pasando con el idioma `es` sin cambiar sus aserciones.
- [ ] **Step 2:** Verificar que fallan; implementar; migrar cada texto literal existente a claves (sin cambiar su redacción en español); verificar `npm run lint && npm run typecheck && npm run test && npx vite build`.
- [ ] **Step 3: Commit** `feat: interfaz en español e inglés, sección Ayuda y menú reorganizado`

Para las tareas siguientes (9 a 13): todo texto nuevo va por claves en `es.json` y `en.json`, y cada tarea agrega su página de ayuda en ambos idiomas (`ayuda/es/<tema>.md`, `ayuda/en/<tema>.md`).

---

### Task 9: Lienzo del árbol

**Files:**
- Create: `src/features/arbol/VistaArbol.vue` (reemplaza `src/vistas/VistaArbol.vue`), `NodoUnidad.vue`, `BarraLienzo.vue`, `src/features/arbol/useLienzo.ts`

**Interfaces:**
- Consumes: store (Task 5), layout (Task 7), jerarquía (Task 3).
- Produces: `useLienzo()` → `{ colapsados, seleccion: Ref<string|null>, filtroEtiqueta, filtroTexto, alternarRama(id), seleccionar(id), coincide(u): boolean }`.

Comportamiento (spec §7–8):
- Vue Flow con nodos `NodoUnidad` (tipo, nombre, foto/iniciales y nombre del jefe o "Sin jefatura" en tono de aviso, dotación total, chip de vacantes si > 0, puntos de etiquetas) y botón de plegar con el conteo de hijos ocultos (`+3`). Aristas jerárquicas `smoothstep` sólidas; laterales punteadas en `--marca` con su etiqueta. Minimapa. **Sin** `only-render-visible-elements`.
- Clic selecciona (abre el panel de Task 10); doble clic edita el nombre en línea (Enter guarda, Esc cancela); botón "+" en la tarjeta seleccionada crea una subunidad (tipo sugerido: gerencia→área→subárea→otra) y la deja en edición.
- Arrastrar una tarjeta y soltarla sobre otra: diálogo "¿Mover *X* dentro de *Y*?"; si `creaCiclo`, aviso y no mueve.
- Barra del lienzo: "+ Nueva unidad", resaltar por etiqueta y por texto (las demás quedan al 35 % de opacidad, no se ocultan), zoom −/+, "Encuadrar" (`Ctrl+0`).
- Recalcula el layout al cambiar unidades o colapsados.
- **Vista enfocada en una rama** (pedido del autor, spec §8 "Administrador de árboles y subárboles"): la ruta acepta `/?raiz=<unidadId>`; con `raiz`, el lienzo muestra solo esa unidad y sus descendientes (filtrar las unidades antes de `subgrafoVisible`, tratando `raiz` como única raíz) y, arriba, la ruta de origen con `rutaTexto` (cada tramo clicable cambia `raiz`), "Subir un nivel" (`raiz` = su superior; en una raíz, quita el parámetro) y "Ver en el árbol completo". Sin `raiz` se ven todos los árboles. Lógica pura y testeable: `unidadesDeRama(unidades, raiz): Unidad[]` en `layout.ts` (test: incluye la raíz y sus descendientes vivos, excluye hermanos y ancestros).

- [ ] **Step 1:** Implementar.
- [ ] **Step 2: Verificar** en `npm run tauri dev` con "Explorar un ejemplo": crear subunidad con "+", renombrar con doble clic, plegar y desplegar, arrastrar Mantención sobre su propia subárea → aviso y sin cambios, resaltar por etiqueta, encuadrar. Volver a abrir la app: los cambios siguen ahí.
- [ ] **Step 3: Commit** `feat(arbol): lienzo con edición, plegado, arrastre y resaltado`

---

### Task 9b: Administrador de árboles y subárboles guardados

**Files:**
- Modify: `src-tauri/migrations/0001_inicial.sql` (tabla `subarboles_guardados`; aún no publicada), `src/db/esquema.test.ts`, `src/db/tipos.ts`, `src/stores/organizacion.ts`, `src/stores/organizacion.test.ts`, `src/App.vue` (entrada "Árboles" en la barra lateral), `src/router.ts`
- Create: `src/db/repos/subarboles.ts`, `src/db/repos/subarboles.test.ts`, `src/features/arboles/VistaArboles.vue`

**Interfaces:**
- Consumes: `jerarquia` (`dotacion`, `rutaTexto`), store, ruta `/?raiz=<id>` de Task 9.
- Produces: tabla `subarboles_guardados (id TEXT PRIMARY KEY NOT NULL, unidad_id TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED, nombre TEXT, orden INTEGER NOT NULL DEFAULT 0, created_at, updated_at, deleted_at)` con `idx_subarboles_guardados_unidad_id` y único parcial `ux_subarboles_unidad ON subarboles_guardados(unidad_id) WHERE deleted_at IS NULL`; tipo `SubarbolGuardado { id, unidad_id, nombre: string|null, orden }`; repo `guardarSubarbol(unidadId, nombre?)`, `renombrarSubarbol(id, nombre|null)`, `moverSubarbol(id, orden)`, `quitarSubarbol(id)`, lectura `SQL_SUBARBOLES` (solo los de unidades vivas); store: estado `subarboles`, acciones `guardarSubarbol`, `renombrarSubarbol`, `moverSubarbol`, `quitarSubarbol` (mismo contrato `{ ok, mensaje }`) y `crearArbol(nombre, tipo)` (= `crearUnidad` sin superior).
- Vista `/arboles`: un bloque por raíz (nombre, tipo, dotación total con `dotacion`, botón "Abrir" → `/?raiz=<id>`), debajo sus subárboles guardados (nombre o el de la unidad, ruta de origen con `rutaTexto`, abrir, renombrar en línea, subir/bajar, quitar), y "+ Nuevo árbol". En el lienzo (Task 9) y en el panel (Task 10): "Guardar en Árboles" para la raíz enfocada o la unidad seleccionada (si ya está guardada, el botón dice "Guardado").

- [ ] **Step 1: Tests que fallan:** esquema — un segundo subárbol activo de la misma unidad lanza `/UNIQUE/`, y tras quitarlo se puede volver a guardar; repo — guardar, renombrar, mover y quitar; store — `guardarSubarbol` dos veces devuelve `ok: false` con `"Esa rama ya está guardada en Árboles."` (agregar el mensaje a `traducirError` para `subarboles_guardados.unidad_id`); el subárbol de una unidad eliminada no aparece en `subarboles`.
- [ ] **Step 2:** Verificar que fallan; implementar; verificar que pasan; `cargo test` (la migración se incluye en Rust).
- [ ] **Step 3:** Verificar en la app: crear un segundo árbol, guardar Mantención como subárbol, abrirlo desde Árboles, subir un nivel, volver al árbol completo.
- [ ] **Step 4: Commit** `feat(arboles): administrador de árboles y subárboles guardados`

---

### Task 10: Panel de unidad

**Files:**
- Create: `src/features/unidades/PanelUnidad.vue`, `SelectorPersona.vue`, `EditorEtiquetas.vue`, `EditorConexiones.vue`

**Interfaces:**
- Consumes: store, jerarquía (`rutaTexto`, `dotacion`), `useLienzo().seleccion`.

Comportamiento: se abre al seleccionar y desplaza el lienzo (no lo tapa); `Esc` lo cierra. Migas de pan Gerencia › Área › Subárea clicables. Pestañas:
- **Resumen:** tipo y nombre editables, descripción, jefatura (asignar/cambiar/quitar con `SelectorPersona`; "Sin jefatura" en aviso), dotación directa/total y vacantes, etiquetas (agregar, quitar, crear con color), conexiones laterales (agregar con buscador de unidades y etiqueta, quitar).
- **Personas:** personas y vacantes directas; clic abre la ficha (Task 11); "+ Agregar persona o vacante".
- **Procesos:** estado vacío "Los procesos llegan en la Fase 3".
- Botón "Eliminar unidad": si tiene contenido, `AlertDialog` "Mover su contenido a *superior* y eliminar" / "Cancelar"; tras eliminar, toast con **Deshacer** (8 s).

- [ ] **Step 1:** Implementar.
- [ ] **Step 2: Verificar:** asignar jefe y verlo en la tarjeta; crear etiqueta "Crítica" y resaltar con ella; conexión lateral visible en el lienzo; eliminar Mantención con contenido y deshacer → todo vuelve a su lugar.
- [ ] **Step 3: Commit** `feat(unidades): panel con jefatura, etiquetas, conexiones y personas`

---

### Task 11: Ficha de trabajador y vacantes

**Files:**
- Create: `src/features/trabajadores/FichaTrabajador.vue`, `src/features/trabajadores/validar.ts`, `src/features/trabajadores/validar.test.ts`

**Interfaces:**
- Produces: `validarFicha(f: { estado, nombre, cargo, correo }): Record<string, string>` (errores por campo).

- [ ] **Step 1: Tests que fallan:** (`validarFicha` recibe `cargo_id` en vez de `cargo`) activo sin nombre → `{ nombre: 'Escribe el nombre.' }`; vacante sin `cargo_id` → `{ cargo: 'Una vacante necesita un cargo.' }`; correo `"ana@"` → `{ correo: 'El correo no es válido.' }`; vacante sin nombre ni correo con `cargo_id` → `{}`.
- [ ] **Step 2:** Implementar `validarFicha`, `src/features/trabajadores/SelectorCatalogo.vue` (combobox con `Command` en `Popover`: valores activos del mantenedor, el valor actual aunque esté inactivo marcado "(inactivo)", y la opción "Agregar «texto» a la lista" cuando no hay coincidencia exacta; si `crearValor` responde `existente`, selecciona ese y avisa) y `FichaTrabajador.vue` (Dialog): alternar Persona/Vacante ("Cubrir vacante" pasa a Persona), nombre, cargo, tipo de contrato, sede y jornada con `SelectorCatalogo`, correo, teléfono, notas, foto opcional (PNG/JPG/WebP hasta 1 MB, se guarda en base64), unidad con selector y ruta derivada, jefe de su unidad, unidades que encabeza. Guarda al salir de cada campo si es válido; errores bajo el campo con `traducirError` para los de la base. "Eliminar" con toast **Deshacer**.
- [ ] **Step 3:** Verificar que los tests pasan; en la app: crear vacante, cubrirla, correo repetido muestra el mensaje.
- [ ] **Step 4: Commit** `feat(trabajadores): ficha con vacantes, validación y foto`

---

### Task 12: Directorio

**Files:**
- Create: `src/features/directorio/VistaDirectorio.vue`, `src/features/directorio/filtrar.ts`, `src/features/directorio/filtrar.test.ts`

**Interfaces:**
- Consumes: `normalizarTexto` (Task 5), `catalogos` del store.
- Produces: `filtrarDirectorio(trabajadores, unidades, unidadEtiquetas, catalogos, filtros: { texto, unidad: string|null, cargo_id: string|null, tipo_contrato_id: string|null, sede_id: string|null, jornada_id: string|null, etiqueta: string|null, estado: 'activo'|'vacante'|null }, orden: { campo: 'nombre'|'cargo'|'unidad', asc: boolean }): FilaDirectorio[]` con `FilaDirectorio { id, titulo, cargo, tipoContrato, sede, jornada, ruta, correo, estado }` (nombres de los valores de catálogo, también los inactivos).

- [ ] **Step 1: Tests que fallan:** filtrar por unidad incluye su rama; por etiqueta usa las etiquetas de la unidad de la persona; por sede y por cargo filtran por id exacto; texto busca en nombre, cargo y correo sin tildes ni mayúsculas (`"munoz"` encuentra `"Muñoz"`); orden por unidad usa la ruta; una persona con cargo desactivado sigue apareciendo con su cargo.
- [ ] **Step 2:** Implementar `filtrarDirectorio` y la vista (tabla con encabezados ordenables, filtros recordados con `guardarPreferencia`, clic abre la ficha, "Exportar esta lista a Excel" deshabilitado con tooltip "Fase 4", tabla con scroll horizontal en ventanas angostas).
- [ ] **Step 3:** Verificar que los tests pasan; verificar en la app.
- [ ] **Step 4: Commit** `feat(directorio): tabla filtrable y ordenable de personas y vacantes`

---

### Task 13: Búsqueda Ctrl+K, atajos, bienvenida y configuración

**Files:**
- Create: `src/components/PaletaComandos.vue`, `src/features/atajos/useAtajos.ts`, `src/features/atajos/atajos.test.ts`, `src/vistas/VistaBienvenida.vue`, `src/vistas/VistaConfiguracion.vue`

**Interfaces:**
- Produces: `resolverAtajo(e: { key, ctrlKey, metaKey, enCampoDeTexto: boolean }): 'paleta'|'nuevaUnidad'|'buscarLienzo'|'eliminar'|'cerrar'|'encuadrar'|null`.

- [ ] **Step 1: Tests que fallan:** `Ctrl+K` → `'paleta'` incluso dentro de un campo; `N` → `'nuevaUnidad'` y `F` → `'buscarLienzo'` solo fuera de campos de texto; `Delete` → `'eliminar'` fuera de campos; `Escape` → `'cerrar'`; `Ctrl+0` → `'encuadrar'`.
- [ ] **Step 2:** Implementar:
  - **Paleta** (`Command` de shadcn en diálogo): unidades (nombre + ruta), personas (nombre + cargo) y acciones (Nueva unidad, Ir al directorio, Cambiar tema, Configuración); elegir una unidad la selecciona y centra en el lienzo.
  - **Bienvenida:** cuatro opciones: crear organización vacía (pide nombre de la organización y de la unidad raíz), cargar desde Excel (deshabilitada, "Fase 4"), abrir `.boldo` (deshabilitada, "Fase 5") y explorar un ejemplo (`cargarEjemplo()`).
  - **Configuración:** nombre de la organización, logo (PNG/JPG/WebP hasta 1 MB → `meta.logo_png`), tema, color de acento, escala de interfaz.
  - **Configuración › Mantenedores** (`src/vistas/VistaMantenedores.vue`, ruta `/configuracion/mantenedores`): pestañas Cargos, Tipos de contrato, Sedes y Jornadas; cada una lista sus valores con el número de personas que lo usan y su estado; permite agregar (con la misma sugerencia de duplicados), renombrar en línea, subir/bajar el orden, desactivar y reactivar.
- [ ] **Step 3:** Verificar tests y en la app, solo con teclado: `Ctrl+K` → buscar una persona → abrir ficha → `Esc`.
- [ ] **Step 4: Commit** `feat: paleta de comandos, atajos, bienvenida y configuración`

---

### Task 14: Verificación de la fase

**Files:**
- Create: `scripts/sembrar-grande.mjs` (solo desarrollo: crea en una base portable de prueba 2.000 unidades y 10.000 personas con `node:sqlite`)
- Modify: `docs/superpowers/notas/2026-10-28-prueba-rendimiento.md` (segunda medición)

- [ ] **Step 1:** Medir con el nodo real: base de 2.000 unidades **todas expandidas**, arrastre del lienzo ≥ 30 FPS y layout < 2 s (misma técnica de la nota: depuración remota de WebView2 en un build de verificación). Si no cumple: detener e informar al autor (alternativas de la nota).
- [ ] **Step 2:** Capturas reales en tema claro y oscuro de: bienvenida, árbol con panel, ficha, directorio, paleta y configuración; revisar contraste AA del texto sobre el acento con `contraste()`.
- [ ] **Step 3:** Recorrido solo con teclado de todas las vistas (foco visible en cada control).
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm run test && cargo test --manifest-path src-tauri/Cargo.toml && npm run release` → todo verde y release en `release/<versión>/`.
- [ ] **Step 5: Commit** `test: verificación de rendimiento y accesibilidad de la fase 2`

---

### Task 15: Sitio web bilingüe (adelanto de la Fase 6)

Pedido del autor: página de GitHub al cerrar la Fase 2, en español e inglés, con presentación, descarga y Ayuda.

- `site/` con VitePress (`locales` es/en), que publica las páginas de `ayuda/es` y `ayuda/en` como manual (sin duplicar contenido), una portada con capturas reales de la Fase 2 (tomadas en la Task 14), la página de descargas con los enlaces estables de `releases/latest/download/<archivo>`, requisitos, aviso de SmartScreen, verificación SHA256 y cómo actualizar.
- `.github/workflows/pages.yml` (spec §14): construye y publica en GitHub Pages en push a `main` con cambios en `site/` o `ayuda/`, y al publicar un release.
- Verificación: `npm run build` dentro de `site/` sin enlaces rotos (VitePress falla con enlaces muertos); ambos idiomas navegables en `npx vitepress preview`.
- Requiere que el autor active *Settings → Pages → Source: GitHub Actions*.
- Commit: `feat(site): sitio bilingüe con presentación, descargas y ayuda`

### Task 16: Buscar actualizaciones (spec §12 "Actualizar")

- `tauri-plugin-updater` + manifiesto `latest.json` firmado generado por `scripts/release.mjs` (también en local con `npm run release`, si hay clave) y subido al Release; clave pública en `tauri.conf.json`.
- Botón "Buscar actualizaciones" en Acerca de; nada se consulta sin que el usuario lo pida.
- Portable: renombrar `BoldoAtlas.exe` en uso → `BoldoAtlas.old.exe`, escribir el nuevo, pedir reinicio, borrar el `.old` en el siguiente arranque, restaurar si falla. Instalado: instalador NSIS.
- Tests: comparación de versiones SemVer (`esMasNueva('0.2.0', '0.1.0')`, pre-release menor que final, `dev` nunca ofrece bajar de versión) y el reemplazo del `.exe` en Rust sobre una carpeta temporal (renombra, escribe, restaura si falla la escritura).
- Requiere del autor: generar la clave con `npx tauri signer generate` y guardarla como secreto `TAURI_SIGNING_PRIVATE_KEY` (y su contraseña) en GitHub; sin eso el release no firma y el botón informa que la versión no admite actualización automática.
- Commit: `feat: buscar actualizaciones bajo demanda con descarga firmada`

## Cobertura de la spec en esta fase

| Spec | Task |
|---|---|
| §5 unidades, jefaturas, conexiones, etiquetas, trabajadores, vacantes y mantenedores | 2, 5, 11, 13 |
| §7 estructura, bienvenida, guardado automático, deshacer, paleta, atajos, accesibilidad | 8, 10, 11, 13, 14 |
| §8 árbol, filtros, panel de unidad, ficha, directorio | 9, 10, 11, 12 |
| §8 administrador de árboles y subárboles (pedido del autor) | 9, 9b, 10 |
| §13 tema, acento, logo, nombre de la organización | 6, 13 |
| Nota de rendimiento (ramas colapsadas, sin solo-visibles, nueva medición) | 7, 9, 14 |

Quedan para fases siguientes: indicadores completos y pestaña Procesos (3), exportaciones y carga masiva (4), `.boldo`/fusión/escenarios (5), sitio (6).

---

## Anexo (pedido del autor): puestos, asignaciones, reemplazos e historial (spec §5 "Puestos y asignaciones")

Se ejecutan después de la Task 11 y antes de la Task 10. Las tareas 10 y 12 usan este modelo (pestaña **Puestos** en el panel; el directorio lista personas con sus puestos vigentes y los puestos vacantes).

### Task 11b: Modelo de datos de puestos y asignaciones
- `0001_inicial.sql` (aún no publicada): tablas `puestos` y `asignaciones` según la spec (FK diferidas con índice, únicos parciales de titular y reemplazo vigentes, CHECK de fechas); `trabajadores` sin `estado`, `cargo_id` ni `unidad_id` y con `nombre` NOT NULL; `unidades.jefe_puesto_id` en lugar de `jefe_id`. Tests de esquema (titular vigente duplicado → UNIQUE; `hasta < desde` → CHECK; un titular cerrado y uno vigente conviven).
- Repos `puestos.ts` (crear, editar, eliminar/restaurar) y `asignaciones.ts` (`asignarTitular(puestoId, trabajadorId, desde)` cierra la titular vigente en el mismo lote; `registrarReemplazo(puestoId, trabajadorId, desde, hasta?)`; `terminarAsignacion(id, hasta, motivo?)`); `traducirError` con los textos reales de SQLite (probados contra SQLite real).
- Jerarquía: `dotacion`/`dotacionPorUnidad` cuentan puestos con titular vigente; vacantes = puestos sin titular vigente; `jefeVisible(unidad)` = titular o, si no, reemplazo del puesto de jefatura; `unidadesDePersona(trabajadorId)`.
- Store: estado `puestos`, `asignaciones`; acciones con el contrato `{ ok, mensaje }`; `eliminarUnidad` mueve también sus puestos al superior; `cargarEjemplo` con puestos, un reemplazo vigente y un historial de al menos dos titulares.
- Migrar los usos existentes de `cargo_id`/`unidad_id`/`estado`/`jefe_id` de trabajadores en código y tests (store, jerarquía, lienzo, ficha de la Task 11) sin cambiar comportamientos ya aprobados salvo los que el modelo exige.
- Commit: `feat(db): puestos y asignaciones con reemplazos e historial`

### Task 11e (pedido del autor): tipos de unidad configurables (spec §5 `tipos_unidad`)
Va después de la 11b y antes de la 11c: el panel Vista, las marcas, el directorio y la ficha ya nacen sobre tipos flexibles.
- Esquema (misma migración no publicada): tabla `tipos_unidad` (`nombre` NOT NULL, `orden` INTEGER NOT NULL DEFAULT 0 + comunes; único parcial `lower(trim(nombre))`), sembrada con Gerencia, Área, Subárea y Otra con ids fijos exportados como constantes; `unidades.tipo` (CHECK fijo) → `unidades.tipo_id` NOT NULL FK diferida con índice. Tests de esquema (tipo inexistente → FK; nombre duplicado sin importar mayúsculas → UNIQUE).
- Catálogo: `tipos_unidad` se suma a `TablaCatalogo`/`TABLAS_CATALOGO` y reutiliza `crearValor`/`renombrarValor`/orden/desactivar y la sugerencia de duplicados; el store lo carga como los demás. Mantenedor: pestaña **Tipos de unidad** (la vista de Mantenedores llega en T13; si aún no existe, solo el catálogo y el store).
- Jerarquía: `tipoHijo(tipos, tipoPadreId)` = siguiente tipo activo por `orden` (el último se repite); `gerenciaYArea` → `rutaPorTipo(unidades, tipos, unidadId): { tipo: ValorCatalogo, unidad: Unidad }[]` (para cada tipo, la unidad más cercana hacia arriba de ese tipo, en orden del catálogo); `marcaHeredada(…, nivel: tipoId | 'cualquiera')`. Tests con un tipo agregado ("Superintendencia" entre Gerencia y Área) y con uno renombrado.
- Migrar los usos de `tipo`/`gerenciaYArea` y de los literales 'gerencia'/'area'/'subarea'/'otra' (lienzo: chip de tipo con el nombre del catálogo; "+" sugiere `tipoHijo`; ficha y directorio: columnas por tipo en uso; datos de ejemplo con una Superintendencia). Sin literales de tipo en el código fuera de las semillas.
- i18n es/en (la pestaña y los textos; los nombres de tipos son datos); ayuda: mencionar los tipos en `arbol.md`.
- Commit: `feat: tipos de unidad configurables`

### Task 11c: Pantallas de puestos, reemplazos e historial
- Tarjeta del lienzo: jefe visible (titular o "reemplazo: <nombre>"), dotación y vacantes con el nuevo cálculo.
- Ficha de la persona (Task 11): sus puestos vigentes (titular/reemplazo) e historial; ya no edita cargo ni unidad (eso es del puesto).
- Diálogo de puesto: cargo (mantenedor), titular vigente, reemplazo vigente, historial ordenado por fecha, y las acciones "Asignar titular", "Registrar reemplazo" y "Terminar asignación" con fecha y motivo.
- i18n es/en y página de ayuda `ayuda/{es,en}/puestos.md`.
- Commit: `feat: puestos con titular, reemplazo e historial en el árbol y la ficha`

### Task 11c (ampliación, pedido del autor): puestos visibles en el árbol
- Interruptor **"Ver puestos"** en la barra del lienzo (apagado por defecto, preferencia por PC): bajo cada unidad visible se dibujan tarjetas de sus puestos (cargo, titular o "Vacante", "Reemplazo: <persona>" si hay), como hijos de la unidad en el layout. Medir en Task 14 con puestos visibles.

### Task 11d: Leyendas y colores de puestos
- Tabla `leyendas` (`nombre` NOT NULL, `color` NOT NULL hex, `descripcion` NULL, `orden` + comunes; único parcial por `lower(trim(nombre))`) y `puestos.leyenda_id` NULL → `leyendas.id` (FK diferida con índice). Dato de la organización: viaja en el `.boldo`.
- En el puesto: elegir entrada de leyenda, "Copiar estilo" y "Pegar estilo" (asigna la misma entrada), "Quitar estilo". La tarjeta del puesto usa el color (borde y franja; texto con contraste AA vía `textoSobre`).
- Leyenda flotante en el lienzo con las entradas en uso (ocultable); mantenedor de leyendas en Configuración › Mantenedores (crear, renombrar, color, descripción, orden, desactivar).
- i18n es/en; ayuda `ayuda/{es,en}/leyendas.md`.
- Para la Fase 4 (capturas/PDF): opciones **colores personalizados | estándar** y **con | sin leyenda**.
- Commit: `feat: leyendas y colores de puestos con copiar estilo`

### Task 11c (ampliación 2, pedido del autor): opciones de vista y marcas de gerencia/área
- Esquema (en T11b, misma migración no publicada): `unidades.marca_color` NULL (hex) y `unidades.marca_codigo` NULL (CHECK largo ≤ 4), editables en el panel de unidad (T10).
- Pura y testeada: `marcaHeredada(unidades, unidadId, nivel: 'gerencia'|'area'|'cualquiera')` → la marca de la unidad más cercana hacia arriba que la tenga (según el nivel elegido).
- (Tras la 11e: los niveles son los tipos del catálogo, no 'gerencia'/'area' fijos.)
- Panel **"Vista"** en la barra del lienzo (preferencias por PC): mostrar/ocultar puestos, cargo, persona y la ruta por tipo (elegir qué tipos) en las tarjetas; selector **"Colorear por"**: ninguno | marca de <cada tipo en uso> | leyenda del puesto (un solo criterio a la vez); la leyenda flotante muestra las entradas del criterio activo que están en uso (color + código + nombre).
- Las mismas opciones se ofrecen al exportar (Fase 4).
