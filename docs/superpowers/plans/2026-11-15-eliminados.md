# Task 19b, Eliminados y borrado definitivo: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lo eliminado se ve y se restaura desde una lista **Eliminados**. Una persona se puede **borrar definitivamente**: sus datos salen de verdad de la base, del archivo y, tras un plazo, de los respaldos, y no vuelven al restaurar ni al importar. Los datos de una persona se pueden **exportar a Excel**.

**Architecture:** «Eliminar» sigue siendo el borrado lógico de hoy (`deleted_at`). La supresión vive en Rust (`src-tauri/src/supresion.rs`): vacía la fila de la persona y la conserva con un nombre de relleno, porque `asignaciones` la referencia; anota el id y la fecha en `meta.suprimidas` (JSON, sin migración), y compacta la base para que nada quede en páginas libres ni en el WAL. Esa lista sirve para podar respaldos viejos, para volver a suprimir tras restaurar o reemplazar, y para que la revisión de un `.boldo` no ofrezca revivirla. La vista Eliminados lee lo borrado con consultas propias y restaura con los repos que ya existen.

**Tech Stack:** Tauri 2, rusqlite, Vue 3, Pinia, vue-i18n, ExcelJS (ya instalado), Vitest en `node` (SSR con `renderToString`), pruebas de Rust con `tempfile`.

**Spec:** Task 19b de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md` (Anexo 8) y §5 «deleted_at» de `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md`.

## Decisiones tomadas al planificar

**[VISIBLE]** cambia algo que el autor verá. El autor aceptó el 2026-11-15 los valores propuestos de la 1 y la 2.

1. **[VISIBLE] Respaldos de seguridad:** de `boldo-antes-de-restaurar-*` y de `boldo-antes-de-reemplazar-*` quedan los últimos 10 de cada uno (hoy no se podan). Los de importar (20) y optimizar (3) siguen igual.
2. **[VISIBLE] Plazo de 30 días:** a los 30 días de suprimir a una persona se borran los respaldos de esa organización hechos antes de la supresión, de todo tipo, también `antes-migracion-*`. Antes de esos 30 días, restaurar uno de ellos no la trae de vuelta: se vuelve a suprimir al terminar (decisión 6).
3. **[VISIBLE] La fila se conserva vacía.** Nombre: «Persona suprimida» en el idioma de la app al suprimir (el `CHECK` de `nombre` no deja vacío). Correo, teléfono, contrato, sede, jornada, foto y notas quedan en `NULL`. Sus asignaciones se conservan, eliminadas, con `motivo = NULL` (el motivo puede contar algo de la persona). Así el organigrama a una fecha y las vacantes no cambian.
4. **[VISIBLE] Se confirma escribiendo el nombre** en un diálogo que dice qué se borra, que no se puede deshacer y lo de los respaldos. No se hace un respaldo antes: tendría a la persona.
5. **Sin migración.** `meta.suprimidas` es un arreglo JSON de `{ "id": "<uuid>", "fecha": "<ISO-8601 UTC>" }`. Viaja en respaldos y en la copia completa.
6. **Volver a suprimir.** Restaurar un respaldo y «Reemplazar todo» con un `.boldo` leen `meta.suprimidas` de la base que se va, y al terminar vuelven a suprimir esas personas en la base nueva (si la fila existe) y unen las listas.
7. **La revisión de un `.boldo` no revive a una suprimida.** Si el archivo trae viva a una persona de `meta.suprimidas`, el caso queda en Borrar sin opción de restaurar, y «Restaurar todo» la salta. «Agregar lo nuevo» ya no la toca, porque la fila existe.
8. **[VISIBLE] Eliminados** está en `/configuracion/eliminados`, enlazado desde Configuración como Mantenedores, con pestañas Personas, Unidades y Puestos, de lo más reciente a lo más antiguo, con la fecha. Las suprimidas no salen.
   - **Restaurar persona:** `restaurarTrabajador`. Si su correo ya lo usa otra persona, se avisa y no se restaura.
   - **Restaurar puesto:** si su unidad está eliminada, el botón se desactiva y dice «Primero restaura la unidad …».
   - **Restaurar unidad:** vuelve vacía; la fila dice que lo que tenía se movió a su superior al eliminarla. Si su superior está eliminado, igual que el puesto.
   - Solo las personas tienen «Borrar definitivamente».
   - En solo lectura se ve la lista sin acciones.
9. **[VISIBLE] En la ficha**, junto a Eliminar: «Borrar definitivamente» (elimina y suprime en un paso) y «Exportar sus datos» (Excel con la aceptación obligatoria: hoja Datos y hoja Puestos con todo su historial, también lo terminado; sin foto).
10. **[VISIBLE] Ayuda y sitio:** `ayuda/{es,en}/fichas.md` (Eliminar, Borrar definitivamente, Exportar sus datos), `respaldos.md` (10 y 30 días), `exportar-importar.md` (la suprimida no vuelve), una novedad en `site/novedades.json`. La página «Seguridad y privacidad» es de la 19e.

## Global Constraints

- Texto de la app y la ayuda en español simple y directo; el inglés dice lo mismo.
- Vitest en `node`, sin DOM: componentes con `renderToString`, lógica en funciones puras. Sin jsdom.
- La app no se lanza en local; la prueba en la app real es el arnés del CI de Windows. Ningún arnés toca datos reales (comprueba `rutaBd`).
- Sin dependencias nuevas. Sin migración.
- El sitio no dice versiones, «próximamente» ni lo que falta.
- `graphify update .` después de cambiar código. En Bash, `git -C`, nunca `cd`.
- Un solo PR de código, con la etiqueta `version:menor`.

## Review Focus

1. **Restaurar un respaldo de antes de la supresión** (dentro de los 30 días): la persona no debe volver. Prueba en la Task 2.
2. **Revisión de un `.boldo` viejo con «Restaurar todo»:** no revive a la suprimida. Prueba en la Task 2.
3. **El archivo de la base tras suprimir** no contiene el nombre, el correo ni las notas, aunque haya WAL. Prueba en la Task 1.
4. **Restaurar a una persona cuyo correo ya usa otra:** aviso claro, nada a medias. Prueba en la Task 3.
5. **Suprimir dos veces o suprimir a alguien ya eliminado:** idempotente, sin error. Prueba en la Task 1.

---

### Task 1: Suprimir en Rust

**Files:**
- Create: `src-tauri/src/supresion.rs`
- Modify: `src-tauri/src/lib.rs` (módulo y comando), `src-tauri/src/comandos.rs` (comando, con el mismo patrón que `fotos_compactar`), `src-tauri/src/fotos.rs` (`compactar` pasa a `pub(crate)`)

**Interfaces:**
- Produces:
  - `pub struct Suprimida { pub id: String, pub fecha: String }` (serde, el JSON de la decisión 5)
  - `pub fn leer(conn: &Connection) -> Result<Vec<Suprimida>, Fallo>` (lista vacía si no hay clave o el JSON no se entiende)
  - `pub fn suprimir(conn: &mut Connection, id: &str, relleno: &str, fecha: &str) -> Result<(), Fallo>`
  - `pub fn reaplicar(conn: &mut Connection, previas: &[Suprimida], relleno: &str) -> Result<(), Fallo>`
  - Comando `suprimir_persona(base_id: String, id: String, relleno: String)`: suprime con la fecha de ahora y compacta.

- [ ] **Step 1: Pruebas que fallan** en `supresion.rs` (`#[cfg(test)]`, base en archivo con `tempfile` y las migraciones, WAL activo):
  - `suprimir_vacia_la_fila_y_conserva_asignaciones`: tras suprimir, `nombre == relleno`, los 7 campos en `NULL`, `deleted_at` no nulo, y sus asignaciones siguen con `deleted_at` no nulo y `motivo` nulo.
  - `suprimir_anota_en_meta`: `leer()` devuelve `[{id, fecha}]`.
  - `suprimir_dos_veces_no_duplica`: la segunda no falla y `leer()` tiene un elemento.
  - `el_archivo_no_guarda_los_datos`: con nombre `"Zacarías Únicoapellido"`, correo `"zz-unico@ejemplo.cl"` y notas `"nota-secreta-123"`, tras `suprimir` y `fotos::compactar`, los bytes del `.db` y del `-wal` (si existe) no contienen ninguno de los tres textos en UTF-8.
  - `reaplicar_vuelve_a_suprimir`: una base con la persona viva, `reaplicar(&[Suprimida{id, fecha}])` la deja suprimida y la anota; un id que no existe se ignora.
- [ ] **Step 2:** `cargo test supresion` falla porque el módulo no existe.
- [ ] **Step 3: Implementar.** `suprimir` hace en una transacción: el `UPDATE` de `trabajadores` (decisión 3, `deleted_at = COALESCE(deleted_at, fecha)`, `updated_at = fecha`), el de `asignaciones` (`motivo = NULL`, `deleted_at = COALESCE(deleted_at, fecha)`), la unión en `meta.suprimidas` sin repetir el id y `data_revision` + 1 como `db::lote`. `reaplicar` llama a `suprimir` por cada id que exista, con su fecha original. El comando compacta después con `fotos::compactar`.
- [ ] **Step 4:** `cargo test supresion` pasa, y `cargo test` entero también.
- [ ] **Step 5: Commit** `feat(supresion): borrar definitivamente a una persona en Rust`.

### Task 2: Respaldos y `.boldo` respetan la supresión

**Files:**
- Modify: `src-tauri/src/respaldos.rs`, `src-tauri/src/intercambio/revision.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`, `src/features/respaldos/respaldos.ts`

**Interfaces:**
- Consumes: `supresion::{leer, reaplicar, Suprimida}`.
- Produces:
  - `pub const CONSERVAR_SEGURIDAD: usize = 10;` y `pub const PLAZO_SUPRESION_DIAS: i64 = 30;`
  - `pub fn podar_por_supresiones(dir: &Path, suprimidas: &[Suprimida], ahora: &str) -> Result<usize, Fallo>`: el límite es la fecha más nueva entre las supresiones con más de 30 días; borra todo respaldo de `dir` con fecha anterior al límite, también `antes-migracion-*` (su sello `%Y%m%d%H%M%S` está en el nombre). Devuelve cuántos borró.
  - Comando `podar_respaldos_suprimidas(base_id)`, que `cliente.ts` expone como `podarRespaldosSuprimidas(): Promise<number>` y `respaldos.ts` llama en cada revisión de 15 min, sea cual sea la frecuencia.

- [ ] **Step 1: Pruebas que fallan** en `respaldos.rs`:
  - `seguridad_quedan_diez`: 13 `boldo-antes-de-restaurar-*` y 12 `boldo-antes-de-reemplazar-*`; tras el respaldo de seguridad siguiente quedan 10 de cada uno.
  - `poda_por_supresion_respeta_el_plazo`: supresión del 2026-11-01; con `ahora` 2026-11-20 no borra nada; con `ahora` 2026-12-02 borra los de antes del 2026-11-01 (uno de cada tipo y un `antes-migracion-*`) y deja los posteriores.
  - `restaurar_no_revive_a_la_suprimida`: respaldo con la persona viva, supresión en la base actual, `restaurar`; en la base restaurada la persona está suprimida y `meta.suprimidas` la tiene.
  - En `intercambio`: `reemplazar_no_revive_a_la_suprimida` (igual con `reemplazar`) y, en `revision.rs`, `restaurar_todo_salta_a_la_suprimida`: un caso `BorradoVsEditado` de una persona de `meta.suprimidas` queda en `Decision::Borrar` y `AccionMasiva::RestaurarTodo` no lo cambia; restaurarla una a una devuelve error.
- [ ] **Step 2:** las pruebas fallan.
- [ ] **Step 3: Implementar.** La poda de seguridad copia la de `respaldar_antes_de_importar`. Volver a suprimir va en `respaldos::reemplazar_antes_respaldando` si `restaurar` y `reemplazar` pasan por ahí (si no, en los dos): lee `supresion::leer` de la base que se va antes de cambiarla y llama a `reaplicar` en la nueva, con el relleno guardado en las propias filas suprimidas (el `nombre` de la primera; «Persona suprimida» si no hay). En `revision.rs`, el caso se marca como no restaurable al armarse.
- [ ] **Step 4:** `cargo test` pasa; `npx vitest run src/features/respaldos` pasa.
- [ ] **Step 5: Commit** `feat(respaldos): conservar 10 de seguridad y borrar a los 30 días los que guardan a una suprimida`.

### Task 3: Lista Eliminados

**Files:**
- Create: `src/db/repos/eliminados.ts`, `src/db/repos/eliminados.test.ts`, `src/vistas/VistaEliminados.vue`, `src/features/eliminados/eliminados.ts`, `src/features/eliminados/eliminados.test.ts`
- Modify: `src/router.ts`, `src/vistas/VistaConfiguracion.vue` (sección enlazada como `cfg-mantenedores`), `src/stores/organizacion.ts`, `src/i18n/es.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `restaurarTrabajador`, `restaurarPuesto`, `restaurarUnidad(id, { hijos: [], puestos: [] })`, `leerMeta()` (para `suprimidas`).
- Produces:
  - `SQL_ELIMINADOS_PERSONAS`, `SQL_ELIMINADOS_UNIDADES`, `SQL_ELIMINADOS_PUESTOS`: filas con `deleted_at IS NOT NULL`, la fecha, el nombre (o unidad y cargo del puesto) y el id de la unidad o del superior para saber si está eliminado.
  - `interface Eliminado { tipo: "persona" | "unidad" | "puesto"; id: string; nombre: string; fecha: string; bloqueo: string | null }` y `function armarEliminados(filas, suprimidas: Set<string>): Eliminado[]` en `eliminados.ts`: ordena por fecha descendente, quita las suprimidas y pone en `bloqueo` el nombre de la unidad eliminada que impide restaurar.
  - En el store: `restaurarEliminado(e: Eliminado): Promise<Resultado>`, que rechaza en solo lectura y traduce el error del índice único de correo a `"correo_en_uso"`.

- [ ] **Step 1: Pruebas que fallan:**
  - `eliminados.test.ts` (repos, `abrirBasePrueba`): las tres consultas traen solo lo eliminado; una persona restaurada desaparece de la lista.
  - `eliminados.test.ts` (feature): orden por fecha, sin suprimidas, `bloqueo` con el nombre de la unidad eliminada para un puesto y para una subunidad.
  - `organizacion.test.ts`: `restaurarEliminado` de una persona cuyo correo ya usa otra devuelve `"correo_en_uso"` y no cambia nada; en solo lectura devuelve el rechazo de siempre.
  - Render SSR de `VistaEliminados`: con una persona, una unidad y un puesto bloqueado, se ven tres filas, el puesto con el botón desactivado y su motivo, y la unidad con la frase de que vuelve vacía.
- [ ] **Step 2:** `npx vitest run src/db/repos/eliminados src/features/eliminados src/stores` falla.
- [ ] **Step 3: Implementar.** La vista copia la forma de `VistaMantenedores.vue` (volver a Configuración, `Tabs`). Tras restaurar, toast con el nombre.
- [ ] **Step 4:** las pruebas pasan, y `npm test` también.
- [ ] **Step 5: Commit** `feat(eliminados): ver y restaurar lo eliminado`.

### Task 4: Borrar definitivamente y exportar desde la ficha y desde Eliminados

**Files:**
- Create: `src/features/trabajadores/DialogoSuprimir.vue`, `src/features/excel/persona.ts`, `src/features/excel/persona.test.ts`
- Modify: `src/db/cliente.ts` (`suprimirPersona(id: string, relleno: string): Promise<void>`), `src/stores/organizacion.ts` (`suprimirPersona(id): Promise<Resultado>`: elimina si está viva, llama al comando y recarga), `src/features/trabajadores/FichaTrabajador.vue`, `src/vistas/VistaEliminados.vue`, `src/i18n/es.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `suprimir_persona` (Task 1), `BotonExcel`, `Hoja` y `celdaExcel` de `src/features/excel/libro.ts`, `SQL_HISTORICO` como modelo para leer sus asignaciones.
- Produces: `function hojasPersona(t: Trabajador & { notas: string | null }, asignaciones: AsignacionHistorica[], nombres: Catalogos): Hoja[]` (hojas «Datos» y «Puestos»).

- [ ] **Step 1: Pruebas que fallan:**
  - `persona.test.ts`: «Datos» lleva nombre, correo, teléfono, contrato, sede, jornada y notas; «Puestos» trae también las asignaciones terminadas, con unidad, cargo, tipo, desde, hasta y motivo; un texto que empieza con `=` sale como texto.
  - Render SSR de `DialogoSuprimir`: el botón queda desactivado hasta que el texto escrito coincide con el nombre (sin distinguir mayúsculas ni espacios de los extremos), y el diálogo dice que no se puede deshacer y lo de los 30 días.
  - `organizacion.test.ts`: `suprimirPersona` en solo lectura se rechaza y no llama al comando.
- [ ] **Step 2:** las pruebas fallan.
- [ ] **Step 3: Implementar.** En la ficha, «Borrar definitivamente» y «Exportar sus datos» van con Eliminar, solo si `id && !alLado`. En Eliminados, la fila de una persona suma «Borrar definitivamente». Tras suprimir se cierra la ficha y sale un toast sin Deshacer.
- [ ] **Step 4:** `npm test` pasa.
- [ ] **Step 5: Commit** `feat(fichas): borrar definitivamente y exportar los datos de una persona`.

### Task 5: Ayuda, sitio y comprobación final

**Files:**
- Modify: `ayuda/{es,en}/fichas.md`, `ayuda/{es,en}/respaldos.md`, `ayuda/{es,en}/exportar-importar.md`, `site/novedades.json`, `docs/superpowers/plans/2026-10-28-fase2-nucleo.md` (19c: las personas de `meta.suprimidas` no se guardan en el historial y se quitan de lo ya guardado)

- [ ] **Step 1:** escribir la ayuda de la decisión 10 y la novedad (título y texto en es y en, sin versión).
- [ ] **Step 2:** `npm test` (incluye `src/i18n/ayuda.test.ts`), `npm test` en `site/` y `cargo test` pasan; `graphify update .`.
- [ ] **Step 3: Commit** `docs: ayuda y novedad de Eliminados y borrado definitivo`.
- [ ] **Step 4:** PR con `version:menor`; el CI (incluido el arnés de Windows) en verde antes de fusionar.
