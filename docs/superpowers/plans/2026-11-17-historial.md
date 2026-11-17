# Task 19c, Historial de cambios: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada acción queda en un historial dentro de la base. Ctrl+Z y Ctrl+Y deshacen y rehacen aunque se cierre la app, y una vista Historial permite deshacer una acción suelta o volver a un punto.

**Architecture:** La migración 0003 agrega `historial_acciones`, `historial_filas` y `historial_en_curso`, más triggers en cada tabla de negocio que anotan solo si hay una acción abierta. Rust (`src-tauri/src/historial.rs`) abre y cierra la acción en `db::lote`, al importar, al revisar y al suprimir, y aplica el revés o el derecho de las filas. La ventana arma las frases a partir de las filas, sin guardarlas como texto.

**Tech Stack:** Tauri 2, rusqlite (funciones JSON de SQLite), Vue 3, Pinia, vue-i18n, ExcelJS (ya instalado), Vitest en `node`, pruebas de Rust con `tempfile`.

**Spec:** `docs/superpowers/specs/2026-11-17-historial-design.md`. También la Task 19c de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md`.

## Decisiones tomadas al planificar

**[VISIBLE]** marca lo que el autor verá.

1. **Sin `tipo` en la acción.** La frase se deduce de las filas (tabla, operación, campos), así que las ~40 llamadas a `escribir` del store no cambian. Solo `origen` y `datos` se guardan.
   - `datos` solo tiene ids y conteos, salvo el nombre del archivo importado.
2. **El orden de las acciones es su `id`.** Es UUID v7, que crece con el tiempo y se ordena como texto. «Posterior» significa `id` mayor.
3. **`PRAGMA recursive_triggers = ON` en `db::abrir`.** Así un `INSERT OR REPLACE` (hay varios sobre `meta`) anota el borrado y la inserción, y deshacerlo devuelve la fila de antes. Nuestros triggers solo escriben en `historial_filas`, que no tiene triggers, así que no hay recursión.
4. **La ventana no puede escribir en `historial_*`.** `db::lote` rechaza cualquier sentencia que nombre una tabla `historial_`.
5. **Los triggers salen de un script.** `scripts/generar-historial.mjs` lee las columnas de cada tabla de una base migrada y escribe el SQL de los triggers. Una migración futura que recree una tabla lo vuelve a correr. Una prueba de Rust compara.
6. **Pila de Ctrl+Y.** `rehacible` es un número creciente:
   - deshacer le pone el siguiente número;
   - Ctrl+Y rehace la de número mayor;
   - una acción nueva con origen `app`, `importar` o `revisar` deja todos en `NULL`.
7. **Conflicto.** Se busca así:
   - acciones posteriores **hechas** con alguna `(tabla, fila_id)` en común;
   - además, se prueba aplicar dentro de la transacción: si `pragma_foreign_key_check` o `validar::hay_ciclo` fallan, las acciones posteriores hechas que tocaron las filas en falta también cuentan como conflicto.

   Rust devuelve sus ids. Ctrl+Z sobre la última hecha nunca tiene conflicto.
8. **[VISIBLE] Plazo por defecto.** Sin `meta.historial_plazo_dias` vale 365. El valor `"0"` es sin límite. Las opciones son 30, 90, 365 y 0.
9. **Una acción `suprimir`** guarda una fila de `trabajadores` con `antes = {"nombre": "<el de antes>"}` y `despues = {"nombre": "<relleno>"}`, escrita directo y no por el trigger, con `bloqueada = 1`. `reaplicar` no la duplica si ya existe una con ese id en `datos`.
10. **El nombre que se muestra** es el último `nombre` anotado en el historial para esa fila o, si no hay, el actual de su tabla.
    - Un puesto se nombra por su cargo.
    - Una asignación, por su persona.

    Lo resuelve Rust en `historial::nombre_de`.

## Global Constraints

- Texto de la app y la ayuda en español simple y directo; el inglés dice lo mismo.
- Vitest en `node`, sin DOM: componentes con `renderToString`, lógica en funciones puras.
- La app no se lanza en local. La prueba en la app real es el arnés del CI de Windows, y ningún arnés toca datos reales (comprueba `rutaBd`).
- Sin dependencias nuevas.
- El sitio no dice versiones, «próximamente» ni lo que falta.
- `graphify update .` después de cambiar código. En Bash, `git -C` y nunca `cd`.
- **PR 1** (Tasks 1 a 6, motor) y **PR 2** (Tasks 7 y 8, vista), cada uno con `version:menor`. El PR 2 sale de `main` después de fusionar el PR 1.

## Review Focus

1. **Ctrl+Z en el lugar equivocado.** Con un diálogo abierto, escribiendo en un campo, viendo una fecha o con el foco en la organización de al lado, Ctrl+Z no hace nada. Prueba en la Task 5.
2. **Deshacer que choca con un correo repetido o un ciclo.** No cambia nada y dice por qué. Prueba en la Task 2.
3. **Restaurar un respaldo de antes de una supresión.** Al terminar, `reaplicar` vuelve a limpiar el historial de esa persona. Prueba en la Task 3.
4. **Un `.boldo` de una versión anterior (esquema 2)** se importa como hoy. **Uno con filas de historial** se rechaza. Prueba en la Task 4.
5. **Un deshacer mientras hay un lote en cola.** El deshacer va por la misma cola que `lote()`, así no se adelanta a un cambio que el usuario ya pidió. Prueba en la Task 5.

---

## PR 1: el motor

### Task 1: Migración 0003 y triggers

**Files:**
- Create: `scripts/generar-historial.mjs`
- Create: `src-tauri/migrations/0003_historial.sql`
- Modify: `src-tauri/src/db.rs` (`MIGRACIONES`, `abrir`: `recursive_triggers`; `lote`: rechazar `historial_`)
- Test: `src-tauri/src/historial.rs` (módulo nuevo, solo pruebas en esta task), `src-tauri/src/db.rs`

**Interfaces:**
- Produces: las tablas y triggers de abajo; `db::MIGRACIONES` con 3 entradas.

**Esquema (exacto):**

```sql
CREATE TABLE historial_acciones (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('app','importar','revisar','suprimir')),
  datos TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'hecha' CHECK (estado IN ('hecha','deshecha')),
  rehacible INTEGER,
  bloqueada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX historial_acciones_fecha ON historial_acciones (fecha);
CREATE TABLE historial_filas (
  accion_id TEXT NOT NULL REFERENCES historial_acciones (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  orden INTEGER NOT NULL,
  tabla TEXT NOT NULL,
  fila_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  antes TEXT,
  despues TEXT,
  PRIMARY KEY (accion_id, orden)
);
CREATE INDEX historial_filas_fila ON historial_filas (tabla, fila_id);
CREATE TABLE historial_en_curso (uno INTEGER PRIMARY KEY CHECK (uno = 1), accion_id TEXT);
INSERT INTO historial_en_curso VALUES (1, NULL);
```

**Forma de cada trigger** (`historial_<tabla>_insert|update|delete`, `AFTER`, `WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL`):
- `orden` = `max(orden) + 1` de esa acción.
- **Update:** `antes` y `despues` son `json_group_object` solo de las columnas con `OLD.c IS NOT NEW.c`, y no se inserta nada si ninguna cambió.
- **Insert:** `despues` es `json_object` de todas las columnas.
- **Delete:** `antes` es `json_object` de todas las columnas.
- **`meta`:** `fila_id = clave`, con `WHEN` además `clave IN ('org_nombre','logo_png','revision_bien','historial_plazo_dias')`.

- [ ] **Step 1: Pruebas que fallan** en `historial.rs`. Base en memoria con `db::MIGRACIONES` y `foreign_keys` y `recursive_triggers` encendidos.
  - `toda_tabla_de_negocio_tiene_sus_tres_triggers`: cada tabla de `sqlite_master`, salvo `historial_*`, tiene `historial_<t>_insert`, `_update` y `_delete`, y el SQL de cada trigger nombra todas sus columnas de `pragma_table_info`.
  - `sin_accion_abierta_no_anota`: un UPDATE en `unidades` deja `historial_filas` vacía.
  - `un_update_guarda_solo_lo_que_cambio`: con la acción abierta, cambiar `nombre` de una unidad deja una fila `update` con `antes = {"nombre":"Ventas"}` y `despues = {"nombre":"Ventas Norte"}`, más `updated_at` si cambió.
  - `un_update_sin_cambios_no_anota`.
  - `replace_en_meta_anota_borrado_e_insercion`: `INSERT OR REPLACE INTO meta ... 'org_nombre'` sobre una clave existente deja `delete` y luego `insert`.
  - `meta_solo_anota_sus_claves`: `data_revision` no se anota.
- [ ] **Step 2:** `cargo test historial` falla (no existe la migración).
- [ ] **Step 3:** Escribir `scripts/generar-historial.mjs`. Usa `node:sqlite`: aplica 0001 y 0002, lee las tablas y columnas e imprime el esquema de arriba más los triggers. Guardar su salida en `0003_historial.sql` y agregarla a `MIGRACIONES`. En `db::abrir`, `PRAGMA recursive_triggers = ON`. En `db::lote`, `Err("Sentencia no permitida: historial")` si el SQL contiene `historial_` (sin distinguir mayúsculas).
- [ ] **Step 4:** Prueba en `db.rs`: `lote_no_deja_escribir_en_el_historial`.
- [ ] **Step 5:** `cargo test` y `npm test` pasan. `node:sqlite` en `src/db/prueba/sqlite.ts` también aplica 0003. `alcance::toda_tabla_de_negocio_tiene_regla_de_poda` va a fallar: excluir `historial_%` en su consulta queda para la Task 4, así que por ahora se marca `#[ignore]` con el comentario «Task 4».
- [ ] **Step 6: Commit** `feat(historial): migración 0003 con los triggers del historial`

### Task 2: Anotar, deshacer y rehacer (Rust)

**Files:**
- Modify: `src-tauri/src/historial.rs`, `src-tauri/src/db.rs` (`lote`), `src-tauri/src/comandos.rs` (`db_lote`, comandos nuevos), `src-tauri/src/lib.rs` (registrar), `src-tauri/src/intercambio/mod.rs` (`agregar`), `src-tauri/src/intercambio/revision.rs` (`aplicar`)

**Interfaces (Produces):**
```rust
pub fn abrir_accion(c: &Connection, origen: &str, datos: &serde_json::Value) -> Result<String, String>;
pub fn cerrar_accion(c: &Connection, id: &str) -> Result<bool, String>; // false: no tenía filas y se borró
pub fn deshacer(c: &mut Connection, ids: &[String], version_app: &str) -> Result<(), Fallo>;
pub fn rehacer(c: &mut Connection, ids: &[String], version_app: &str) -> Result<(), Fallo>;
pub fn conflictos(c: &mut Connection, id: &str, sentido: Sentido) -> Result<Vec<String>, Fallo>;
pub enum Sentido { Deshacer, Rehacer } // serde "deshacer" | "rehacer"
pub fn punteros(c: &Connection) -> Result<Punteros, Fallo>;
#[derive(Serialize)] pub struct Punteros { pub deshacer: Option<AccionBreve>, pub rehacer: Option<AccionBreve> }
#[derive(Serialize)] pub struct AccionBreve { pub id: String, pub fecha: String, pub origen: String, pub datos: Value,
  pub estado: String, pub bloqueada: bool, pub filas: u32, pub muestra: Vec<FilaBreve> } // muestra: las 3 primeras
#[derive(Serialize)] pub struct FilaBreve { pub tabla: String, pub fila_id: String, pub op: String,
  pub campos: Vec<String>, pub nombre: Option<String>, pub nombre_antes: Option<String> }
pub fn nombre_de(c: &Connection, tabla: &str, fila_id: &str) -> Result<Option<String>, Fallo>;
```
- `db::lote(...) -> Result<Option<String>, String>`: el id de la acción, o `None` si no tocó filas.
- Comandos: `db_lote` devuelve `Option<String>`. `historial_deshacer(base_id, ids, version_app)`, `historial_rehacer(base_id, ids, version_app)` y `historial_punteros(base_id) -> Punteros`, todos con `con_conexion` (dan `otra_base` en la de al lado).
- Códigos de `Fallo`:
  - `historial_conflicto`: `detalle` = ids separados por coma.
  - `historial_bloqueada`.
  - `historial_no_se_pudo`: `detalle` = `referencias`, `ciclo` o el mensaje de SQLite para UNIQUE.
  - `historial_ya_aplicada`: deshacer una ya deshecha o rehacer una hecha.

- [ ] **Step 1: Pruebas que fallan** en `historial.rs`:
  - `lote_crea_una_accion_y_deshacer_devuelve_la_base_exacta`: compara el volcado de todas las tablas de negocio antes, después de deshacer y después de rehacer.
  - `un_lote_que_no_toca_filas_no_deja_accion`.
  - `deshacer_varias_va_de_la_mas_nueva_a_la_mas_antigua`.
  - `una_accion_nueva_vacia_la_pila_de_rehacer`.
  - `conflicto_por_misma_fila`: crear una unidad, luego renombrarla; `conflictos(primera, Deshacer)` devuelve `[segunda]`.
  - `conflicto_por_dependencia`: crear la unidad A, luego la B con `parent_id = A`; `conflictos(A, Deshacer)` devuelve `[B]`.
  - `deshacer_con_correo_repetido_no_cambia_nada`: Review Focus 2. Persona X con correo c; acción 1 le cambia el correo a d; acción 2 crea a Y con correo c; deshacer solo la 1 da `historial_no_se_pudo` y la base queda igual.
  - `deshacer_sin_los_conflictos_da_historial_conflicto`.
  - `una_bloqueada_no_se_deshace`.
  - `deshacer_no_anota_nada`.
  - `agregar_y_aplicar_revision_son_una_accion`, con origen `importar` o `revisar` y `datos.archivo`.
- [ ] **Step 2:** `cargo test historial` falla.
- [ ] **Step 3: Implementar.**
  - Tablas y columnas se validan contra `sqlite_master` y `pragma_table_info` antes de armar SQL; la clave es `clave` en `meta` e `id` en las demás.
  - Deshacer recorre las filas por `orden` descendente: insert → DELETE, update → UPDATE con `antes`, delete → INSERT con `antes`. Rehacer recorre ascendente con `despues`.
  - Todo en una transacción IMMEDIATE, sin acción abierta. Antes del commit, `pragma_foreign_key_check` y `validar::hay_ciclo`.
  - Al terminar, `marcar_cambio`.
  - `abrir_accion` usa `uuid::Uuid::now_v7()` y la fecha `strftime('%Y-%m-%dT%H:%M:%fZ','now')`, y vacía `rehacible`.
  - `agregar` y `revision::aplicar` abren su acción dentro de su transacción, después del respaldo.
- [ ] **Step 4:** `cargo test` y `cargo clippy -- -D warnings` pasan.
- [ ] **Step 5: Commit** `feat(historial): deshacer, rehacer y conflictos en Rust`

### Task 3: Retención y borrado definitivo

**Files:**
- Modify: `src-tauri/src/historial.rs`, `src-tauri/src/supresion.rs`, `src-tauri/src/organizaciones.rs` (`abrir_entrada_con`: podar al abrir), `src-tauri/src/intercambio/mod.rs` (`META_CONOCIDAS`)

**Interfaces (Produces):**
```rust
pub const PLAZO_POR_DEFECTO_DIAS: i64 = 365;
pub fn podar(c: &Connection) -> Result<u64, Fallo>;               // borra acciones vencidas; devuelve cuántas
pub fn limpiar_persona(c: &Connection, id: &str) -> Result<(), Fallo>; // dentro de la transacción de suprimir
```

- [ ] **Step 1: Pruebas que fallan:**
  - `podar_usa_365_dias_sin_clave`.
  - `podar_con_cero_no_borra_nada`.
  - `podar_con_30_borra_lo_anterior_con_sus_filas`.
  - `suprimir_deja_solo_el_nombre_en_el_historial`:
    - las filas de `trabajadores` de esa persona quedan con solo `nombre`;
    - las de `asignaciones` sin `motivo`;
    - las acciones que la tocaron, `bloqueada = 1`;
    - hay una acción `suprimir` con `antes.nombre` igual al nombre real.
  - `suprimir_dos_veces_no_duplica_la_accion`.
  - `reaplicar_tras_restaurar_vuelve_a_limpiar`: Review Focus 3. Copia la base antes de suprimir, suprime, «restaura» la copia y llama a `reaplicar`; el historial queda limpio.
- [ ] **Step 2:** `cargo test` falla.
- [ ] **Step 3: Implementar.**
  - `suprimir` llama a `limpiar_persona` y escribe su acción antes de vaciar la fila, sin acción abierta.
  - `podar` se llama al abrir la base escribible (no en lecturas ni en la de al lado) y no falla la apertura: un error se registra y se sigue.
  - Agregar `"historial_plazo_dias"` a `META_CONOCIDAS`.
- [ ] **Step 4:** `cargo test` pasa.
- [ ] **Step 5: Commit** `feat(historial): plazo de retención y limpieza al borrar definitivamente`

### Task 4: `.boldo` sin historial

**Files:**
- Modify: `src-tauri/src/intercambio/alcance.rs` (`preparar`, `recortar`, prueba de `PODA`), `src-tauri/src/intercambio/validar.rs` (`revisar_con_tope`)

- [ ] **Step 1: Pruebas que fallan:**
  - `la_copia_completa_no_lleva_historial` y `la_copia_parcial_no_lleva_historial`: las tablas `historial_acciones` e `historial_filas` quedan vacías y `historial_en_curso.accion_id` en `NULL`. La copia completa se vuelve a volcar, para que las filas no queden en páginas libres.
  - `un_boldo_con_historial_se_rechaza` (`contenido_invalido`, detalle `historial`).
  - `un_boldo_de_esquema_2_se_sigue_importando`: Review Focus 4.
  - Quitar el `#[ignore]` de la Task 1: `toda_tabla_de_negocio_tiene_regla_de_poda` excluye `historial_%`.
- [ ] **Step 2:** `cargo test intercambio` falla.
- [ ] **Step 3: Implementar.**
  - En `preparar` y en `recortar`: `DELETE FROM historial_filas; DELETE FROM historial_acciones; UPDATE historial_en_curso SET accion_id = NULL;`.
  - En la copia completa, `volcar` otra vez, como hace `recortar`.
  - En `revisar_con_tope`, si la versión es 3 o más y `historial_acciones` o `historial_filas` tienen filas, devolver `invalido("historial")`.
- [ ] **Step 4:** `cargo test` pasa.
- [ ] **Step 5: Commit** `feat(historial): los .boldo no llevan el historial`

### Task 5: Ctrl+Z, Ctrl+Y, el Deshacer de 8 s y el plazo (ventana)

**Files:**
- Modify: `src/db/cliente.ts` (`lote` devuelve `Promise<string | null>`; `historialDeshacer`, `historialRehacer` y `historialPunteros` por la cola `colaLotes`)
- Create: `src/features/historial/frases.ts`, `src/features/historial/frases.test.ts`, `src/features/historial/tipos.ts`
- Modify: `src/stores/organizacion.ts` (`aplicar` guarda la acción; `Borrado.accion`; quitar `RESTAURAR`; `deshacerUltima()`, `rehacerUltima()`)
- Modify: `src/features/atajos/atajos.ts` (+ `deshacer`, `rehacer`), `src/features/atajos/useAtajos.ts`, `src/features/atajos/atajos.test.ts`
- Modify: `src/vistas/VistaConfiguracion.vue` (sección «Historial de cambios» con el plazo)
- Modify: los textos de `src/i18n/` (es y en)

**Interfaces:**
- Consumes: los comandos y `AccionBreve` de la Task 2, con su forma en `tipos.ts`.
- Produces:
```ts
export function frase(a: AccionBreve, t: Traducir): string; // frases.ts
export function lote(sentencias: Sentencia[]): Promise<string | null>; // cliente.ts
export function historialDeshacer(ids: string[]): Promise<void>;
export function historialRehacer(ids: string[]): Promise<void>;
export function historialPunteros(): Promise<Punteros>;
// store: deshacerUltima(): Promise<Resultado & { frase?: string }>; rehacerUltima(): igual; deshacer(id?) usa Borrado.accion
```

- [ ] **Step 1: Pruebas que fallan:**
  - `frases.test.ts`, una por regla:
    - insert → «Creaste la unidad Ventas»;
    - `deleted_at` de nulo a valor → «Eliminaste…»; de valor a nulo → «Restauraste…»;
    - `parent_id` → «Moviste Ventas»;
    - `nombre` → «Renombraste Ventas a Ventas Norte»;
    - otro campo → «Cambiaste Ventas»;
    - varias filas → «… y 3 cambios más»;
    - `importar` → «Importaste ventas.boldo: 12 cambios»;
    - `suprimir` → «Borraste definitivamente a Juan Pérez», con el nombre real;
    - inglés.
  - `atajos.test.ts`: Ctrl+Z → `deshacer`, Ctrl+Y y Ctrl+Shift+Z → `rehacer`. Ninguno actúa con `enCampoDeTexto`, `modalAbierto`, `soloLectura` u `otraAlLado` (Review Focus 1).
  - En `cliente.test.ts`: `historialDeshacer` espera al lote en cola (Review Focus 5).
  - En `organizacion.test.ts`:
    - `deshacer` del aviso llama a `historialDeshacer` con la acción del borrado y vacía `ultimoBorrado`;
    - `deshacerUltima` recarga los datos.
- [ ] **Step 2:** `npx vitest run src/features/historial src/features/atajos src/stores src/db` falla.
- [ ] **Step 3: Implementar.**
  - Con Ctrl+Z o Ctrl+Y, `useAtajos` llama al store y muestra el aviso «Deshecho: {frase}» con la acción «Rehacer», o «Rehecho: {frase}», en las dos vistas de una organización dividida.
  - Si no hay nada que deshacer: «No hay nada que deshacer».
  - `historial_bloqueada` y `historial_no_se_pudo` se traducen en `errores.ts`.
  - En Configuración, un `<select>` con 30 días, 90 días, 1 año (por defecto) y Sin límite, que guarda con `guardarMeta("historial_plazo_dias", …)`.
  - Los 8 avisos de Deshacer de 8 s no cambian a la vista.
- [ ] **Step 4:** `npm test` y `npm run typecheck` pasan.
- [ ] **Step 5: Commit** `feat(historial): Ctrl+Z y Ctrl+Y que no se pierden al cerrar`

### Task 6: Textos, arnés y medición

**Files:**
- Modify: `ayuda/{es,en}/atajos.md` (Ctrl+Z, Ctrl+Y), `ayuda/{es,en}/fichas.md` (el nombre queda en el historial al borrar definitivamente), `ayuda/{es,en}/exportar-importar.md` (los `.boldo` no llevan el historial; tras «Reemplazar todo» empieza de cero), `ayuda/{es,en}/respaldos.md` (los respaldos sí lo llevan)
- Modify: los textos del diálogo «Borrar definitivamente» y del aviso de «Reemplazar todo» en `src/i18n/`
- Modify: `site/novedades.json` (una entrada en es y en: «Deshacer y rehacer que no se pierden»)
- Modify: el arnés de Windows (`scripts/probar-app-ci.mjs`)

- [ ] **Step 1: Arnés:**
  - renombrar una unidad, Ctrl+Z y comprobar el nombre anterior;
  - cerrar y abrir la app, Ctrl+Y y comprobar el nombre nuevo;
  - comprobar `rutaBd` antes de escribir.
- [ ] **Step 2: Medición** con `scripts/sembrar-grande.mjs`: tiempo de un lote de 1 y de 500 sentencias con y sin la migración, y tamaño del archivo tras 1.000 acciones. Los números van en el PR.
- [ ] **Step 3:** `npm test` en la raíz y en `site/` pasan.
- [ ] **Step 4: Commit** `docs(historial): ayuda, novedad y arnés`. `graphify update .`. Abrir el **PR 1** con `version:menor`.

---

## PR 2: la vista «Historial»

### Task 7: Páginas y detalle (Rust)

**Files:**
- Modify: `src-tauri/src/historial.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`

**Interfaces (Produces):**
```rust
#[derive(Deserialize)] pub struct Filtro { pub texto: Option<String>, pub desde: Option<String>, pub hasta: Option<String>,
  pub fila: Option<(String, String)> } // (tabla, fila_id), para «Ver historial» desde una ficha
pub fn pagina(c: &Connection, f: &Filtro, antes_de: Option<&str>, cuantas: u32) -> Result<Vec<AccionBreve>, Fallo>;
pub fn detalle(c: &Connection, id: &str) -> Result<Vec<FilaDetalle>, Fallo>;
#[derive(Serialize)] pub struct FilaDetalle { pub tabla: String, pub fila_id: String, pub op: String,
  pub nombre: Option<String>, pub campos: Vec<(String, Value, Value)> } // (campo, antes, después)
pub fn volver_a(c: &mut Connection, id: &str, version_app: &str) -> Result<Vec<String>, Fallo>; // ids deshechas
```
- Comandos: `historial_pagina`, `historial_detalle`, `historial_volver_a` y `historial_conflictos(base_id, id, sentido)`.
- Las páginas van de la más nueva a la más antigua por `id`. `texto` busca, sin distinguir tildes como `fusion::normalizar_nombre`, en el nombre que da `nombre_de` de las filas.

- [ ] **Step 1: Pruebas que fallan:**
  - `pagina_de_a_50_sin_repetir`.
  - `buscar_por_nombre_encuentra_las_acciones_de_esa_unidad`.
  - `filtro_por_fila`.
  - `detalle_no_muestra_campos_quitados_de_una_suprimida`.
  - `volver_a_deshace_todas_las_posteriores_hechas_y_deja_la_elegida`.
  - `volver_a_con_una_bloqueada_en_medio_no_cambia_nada` (`historial_bloqueada`).
  - `pagina_con_5000_acciones_bajo_50_ms`, con 5.000 acciones sembradas y medida con `Instant`.
- [ ] **Step 2:** falla. **Step 3:** implementar. **Step 4:** `cargo test` y `clippy` pasan.
- [ ] **Step 5: Commit** `feat(historial): páginas, detalle y volver a un punto en Rust`

### Task 8: Vista, fichas y Excel

**Files:**
- Create: `src/vistas/VistaHistorial.vue`, `src/features/historial/ListaHistorial.vue`, `src/features/historial/DetalleAccion.vue`, `src/features/historial/historial.ts` (agrupar por día y la línea «Estás aquí»), y sus `.test.ts`
- Modify: `src/router.ts` (`/historial`), `src/App.vue` (entrada después de Revisión, icono `History` de lucide), `src/components/PaletaComandos.vue`
- Modify: las fichas de unidad, puesto y persona («Ver historial» → `/historial?tabla=…&id=…`)
- Modify: `src/features/excel/listas.ts` (`hojaHistorial(filas: AccionBreve[], t: Traducir): Hoja`) y el botón de Excel de la vista
- Create: `ayuda/{es,en}/historial.md`. Modify: `site/novedades.json`, el arnés

**Interfaces:**
- Consumes: Task 7 y `frase` de la Task 5.
- Produces: `agruparPorDia(a: AccionBreve[], zona: string): { dia: string; acciones: AccionBreve[] }[]` y `posicionEstasAqui(a: AccionBreve[]): number` (índice de la primera hecha) en `historial.ts`.

- [ ] **Step 1: Pruebas que fallan:**
  - `historial.test.ts`: agrupar por día local y la posición de «Estás aquí».
  - `ListaHistorial.test.ts` con `renderToString`:
    - las deshechas atenuadas con «Deshecha»;
    - sin botones en solo lectura;
    - una bloqueada muestra por qué.
  - `DetalleAccion.test.ts`: campos antes → después y el diálogo de conflicto que nombra las acciones posteriores.
  - `listas.test.ts`: `hojaHistorial` con fecha, frase, estado y cuántos.
- [ ] **Step 2:** falla. **Step 3: Implementar.**
  - Carga por partes al bajar (50 por página).
  - «Deshacer esta acción» o «Rehacer esta acción»: primero pide `historial_conflictos`. Si hay, un diálogo nombra las acciones y ofrece «Deshacer las N juntas», que deshace todas en un paso.
  - «Volver a este punto» confirma con el número de acciones.
  - «Ir a» abre el árbol en la unidad, o la ficha.
  - Excel con la aceptación de spec §11, como `hojaDirectorio`.
- [ ] **Step 4: Arnés:** tres cambios, «Volver a este punto» en el primero y comprobar que los dos siguientes se deshicieron.
- [ ] **Step 5:** `npm test`, `npm run typecheck` y `site/` `npm test` pasan.
- [ ] **Step 6: Commit** `feat(historial): vista Historial con volver a un punto`. `graphify update .`. Abrir el **PR 2** con `version:menor`.
