# BoldoAtlas — Fase 1: Fundaciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar una app Tauri que abre, crea su base SQLite con el esquema completo (portable o instalada), muestra su versión generada desde git en "Acerca de", y se compila y publica sola en GitHub Releases.

**Architecture:** Vue 3 + TS en el frontend; Rust solo resuelve rutas y expone SQLite (`rusqlite`) con 3 comandos: `info_app`, `db_consultar`, `db_lote`. El esquema vive en un único archivo SQL que usan tanto Rust (migración) como Vitest (pruebas de restricciones con `node:sqlite`). La versión sale de `git describe` vía `scripts/version.mjs`.

**Tech Stack:** Tauri 2, Vue 3, TypeScript strict, Vite, Vue Router, Pinia, Tailwind CSS v4, shadcn-vue, Lucide, Vitest, rusqlite (bundled), uuid (v7), Vue Flow + elkjs (solo prueba de rendimiento), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md`

**Fases siguientes (planes aparte, en este orden):** 2 Núcleo (precedida por maquetas de UX), 3 Procesos e indicadores, 4 Exportaciones y carga masiva, 5 `.boldo`/fusión/escenarios, 6 Sitio VitePress.

## Global Constraints

- Plataforma objetivo: solo Windows x64 (runner `windows-latest`); WebView2 requerido.
- Node en CI: 24 (LTS). Local disponible: Node 26, Rust 1.99.
- TypeScript `strict: true`; ESLint + Prettier; ningún componente ni store escribe SQL (solo `src/db/`).
- Consultas siempre parametrizadas (`?`), nunca texto concatenado.
- Identificador Tauri: `io.github.mscottb.boldoatlas`; nombre de producto `BoldoAtlas`; ventana mínima 1024×700.
- Versión: etiqueta git `vX.Y.Z` es la única fuente; fecha `DDMMAAAA` en zona `America/Santiago`.
- Archivos del Release: `BoldoAtlas_windows_x64_portable.zip`, `BoldoAtlas_windows_x64_setup.exe`, `SHA256SUMS.txt`.
- Portable: existe `portable.flag` junto al `.exe` → datos en `<dir exe>/datos/`; si no → `%APPDATA%/io.github.mscottb.boldoatlas/`. Subcarpetas `respaldos/` y `escenarios/`.
- Toda tabla de negocio: `id TEXT PK` (UUID v7), `created_at`, `updated_at` (ISO-8601 UTC, NOT NULL), `deleted_at` NULL; índices únicos parciales `WHERE deleted_at IS NULL`; FKs `DEFERRABLE INITIALLY DEFERRED`.
- Al abrir la BD: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`.
- Paleta de marca: azul marino `#1E2A38`, cobre `#C8743F`. Fuente Inter, iconos Lucide.
- Textos de interfaz en español. Licencia AGPL-3.0.
- Commits: Conventional Commits. No hacer `git push` ni crear etiquetas sin pedírselo al autor.

## Review Focus

1. **Carpeta de datos sin permiso de escritura** (exe abierto desde dentro del zip, carpeta de solo lectura): la app debe mostrar un mensaje claro con la ruta y cómo resolverlo, no cerrarse. → Test en Task 4 (`dir_datos_falla_con_mensaje`) y pantalla de error en Task 5.
2. **Compilar sin etiquetas o sin git** (clon superficial, código descargado como zip): la versión debe caer a `0.0.0-dev.N` o `0.0.0-dev.0+fecha`, nunca romper el build. → Tests en Task 2.
3. **Abrir una base creada por una versión más nueva** (`user_version` mayor al conocido): rechazar con mensaje, sin tocar el archivo. → Test en Task 4 (`migrar_rechaza_esquema_futuro`).
4. **Rutas con espacios y tildes** (`C:\Users\José Pérez\…`): la base debe abrirse y migrar igual. → Test en Task 4 (`abre_en_ruta_con_espacios_y_tildes`).
5. **Dos instancias de la app sobre la misma base** (doble clic dos veces): ambas escrituras deben completarse sin "database is locked" ni corrupción. → Test en Task 4 (`dos_conexiones_escriben_sin_bloqueo`).

---

### Task 1: Scaffold de la app

**Files:**
- Create: proyecto completo vía `create-tauri-app` (plantilla `vue-ts`) en la raíz del repo, conservando `docs/` y `assets/`.
- Create: `LICENSE` (texto oficial AGPL-3.0 de gnu.org), `.gitignore` (node_modules, dist, src-tauri/target, `datos/`), `.prettierrc`, `eslint.config.js`, `vitest.config.ts`.
- Create: `src/styles/main.css` (Tailwind v4 + tokens de marca), `src/router.ts`, `src/App.vue` (layout), `src/vistas/VistaArbol.vue` (estado vacío).
- Modify: `src-tauri/tauri.conf.json`, `package.json`.

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `tauri`, `lint`, `typecheck` (`vue-tsc --noEmit`), `test` (`vitest run`); alias `@` → `src/`; router con rutas `/` (Árbol) y `/acerca` (se agrega en Task 5).

- [ ] **Step 1: Generar el proyecto**

Run: `npm create tauri-app@latest -- --template vue-ts --manager npm --identifier io.github.mscottb.boldoatlas` en una carpeta temporal y mover el contenido a la raíz (el repo ya tiene `docs/`, `assets/` y un commit). Nombre de paquete `boldo-atlas`.

- [ ] **Step 2: Configurar Tauri**

En `tauri.conf.json`: `productName: "BoldoAtlas"`, `identifier: "io.github.mscottb.boldoatlas"`, ventana `title: "BoldoAtlas"`, `width: 1280`, `height: 800`, `minWidth: 1024`, `minHeight: 700`; `bundle.targets: ["nsis"]`.

- [ ] **Step 3: Instalar UI y herramientas**

Run: `npm i vue-router pinia lucide-vue-next` y `npm i -D tailwindcss @tailwindcss/vite vitest eslint prettier typescript-eslint eslint-plugin-vue @vue/eslint-config-typescript @vue/eslint-config-prettier vue-tsc @types/node`.
Run: `npx shadcn-vue@latest init` (estilo por defecto, color base neutral, CSS en `src/styles/main.css`).

- [ ] **Step 4: Tokens de marca y layout**

En `src/styles/main.css`: importar Inter (`@fontsource-variable/inter`, `npm i @fontsource-variable/inter`), definir en `:root` y `.dark` las variables de shadcn con `--primary` = `#1E2A38` (claro) / `#E6EBF1` (oscuro) y `--accent` = `#C8743F` en ambos. `App.vue`: barra lateral izquierda con enlaces "Árbol" y "Acerca de" (iconos Lucide `Network`, `Info`) y `<RouterView/>` al centro. `VistaArbol.vue`: estado vacío "Aún no hay unidades".

- [ ] **Step 5: Verificar**

Run: `npm run lint && npm run typecheck && npm run test -- --passWithNoTests`
Expected: sin errores.
Run: `npm run tauri dev`
Expected: abre ventana "BoldoAtlas" con barra lateral y el estado vacío; no se puede achicar bajo 1024×700.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + Vue 3 + Tailwind v4 + shadcn-vue"
```

---

### Task 2: Versión desde git

**Files:**
- Create: `scripts/version.mjs`, `scripts/version.test.ts`, `src/env.d.ts` (declaraciones)
- Modify: `vite.config.ts`, `vitest.config.ts` (incluir `scripts/**/*.test.ts`)

**Interfaces:**
- Produces (exportados desde `scripts/version.mjs`, JS con JSDoc):
  - `parsearDescribe(salida: string): { tag: string | null, distancia: number, sha: string, sucio: boolean }` — entrada tipo `v1.2.0-5-g3f2a1bc-dirty`.
  - `fechaDDMMAAAA(fecha: Date, zona = 'America/Santiago'): string`
  - `formatearVersion({ tag, distancia, sha, sucio, fecha }): { completa: string, base: string, numerica: string }` — `base` = tag sin `v` (o `0.0.0`); `numerica` = solo `X.Y.Z`.
  - `obtenerVersion(cwd?: string): { completa, base, numerica, fecha, commit }` — corre git; nunca lanza.
  - CLI: `node scripts/version.mjs` imprime JSON; `--aplicar` escribe `numerica` en `package.json` y `src-tauri/tauri.conf.json`.
- Produces (constantes globales Vite): `__APP_VERSION__` (completa), `__APP_VERSION_CORTA__` (base), `__APP_FECHA__` (DDMMAAAA), `__APP_COMMIT__` (sha o `""`).

- [ ] **Step 1: Escribir tests que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { parsearDescribe, fechaDDMMAAAA, formatearVersion } from './version.mjs'

const f = '28102026'
describe('formatearVersion', () => {
  it('en etiqueta exacta', () =>
    expect(formatearVersion({ tag: 'v1.2.0', distancia: 0, sha: '3f2a1bc', sucio: false, fecha: f }).completa).toBe('1.2.0+28102026'))
  it('commits después', () =>
    expect(formatearVersion({ tag: 'v1.2.0', distancia: 5, sha: '3f2a1bc', sucio: false, fecha: f }).completa).toBe('1.2.0-dev.5+28102026.3f2a1bc'))
  it('sucio', () =>
    expect(formatearVersion({ tag: 'v1.2.0', distancia: 5, sha: '3f2a1bc', sucio: true, fecha: f }).completa).toBe('1.2.0-dev.5+28102026.3f2a1bc.sucio'))
  it('sucio en etiqueta exacta', () =>
    expect(formatearVersion({ tag: 'v1.2.0', distancia: 0, sha: '3f2a1bc', sucio: true, fecha: f }).completa).toBe('1.2.0+28102026.3f2a1bc.sucio'))
  it('sin etiquetas', () =>
    expect(formatearVersion({ tag: null, distancia: 12, sha: '3f2a1bc', sucio: false, fecha: f }).completa).toBe('0.0.0-dev.12+28102026.3f2a1bc'))
  it('sin git', () =>
    expect(formatearVersion({ tag: null, distancia: 0, sha: '', sucio: false, fecha: f }).completa).toBe('0.0.0-dev.0+28102026'))
  it('pre-release con commits después', () =>
    expect(formatearVersion({ tag: 'v1.3.0-beta.1', distancia: 2, sha: 'abc1234', sucio: false, fecha: f }).completa).toBe('1.3.0-beta.1.dev.2+28102026.abc1234'))
  it('numerica descarta pre-release', () =>
    expect(formatearVersion({ tag: 'v1.3.0-beta.1', distancia: 0, sha: '', sucio: false, fecha: f }).numerica).toBe('1.3.0'))
})

describe('fechaDDMMAAAA', () => {
  it('rellena con ceros', () => expect(fechaDDMMAAAA(new Date('2026-03-05T15:00:00Z'))).toBe('05032026'))
  it('usa la hora de Chile, no UTC', () => expect(fechaDDMMAAAA(new Date('2026-10-29T02:00:00Z'))).toBe('28102026'))
})

describe('parsearDescribe', () => {
  it('lee etiqueta, distancia, sha y sucio', () =>
    expect(parsearDescribe('v1.2.0-5-g3f2a1bc-dirty')).toEqual({ tag: 'v1.2.0', distancia: 5, sha: '3f2a1bc', sucio: true }))
  it('acepta etiquetas con guiones', () =>
    expect(parsearDescribe('v1.3.0-beta.1-0-gabc1234')).toEqual({ tag: 'v1.3.0-beta.1', distancia: 0, sha: 'abc1234', sucio: false }))
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run scripts/version.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `scripts/version.mjs`**

`parsearDescribe`: regex anclada al final `/^(.*)-(\d+)-g([0-9a-f]+)(-dirty)?$/`. `fechaDDMMAAAA`: `Intl.DateTimeFormat('es-CL', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts`. `obtenerVersion`: `execFileSync('git', ['describe','--tags','--long','--match','v*'])` (sin `--dirty`); si falla, `git rev-list --count HEAD` y `git rev-parse --short=7 HEAD`; si git no existe, `distancia 0, sha ''`. `sucio` se calcula aparte con `git status --porcelain --untracked-files=no -- . ":(exclude)package.json" ":(exclude)src-tauri/tauri.conf.json"`, porque `--aplicar` modifica esos dos archivos en el release y no debe marcar la versión publicada como `.sucio`. Reglas de `formatearVersion`:
- pre-release: si `distancia > 0` se agrega `dev.N` con separador `-` (o `.` si `base` ya tiene `-`).
- metadatos: `fecha`, luego `.sha` si `sha` y (`distancia > 0` o `sucio`), luego `.sucio` si `sucio`.

- [ ] **Step 4: Conectar con Vite**

En `vite.config.ts` llamar `obtenerVersion()` y pasar las 4 constantes en `define` con `JSON.stringify`. Declararlas en `src/env.d.ts` como `declare const __APP_VERSION__: string` (etc.). Mismo `define` en `vitest.config.ts`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run scripts/version.test.ts` → PASS.
Run: `node scripts/version.mjs` → JSON con `completa` del tipo `0.0.0-dev.N+DDMMAAAA.<sha>` (el repo aún no tiene etiquetas).

- [ ] **Step 6: Commit**

```bash
git add scripts src/env.d.ts vite.config.ts vitest.config.ts
git commit -m "feat: versión SemVer desde git con fecha DDMMAAAA"
```

---

### Task 3: Esquema SQL y pruebas de restricciones

**Files:**
- Create: `src-tauri/migrations/0001_inicial.sql`
- Test: `src/db/esquema.test.ts` (usa `node:sqlite`, sin dependencias nuevas)

**Interfaces:**
- Produces: el archivo SQL (lo incluye Rust en Task 4 con `include_str!`). Tablas: `meta`, `unidades`, `conexiones`, `etiquetas`, `unidad_etiquetas`, `procesos`, `actividades`, `actividad_roles`, `trabajadores`.

- [ ] **Step 1: Escribir tests que fallan**

Helper del test: abre `new DatabaseSync(':memory:')`, `exec('PRAGMA foreign_keys=ON')`, ejecuta el SQL del archivo, y `ins(tabla, fila)` que completa `id` (`crypto.randomUUID()`), `created_at`, `updated_at`.

```ts
it('rechaza vacante sin cargo', () => expect(() => ins('trabajadores', { estado: 'vacante', unidad_id: u })).toThrow(/CHECK/))
it('rechaza activo sin nombre', () => expect(() => ins('trabajadores', { estado: 'activo', unidad_id: u })).toThrow(/CHECK/))
it('acepta vacante con cargo y sin nombre', () => expect(() => ins('trabajadores', { estado: 'vacante', cargo: 'Analista', unidad_id: u })).not.toThrow())
it('rechaza tipo de unidad inválido', () => expect(() => ins('unidades', { tipo: 'gerncia', nombre: 'X' })).toThrow(/CHECK/))
it('rechaza correo duplicado sin importar mayúsculas ni espacios', () => {
  ins('trabajadores', { nombre: 'A', correo: 'ana@x.cl', unidad_id: u })
  expect(() => ins('trabajadores', { nombre: 'B', correo: ' ANA@x.cl ', unidad_id: u })).toThrow(/UNIQUE/)
})
it('permite reutilizar el correo de un trabajador borrado', () => { /* primero con deleted_at, luego activo → no lanza */ })
it('rechaza dos aprobadores en la misma actividad', () => { /* dos actividad_roles rol 'A' misma actividad → UNIQUE */ })
it('rechaza dos roles para la misma persona en una actividad', () => { /* 'R' y 'C' mismo trabajador → UNIQUE */ })
it('rechaza conexión de una unidad consigo misma', () => expect(() => ins('conexiones', { origen_id: u, destino_id: u })).toThrow(/CHECK/))
it('FK diferida: permite insertar hijo antes que padre dentro de una transacción', () => {
  /* BEGIN; insertar trabajador con unidad_id = idNuevo; insertar unidad idNuevo; COMMIT → no lanza */
})
it('FK diferida: falla al confirmar si el padre no existe', () => {
  /* BEGIN; insertar trabajador con unidad_id inexistente; COMMIT → lanza /FOREIGN KEY/ */
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/db/esquema.test.ts` → FAIL (archivo SQL no existe).

- [ ] **Step 3: Escribir `0001_inicial.sql`**

Columnas y reglas exactamente como la spec sección 5. Las expresiones no obvias:

```sql
-- trabajadores
estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','vacante')),
CHECK (estado = 'vacante' OR length(trim(coalesce(nombre,''))) > 0),
CHECK (estado = 'activo'  OR length(trim(coalesce(cargo,'')))  > 0),
CREATE UNIQUE INDEX ux_trabajadores_correo ON trabajadores(lower(trim(correo)))
  WHERE correo IS NOT NULL AND deleted_at IS NULL;
-- actividad_roles
CREATE UNIQUE INDEX ux_roles_persona   ON actividad_roles(actividad_id, trabajador_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_roles_aprobador ON actividad_roles(actividad_id) WHERE rol = 'A' AND deleted_at IS NULL;
-- etiquetas
CREATE UNIQUE INDEX ux_etiquetas_nombre ON etiquetas(lower(trim(nombre))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_unidad_etiquetas ON unidad_etiquetas(unidad_id, etiqueta_id) WHERE deleted_at IS NULL;
-- toda FK:  REFERENCES <tabla>(id) DEFERRABLE INITIALLY DEFERRED  + CREATE INDEX idx_<tabla>_<col>
```

`meta(clave TEXT PRIMARY KEY, valor TEXT)`. El archivo no fija `PRAGMA user_version` (lo hace Rust).

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/db/esquema.test.ts` → PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations src/db/esquema.test.ts
git commit -m "feat(db): esquema inicial con restricciones e índices"
```

---

### Task 4: Rutas y puente SQLite en Rust

**Files:**
- Create: `src-tauri/src/rutas.rs`, `src-tauri/src/db.rs`, `src-tauri/src/comandos.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- Test: módulos `#[cfg(test)]` en `rutas.rs` y `db.rs` (crate `tempfile` como dev-dependency)

**Interfaces:**
- Consumes: `migrations/0001_inicial.sql` (Task 3).
- Produces (Rust):
  - `rutas::dir_datos(exe_dir: &Path, appdata: Option<&Path>) -> Result<Rutas, String>`; `Rutas { datos, bd, respaldos, escenarios: PathBuf, portable: bool }`. Crea las carpetas y prueba escribir un archivo temporal.
  - `db::abrir(ruta: &Path) -> Result<Connection, String>` (pragmas de Global Constraints).
  - `db::migrar(conn: &mut Connection, dir_respaldos: &Path) -> Result<i64, String>` — aplica `MIGRACIONES: &[&str]` según `user_version`; si la base ya tenía datos y va a migrar, primero `VACUUM INTO respaldos/antes-migracion-<v>-<AAAAMMDDhhmmss>.boldo`.
  - `db::asegurar_meta(conn: &Connection) -> Result<(), String>` — inserta si faltan `db_id` (UUID v7), `db_creada` (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`), `data_revision` = `'0'`.
  - `db::consultar(conn, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String>`
  - `db::lote(conn, sentencias: &[Sentencia], version_app: &str) -> Result<(), String>`; `Sentencia { sql: String, params: Vec<Value> }`. Todo en una transacción; dentro de ella `data_revision += 1` y `app_version_ultima = version_app`.
- Produces (comandos Tauri, nombres de campos en camelCase hacia JS):
  - `info_app() -> InfoApp { dirDatos, rutaBd, portable, versionEsquema, error: Option<String> }`
  - `db_consultar(sql: String, params: Vec<Value>) -> Result<Vec<Map>, String>`
  - `db_lote(sentencias: Vec<Sentencia>, versionApp: String) -> Result<(), String>`

- [ ] **Step 1: Dependencias**

Run (en `src-tauri/`): `cargo add rusqlite --features bundled,serde_json` · `cargo add uuid --features v7` · `cargo add serde --features derive` · `cargo add serde_json` · `cargo add --dev tempfile`.

- [ ] **Step 2: Escribir tests que fallan**

En `rutas.rs`:
- `dir_datos_portable_usa_carpeta_del_exe` — con `portable.flag` en `exe_dir` → `datos == exe_dir/datos`, `portable == true`, existen `respaldos/` y `escenarios/`.
- `dir_datos_instalado_usa_appdata` — sin flag → `appdata/io.github.mscottb.boldoatlas`.
- `dir_datos_falla_con_mensaje` — `exe_dir/datos` existe como **archivo** → `Err` que contiene la ruta y la frase `"extráelo primero a una carpeta"`.

En `db.rs`:
- `migrar_base_nueva_deja_version_1` — `user_version == 1`; segunda llamada no cambia nada.
- `migrar_rechaza_esquema_futuro` — `PRAGMA user_version = 99` → `Err` que contiene `"versión más nueva de BoldoAtlas"`; el archivo no cambia.
- `migrar_respalda_antes_de_actualizar` — base con `user_version = 1` y `MIGRACIONES` de prueba de largo 2 → existe un `.boldo` en `respaldos/`. (Exponer `migrar_con(conn, migraciones, dir)` para el test.)
- `lote_es_atomico` — 2 sentencias, la segunda inválida → `Err`, la primera no quedó, `data_revision` sin cambio.
- `lote_suma_una_revision_por_transaccion` — 3 sentencias válidas → `data_revision` sube exactamente 1 y `app_version_ultima` = el valor pasado.
- `consultar_devuelve_filas_como_objetos` — `SELECT 1 AS a, 'x' AS b` → `[{"a":1,"b":"x"}]`; `NULL` → `Value::Null`.
- `abre_en_ruta_con_espacios_y_tildes` — carpeta temporal `José Pérez/datos con espacio` → abrir + migrar OK.
- `dos_conexiones_escriben_sin_bloqueo` — dos `abrir` sobre el mismo archivo, cada una en un hilo hace 50 `lote` → ambos `Ok`, `data_revision == 100`.

- [ ] **Step 3: Verificar que fallan**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → FAIL (funciones no existen).

- [ ] **Step 4: Implementar**

`dir_datos`: el identificador es la constante `"io.github.mscottb.boldoatlas"`. Conversión `serde_json::Value` ↔ SQLite con la feature `serde_json` de rusqlite (números enteros como `i64`, reales como `f64`, `bool` como 0/1). `lote` usa `BEGIN IMMEDIATE` (toma el bloqueo de escritura al inicio, así `busy_timeout` espera en vez de fallar). `lib.rs`: en `setup`, `std::env::current_exe()` → `parent()`, `std::env::var_os("APPDATA")`; si `dir_datos`/`abrir`/`migrar` fallan, guardar el error en el estado y **no** cerrar la app (`info_app` lo devuelve). Estado: `Mutex<Option<Connection>>`.

- [ ] **Step 5: Verificar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (12 tests).
Run: `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` → sin avisos.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat(db): rutas portable/instalada y puente SQLite con migraciones"
```

---

### Task 5: Cliente de BD, pantalla de error y "Acerca de"

**Files:**
- Create: `src/db/cliente.ts`, `src/app/about.ts`, `src/app/version.ts`, `src/app/version.test.ts`, `src/vistas/VistaAcerca.vue`, `src/vistas/PantallaError.vue`
- Modify: `src/App.vue`, `src/router.ts`, `src/main.ts`

**Interfaces:**
- Consumes: comandos de Task 4; constantes de Task 2.
- Produces:
  - `src/db/cliente.ts`: `infoApp(): Promise<InfoApp>`, `consultar<T>(sql: string, params?: unknown[]): Promise<T[]>`, `lote(sentencias: { sql: string; params?: unknown[] }[]): Promise<void>` (envía `__APP_VERSION__` como `versionApp`), `leerMeta(): Promise<Record<string, string>>`.
  - `src/app/about.ts`: `AUTOR = { nombre: 'Michael Jim Scott Bravo', enlace: 'https://github.com/MscottB' }`, `REPO = 'https://github.com/MscottB/BoldoAtlas'`, `LICENCIA = { nombre: 'AGPL-3.0', enlace: 'https://www.gnu.org/licenses/agpl-3.0.html' }`.
  - `src/app/version.ts`: `versionVisible(): string` → `"Versión 1.2.0 · 28102026"` (usa `__APP_VERSION_CORTA__` y `__APP_FECHA__`); `infoParaCopiar(info: InfoApp, meta: Record<string,string>): string` — líneas `BoldoAtlas <completa>`, `Commit <sha>`, `Esquema <n>`, `Base <db_id> · revisión <r> · creada <fecha>`, `Modo portable|instalado`.

- [ ] **Step 1: Tests que fallan** (`src/app/version.test.ts`, con las constantes definidas en `vitest.config.ts`)

```ts
it('versionVisible usa base y fecha', () => expect(versionVisible()).toMatch(/^Versión \d+\.\d+\.\d+.* · \d{8}$/))
it('infoParaCopiar incluye versión completa, esquema, base y modo', () => {
  const t = infoParaCopiar(
    { dirDatos: 'C:/x', rutaBd: 'C:/x/boldo.db', portable: true, versionEsquema: 1, error: null },
    { db_id: 'abc', data_revision: '7', db_creada: '2026-10-28T10:00:00.000Z' })
  expect(t).toContain(__APP_VERSION__); expect(t).toContain('Esquema 1')
  expect(t).toContain('Base abc · revisión 7'); expect(t).toContain('Modo portable')
})
```

- [ ] **Step 2: Verificar que fallan** — Run: `npx vitest run src/app` → FAIL.

- [ ] **Step 3: Implementar**

`cliente.ts` con `invoke` de `@tauri-apps/api/core`. `main.ts`: antes de montar el router, `infoApp()`; si `error` ≠ null montar `PantallaError` (muestra el mensaje, la ruta y un botón "Copiar detalle"). `VistaAcerca.vue`: logo `assets/brand/logo-horizontal.webp`, `versionVisible()` grande, debajo `__APP_VERSION__` en texto pequeño seleccionable, esquema, `db_id`, revisión, fecha de creación, modo, licencia con enlace, repositorio y "Creado por Michael Jim Scott Bravo"; botón "Copiar información" (`navigator.clipboard.writeText(infoParaCopiar(...))`). Los enlaces se abren con `@tauri-apps/plugin-opener` (`npm i @tauri-apps/plugin-opener`, `cargo add tauri-plugin-opener`, registrar en `lib.rs`, permiso `opener:default`).

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/app` → PASS.
Run: `npm run tauri dev` → "Acerca de" muestra `Versión 0.0.0-dev.N · DDMMAAAA`, esquema 1, un `db_id`, revisión 0, modo instalado; existe `%APPDATA%/io.github.mscottb.boldoatlas/boldo.db`.
Manual: crear `portable.flag` junto a `src-tauri/target/debug/boldo-atlas.exe`, ejecutarlo → modo portable y `datos/boldo.db` junto al exe. Reemplazar `datos` por un archivo vacío llamado `datos` → aparece `PantallaError` con el mensaje (no se cierra).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: cliente de BD, pantalla de error y vista Acerca de con versión"
```

---

### Task 6: Prueba de rendimiento del lienzo (compuerta de decisión)

**Files:**
- Create: `src/dev/arbolFalso.ts`, `src/dev/arbolFalso.test.ts`, `src/dev/PruebaRendimiento.vue`, `docs/superpowers/notas/2026-10-28-prueba-rendimiento.md`
- Modify: `src/router.ts` (ruta `/dev/rendimiento` solo si `import.meta.env.DEV`)

**Interfaces:**
- Produces: `generarArbolFalso(n: number, hijosMax: number, semilla: number): { nodos: { id: string; padre: string | null; nombre: string }[] }` (determinista por semilla). Lo reutiliza la Fase 2 para pruebas.

- [ ] **Step 1: Test que falla**

```ts
it('genera n nodos, una sola raíz y padres existentes', () => {
  const { nodos } = generarArbolFalso(2000, 6, 1)
  expect(nodos).toHaveLength(2000)
  expect(nodos.filter(n => n.padre === null)).toHaveLength(1)
  const ids = new Set(nodos.map(n => n.id))
  expect(nodos.every(n => n.padre === null || ids.has(n.padre))).toBe(true)
})
it('es determinista', () => expect(generarArbolFalso(50, 3, 7)).toEqual(generarArbolFalso(50, 3, 7)))
```

- [ ] **Step 2: Verificar que falla** — Run: `npx vitest run src/dev` → FAIL.

- [ ] **Step 3: Implementar**

Run: `npm i @vue-flow/core @vue-flow/minimap elkjs`. `PruebaRendimiento.vue`: genera 2.000 nodos, calcula layout con `elkjs/lib/elk.bundled.js` (`elk.algorithm: 'layered'`, `elk.direction: 'DOWN'`), mide y muestra el tiempo de layout en ms, renderiza con Vue Flow `only-render-visible-elements` + minimapa, y muestra FPS medidos con `requestAnimationFrame` mientras se arrastra/hace zoom.

- [ ] **Step 4: Medir y decidir**

Run: `npx vitest run src/dev` → PASS. Run: `npm run tauri dev`, abrir `/dev/rendimiento`, probar con 2.000 y 5.000 nodos.
Criterio de aprobación (2.000 nodos): layout < 2.000 ms y desplazamiento/zoom ≥ 30 FPS.
Registrar en la nota: equipo, tiempos, FPS, veredicto. **Si no cumple, detener el plan e informar al autor** (alternativas: layout en Web Worker, o Cytoscape.js).

- [ ] **Step 5: Commit**

```bash
git add src/dev src/router.ts docs/superpowers/notas package.json package-lock.json
git commit -m "test: prueba de rendimiento del lienzo con 2.000 nodos"
```

---

### Task 7: CI/CD para Windows

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/ci-rust.yml`, `.github/workflows/release.yml`
- Create: `README.md` (qué es, enlace a descargas, aviso SmartScreen, cómo compilar, cómo publicar una versión)

**Interfaces:**
- Consumes: scripts npm de Task 1, `scripts/version.mjs --aplicar` de Task 2.
- Produces: Release con los 3 archivos de Global Constraints. (`pages.yml` llega con la Fase 6.)

- [ ] **Step 1: `ci.yml`** — `on: push (branches: main) / pull_request`, `paths-ignore: ['site/**','docs/**','**/*.md']`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`; `permissions: contents: read`; un job en `ubuntu-latest`: checkout → `setup-node` (24, `cache: npm`) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test`.

- [ ] **Step 2: `ci-rust.yml`** — mismo disparo pero `paths: ['src-tauri/**']`; job en `windows-latest`: checkout → `dtolnay/rust-toolchain@stable` (con `clippy, rustfmt`) → `Swatinem/rust-cache@v2` (`workspaces: src-tauri`) → `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test`. (Necesita `dist/` vacío para compilar: crear la carpeta antes.)

- [ ] **Step 3: `release.yml`**

```yaml
on: { push: { tags: ['v*'] } }
permissions: { contents: write }
concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # git describe necesita historia y etiquetas
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm run test
      - run: node scripts/version.mjs --aplicar
      - run: npm run tauri build -- --bundles nsis
      - name: Empaquetar
        shell: pwsh
        run: |
          New-Item -ItemType Directory salida, portable/datos | Out-Null
          Copy-Item src-tauri/target/release/boldo-atlas.exe portable/BoldoAtlas.exe
          New-Item portable/portable.flag | Out-Null
          New-Item portable/datos/.keep | Out-Null
          Compress-Archive portable/* salida/BoldoAtlas_windows_x64_portable.zip
          Copy-Item (Get-ChildItem src-tauri/target/release/bundle/nsis/*.exe | Select-Object -First 1) salida/BoldoAtlas_windows_x64_setup.exe
          Get-ChildItem salida | ForEach-Object { "{0}  {1}" -f (Get-FileHash $_ -Algorithm SHA256).Hash.ToLower(), $_.Name } | Set-Content salida/SHA256SUMS.txt -Encoding ascii
      - uses: softprops/action-gh-release@v2
        with:
          files: salida/*
          generate_release_notes: true
          prerelease: ${{ contains(github.ref_name, '-') }}
```

- [ ] **Step 4: Verificar en local lo verificable**

Run: `npm run lint && npm run typecheck && npm run test && cargo test --manifest-path src-tauri/Cargo.toml` → todo PASS.
Run: `npm run tauri build -- --bundles nsis` → existen `src-tauri/target/release/boldo-atlas.exe` y un `.exe` en `bundle/nsis/` (confirma las rutas que usa el paso Empaquetar).

- [ ] **Step 5: Commit**

```bash
git add .github README.md
git commit -m "ci: checks en ubuntu/windows y release para Windows con portable y SHA256"
```

- [ ] **Step 6: Verificación remota (con permiso del autor)**

Pedir al autor autorización para `git push origin main` y para la etiqueta de prueba `v0.1.0-beta.1` (`git tag v0.1.0-beta.1 && git push origin v0.1.0-beta.1`).
Expected: `ci` verde; `ci-rust` verde; en Releases aparece **v0.1.0-beta.1 como pre-release** con los 3 archivos. Descargar el zip en una carpeta nueva, extraer, ejecutar → "Acerca de" muestra `Versión 0.1.0-beta.1 · DDMMAAAA` y la versión completa es `0.1.0-beta.1+DDMMAAAA` (sin `.sucio` ni `dev`), modo portable, y `datos/boldo.db` se crea junto al exe.

---

## Cobertura de la spec en esta fase

| Spec | Task |
|---|---|
| §3 stack base, §4 organización y calidad | 1, 4, 5 |
| §5 modelo de datos completo (esquema) | 3, 4 |
| §6 versiones de app, esquema y datos | 2, 4, 5 |
| §12 portable/instalador | 4, 7 |
| §13 "Acerca de" | 5 |
| §14 CI/CD (ci, release) | 7 |
| §15 prueba temprana de rendimiento, tests de versión y restricciones | 2, 3, 6 |

Quedan para fases siguientes: §7–8 UI completa (2, 3), §9 `.boldo`/fusión/escenarios (5), §10 carga masiva y §11 exportaciones (4), §13 tema/acento (2), §14 sitio y `pages.yml` (6).
