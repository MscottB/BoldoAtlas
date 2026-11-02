# Varias organizaciones, entrega 1 (organizaciones y pestañas): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir varias organizaciones en archivos separados y pasar de una a otra con las pestañas, sin que nada de una llegue a otra, conservando el `boldo.db` actual.

**Architecture:** `Rutas` sigue fija por copia. `Estado` gana una base abierta mutable; toda llamada a datos lleva `baseId` y Rust la compara con `conn` tomado. La lista vive en `organizaciones.json`; crear, agregar e importar solo dejan un archivo en la lista, y `abrir_organizacion` es el único camino que cambia de base. En TS, `src/stores/organizaciones.ts` hace el cambio.

**Tech Stack:** Tauri 2, Rust (rusqlite, `std::fs::File::try_lock`), Vue 3, Pinia, vue-i18n, Vitest, node:sqlite en pruebas.

**Spec:** `docs/superpowers/specs/2026-11-02-varias-organizaciones-design.md` (de «Dónde se guarda» a «Errores», más «Pruebas»). Complementa `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md`.

## Decisiones tomadas al planificar

La spec choca con el código o queda ambigua en estos puntos. **[VISIBLE]** cambia algo que el autor verá.

1. **[VISIBLE] Nada se ve hasta el último PR.** Cada PR publica una versión. Las pantallas nuevas van tras `ORGANIZACIONES_VISIBLES` (`src/app/proximamente.ts`, en `false`). La Task 18 cambia Inicio y quita la bandera.
2. **[VISIBLE] No existe la pregunta «igual que al cerrar la ventana».** Cerrar solo pregunta por trabajos en curso; un formulario sin terminar se pierde (`ventana.ts:129`, `ayuda/es/inicio.md:46`). El único guardia de cambios es el de la ficha (`useFicha.registrarGuardia`). El cambio de organización quita el foco para guardar el campo en edición, espera a `org.guardando` hasta 2 s y, si la ficha tiene cambios, usa su «Hay cambios sin guardar». Los demás formularios son modales y tapan la barra de pestañas.
3. **[VISIBLE] La spec dice dos cosas sobre un fallo al cambiar.** «Abrir y cambiar», paso 4, dice que se queda en la pestaña actual; «Pestañas» dice que el motivo va dentro de la pestaña. Se separan por causa. Si es del archivo (`no_encontrado`, `esquema_nuevo`, `contenido_invalido`, `danado`, `otro_id`, `abierta_en_otra_copia`, `desconocido`, `migracion`), la pestaña se activa y muestra el motivo, y la base anterior sigue abierta. Si es pasajero (`trabajo_en_curso`, `sin_espacio`, `fallo`), se queda en la actual con un aviso.
4. **[VISIBLE] Arranque si la última organización no abre.** La spec no lo dice. Hoy un error de apertura deja la pantalla de error. Se abre `boldo.db` (o se crea vacío), e Inicio avisa qué organización no abrió y por qué. La pantalla de error queda solo si falla `boldo.db`.
5. **[VISIBLE] Eliminar o quitar la organización abierta.** Inicio necesita una base abierta. Al eliminar la abierta se pasa antes a la más reciente que abra o, si no hay, a `boldo.db` vacío, y se va a Inicio. Sus pestañas se cierran solas (decisión 23). **Quitar de la lista** no se ofrece sobre la abierta.
6. **[VISIBLE] `.boldo` como organización nueva.** Se admite también un archivo parcial: el motivo para rechazarlo en «Reemplazar todo» (borra lo demás) no aplica. Siempre crea `organizaciones/<id>/`, aunque `boldo.db` esté vacío: reemplazar un archivo abierto exigiría reiniciar. Ese `boldo.db` vacío sigue sin listarse y lo usa el próximo **Crear**.
7. **[VISIBLE] «Abrir archivo…» abre solo `.db`.** El `.boldo` sigue por Importar, cifrado y con su código.
8. **[VISIBLE] «Reemplazar todo» y restaurar conservan el `db_id` local.** Hoy `META_CONOCIDAS` deja el del archivo (`intercambio/mod.rs:266`), y un respaldo antiguo trae el suyo. Con la identidad por `db_id`, pestañas y preferencias quedarían huérfanas, y dos entradas podrían tener el mismo id. Se nota en **Acerca de**: el id ya no cambia al reemplazar.
9. **[VISIBLE] Rutas de red, solo detección parcial.** `canonicalize` en Windows convierte una unidad mapeada en `\\?\UNC\…`, así que UNC y mapeadas se detectan sin dependencias. En Linux y macOS una carpeta montada no se detecta (`shortcut:` en el código).
10. **[VISIBLE] Capturas de la ayuda.** `inicio-organizacion`, `inicio-menu` e `inicio-proyecto` (es/en) muestran la pantalla vieja y el repo no tiene un script que las genere. Task 20: se rehacen con el arnés; si no se puede, se quita la imagen, también de la novedad que la usa, y se avisa. Una captura falsa no queda.
11. **`plegado:*` es por PC, no por organización.** Todas esas claves son de interfaz (`configuracion.apariencia`, `acerca.detalles`…), y una sección plegada no debe cambiar al cambiar de organización. Siguen sin tocar.
12. `foto://<baseId>/<id>` no sirve tal cual. `convertFileSrc` fija el host (`foto.localhost` en Windows, `localhost` en los demás) y codifica `/`, y la CSP solo admite `foto:` y `http://foto.localhost`. La base va en la ruta: `${convertFileSrc(baseId, "foto")}/${id}?v=…`. La CSP no cambia.
13. La base abre en `setup`, no en `Estado::iniciar`. `iniciar` también corre en una segunda instancia, antes del plugin de instancia única: con el bloqueo fallaría o esperaría antes de traer la ventana al frente. De paso, una segunda instancia ya no migra.
14. Paso 5 de `abrir_organizacion`: `organizaciones.json` se escribe **antes** de cerrar la anterior. Si no, la falla exigida por «Pruebas obligatorias» (entre los pasos 3 y 5) no podría dejar la anterior abierta.
15. `respaldos.rs`: `restaurar` y `reemplazar_antes_respaldando` reciben `&Base`; las demás siguen con `dir: &Path`, que ya es de la organización. `listar` no asume `boldo.db`: solo lo hacen `limpiar_parciales` y el nombre `boldo.restaurando`.
16. Rechazo por trabajo en curso en Rust: `Sesiones::ocupada()` más `conn.try_lock` con espera de 2 s, porque un respaldo tiene la conexión mientras dura. Optimizar fotos corre en TS, lote a lote: lo frena `trabajos` en TS, y un lote atrasado recibe `otra_base`. Sin registro nuevo de trabajos.
17. Marca del ejemplo: campo `ejemplo: true` en la entrada de `organizaciones.json` (con `#[serde(default)]`). Buscar por nombre fallaría con otro idioma o tras renombrar.
18. Validación de un archivo externo: completa al agregarlo o buscarlo; en cada apertura posterior, solo versión y esquema exacto, para cumplir la meta de 1 s. Si el `db_id` ya no coincide con la entrada, error `otro_id`: se resuelve con **Buscar archivo**. El arranque y el cambio comparten esas comprobaciones en `abrir_entrada`.
19. El logo en Inicio se lee del archivo, con `solo_lectura_cerrada`, al listar: abrir un archivo en WAL con `solo_lectura` deja `-wal` y `-shm` a su lado. La lista no guarda imágenes de hasta 2 MB ni se agrega un caché.
20. Migración: las preferencias se copian una vez por copia de la app (marca `organizaciones:migrado:<dirDatos>`). Pestañas: `pestanas:<dirDatos>` se crea desde `pestanas:<rutaBd>` si no existe, poniendo `org` en cada una. `dirDatos` y no un `pestanas` fijo porque en macOS copias distintas comparten `localStorage`. `InfoApp.rutaBd` sigue siendo `boldo.db`.
21. La spec cita las líneas 220 y 233 de la spec principal, pero «base principal» está en las **224 y 237**. La Task 19 corrige esas y agrega un puntero en 229, 238, 239, 254 y 256, que describen lo que se retira o cambia.
22. CI del instalador: viable en Windows (Task 8). Comprueba archivos y `organizaciones.json`, no el `localStorage` del WebView; eso lo cubren las pruebas TS y el arnés de la Task 20. En Linux y macOS no hay prueba de instalador.
23. **[VISIBLE] Eliminar cierra solas las pestañas.** La spec pedía cerrarlas antes, pero la última pestaña no se cierra y la abierta siempre tiene la activa: nunca se podría eliminar. El diálogo dice cuántas se cierran. Spec corregida.
24. **[VISIBLE] Frecuencia «al abrir».** Respalda solo la primera vez que se abre cada organización en la sesión. Si no, cada cambio de pestaña haría un respaldo, gastaría los 10 que conserva la poda y frenaría el cambio siguiente. Spec corregida.
25. **[VISIBLE] Archivo externo de más de 512 MiB.** Se pregunta antes de abrirlo, al agregarlo o buscarlo, con un mensaje claro. Antes se habría rechazado, y puede ser una organización propia con fotos sin optimizar. Los demás topes siguen, y un `.boldo` sobre ese total se sigue rechazando. Spec corregida.
26. **[VISIBLE] Eliminar `boldo.db` deja lo ajeno.** En `respaldos/` se borran solo los respaldos; un `notas.txt` del usuario se queda. Spec corregida.
27. **[VISIBLE] Una base dentro de `datos/`, fuera de su lugar** (`respaldos/`, `organizaciones-eliminadas/`): **Abrir archivo…** la copia a una organización nueva y no la abre allí. Si no, se escribiría un id en el respaldo y la poda lo borraría.
28. **[VISIBLE] Una migración o una carga que falla** muestra el motivo dentro de la pestaña, con el detalle para copiar, en vez de un aviso que desaparece.
29. **[VISIBLE] Una pestaña de una organización quitada de la lista** dice que ya no está y ofrece **Cerrar pestaña**.
30. **[VISIBLE] Al cerrar la pestaña activa** se pasa a una vecina de la misma organización. Si no hay, se cambia de organización, y la pestaña se quita solo si el cambio salió bien.
31. **[VISIBLE] Tres mensajes de error.** Disco lleno al editar da un texto traducido, no el código. Otra copia usando `boldo.db` tiene su texto en la pantalla de error. El aviso de solo lectura ya no nombra `boldo.db`, porque puede ser otro archivo.
32. **[VISIBLE] Esperas del bloqueo.** Al arrancar se espera hasta 8 s, para que una app que se está cerrando alcance a soltarlo; un archivo en uso por otra copia demora eso el arranque. Al cambiar de organización no se espera.
33. **[VISIBLE] Capturas de la ayuda.** La ventana debe pintar, así que no va minimizada: se abre fuera de la pantalla y se avisa al autor antes.
34. En un sistema de archivos sin bloqueos, `boldo.db` abre sin esa protección en vez de dejar de abrir (`shortcut:` en el código). Lo pide «Se logra si», punto 3.

**Comprobado en el código, sin sorpresas:** `Estado` tiene `conn` y `rutas`. `con_conexion` es el camino común, pero `restaurar_respaldo`, `importar_reemplazar`, `cerrar_ordenado` y `reabrir` toman `conn` directo. `cambiar_base` deja `None` hasta reiniciar. `solo_permitidas` no se toca. `0002_zonas.sql` está en `MIGRACIONES`. `db/prueba/sqlite.ts` no necesita cambios: no conoce la base.

## Global Constraints

- Rutas relativas a la carpeta de datos: `boldo.db` y `respaldos/` sin mover; `organizaciones/<id>/organizacion.db`, `organizaciones/<id>/respaldos/`, `organizaciones.json`, `organizaciones-eliminadas/`.
- `<id>` es el `db_id` en forma canónica (UUID de 36 caracteres en minúsculas). Nunca se borra ni se crea una carpeta con una ruta salida del JSON: se deriva de un id validado.
- `organizaciones.json`: `{"version":1,"organizaciones":[{id,ruta,externa,nombre,color,abierta}]}`, más `ejemplo` (decisión 17). Se escribe a un temporal y se renombra. Internas con ruta relativa; externas con absoluta.
- Códigos de error: `otra_base`, `abierta_en_otra_copia`, `trabajo_en_curso`, `no_encontrado`, `otro_id`, `sin_espacio`, `migracion`, `abierta`. Más los existentes `esquema_nuevo`, `danado`, `contenido_invalido`, `desconocido`, `fallo`. Se traducen en `respaldos.error.<codigo>`, es y en.
- `otra_base` no se reintenta: se registra y se pide recargar.
- Bloqueo: `<base>.bloqueo` con `File::try_lock`; sin dependencias nuevas.
- Orden de `abrir_organizacion`: la nueva abre antes de soltar la anterior.
- Meta de cambio: menos de 1 segundo con 10.000 personas y 1.000 fotos. «Abierto recientemente»: hasta 8.
- `.boldo` no cambia de formato. Respaldos: mismos nombres (`boldo-…`, `antes-migracion-…`).
- Las claves antiguas de `localStorage` no se borran. `recientes:*` deja de escribirse.
- Acciones de store: devuelven `{ok, mensaje}`, no lanzan, un solo `escribir` por acción. La interfaz nunca envía una ruta: los diálogos los abre Rust.
- Textos en es y en. Nada de versiones, fases ni «próximamente» en `site/novedades.json`; «te ayuda a cumplir», nunca «cumple».
- **Pruebas nunca con datos reales del autor** (`%APPDATA%\io.github.mscottb.boldoatlas`). Rust: `tempfile` y `rutas::dir_datos(exe, …)` con carpetas temporales; ninguna prueba llama a `Estado::iniciar`. TS: `localStorage` simulado. Todo arnés aborta si `rutaBd` no está en su temporal y no deja ventanas a la vista.
- Tras cambiar código: `graphify update .`. Antes de cada PR: `npm run typecheck`, `npm run lint`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.

## Review Focus

Cada línea tiene su prueba en la tarea indicada.

1. **La última organización está en un pendrive retirado** al abrir la app: abre `boldo.db`, avisa y no pierde las pestañas de la otra (Task 7).
2. **Ctrl+Tab rápido entre pestañas de organizaciones distintas:** nunca dos `abrir_organizacion` a la vez, y se termina en la última pedida (Task 14).
3. **Eliminar una organización sin nombre o con tildes y espacios:** se puede confirmar, con el texto que muestra el diálogo (Task 16).
4. **El mismo archivo por otro camino** (`dir/../dir/a.db`; en Windows, otra capitalización): no es una copia y no cambia su `db_id` (Task 11).
5. **Reinicio o actualización con el bloqueo tomado:** la app nueva espera a que se suelte y `reabrir` vuelve a la base abierta, no a `boldo.db` (Tasks 1 y 9).

## Mapa de tareas y PR

| # | Tarea | Visibilidad | PR |
|---|---|---|---|
| 1 | Base abierta, bloqueo, apertura en `setup` | ninguna | 1. Seguro |
| 2 | `baseId` en comandos y `cliente.ts` | ninguna | 1 |
| 3 | Fotos por organización | ninguna | 1 |
| 4 | Respaldos por base y `db_id` conservado | ninguna | 2. Datos por organización |
| 5 | Preferencias por organización y su migración | ninguna | 2 |
| 6 | Pestañas con `org` | ninguna | 2 |
| 7 | `organizaciones.json` y última abierta | ninguna | 3. Lista |
| 8 | CI: actualizar desde la versión publicada | ninguna | 3 |
| 9 | `abrir_organizacion` | sin interfaz | 4. Abrir y crear |
| 10 | `crear_organizacion` | sin interfaz | 4 |
| 11 | Archivos externos | sin interfaz | 5. Archivos |
| 12 | Quitar, eliminar y copias | sin interfaz | 5 |
| 13 | `.boldo` como organización nueva | sin interfaz | 5 |
| 14 | Cambio de organización en TS | sin efecto con una sola | 6. Interfaz |
| 15 | Pestañas en pantalla; menú y paleta | bandera | 6 |
| 16 | Configuración › Organizaciones | bandera | 6 |
| 17 | Importar, barra superior, bandeja | bandera | 6 |
| 18 | Inicio nuevo; se retira lo viejo; sin bandera | **visible** | 7. Entrega |
| 19 | Ayuda, novedades, sitio, spec principal | **visible** | 7 |
| 20 | Arnés de migración y medición; capturas de la ayuda | puerta del PR 7 | 7 |

Todo el seguro (Tasks 1 a 6) entra antes de que exista un camino para abrir una segunda organización (Task 9).

**Compatibilidad, dónde se prueba:** `.boldo`, Tasks 4 y 13 más las pruebas existentes de `intercambio`. Respaldos existentes y restaurar, Tasks 4 y 7. Portable, Tasks 7 y 10. Autoactualizador, Tasks 1, 8 y 9.

---

### Task 1: Base abierta, bloqueo y apertura en `setup`

**Visibilidad:** ninguna.

**Files:**
- Create: `src-tauri/src/organizaciones.rs`
- Modify: `src-tauri/src/lib.rs` (`mod`, primera línea de `setup`), `src-tauri/src/comandos.rs:17-143`, `src-tauri/src/respaldos.rs` (`con_sufijo` pasa a `pub(crate)`; `restaurar` usa `version_y_esquema`), `src-tauri/src/intercambio/validar.rs`, `src/db/errores.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/db/errores.test.ts`

**Interfaces:**
- Produces, en `organizaciones.rs`:
  - `pub struct Base { pub id: String, pub bd: PathBuf, pub respaldos: PathBuf }` (`Debug, Clone, PartialEq`)
  - `pub fn es_id_valido(id: &str) -> bool`
  - `pub fn identidad(conn: &Connection) -> Result<String, String>`: lee `db_id`; si no es válido escribe uno nuevo (v7) y lo devuelve.
  - `pub fn bloquear(bd: &Path, espera: Duration) -> Result<File, Fallo>`: reintenta `try_lock` sobre `<bd>.bloqueo` cada 25 ms. Vencida la espera, `abierta_en_otra_copia`. Si `bloqueo_sin_soporte`, devuelve el archivo sin bloqueo (`shortcut:`, decisión 34). Otro error: `fallo`.
  - `fn bloqueo_sin_soporte(e: &io::Error) -> bool`: `ErrorKind::Unsupported`.
  - `pub const ESPERA_ARRANQUE: Duration` = 8 s; `pub const ESPERA_CAMBIO: Duration` = 0
  - `pub struct Abierta { pub conn: Connection, pub bloqueo: File, pub id: String, pub version: i64 }`
  - `pub fn abrir_base(bd: &Path, respaldos: &Path, id_nuevo: Option<&str>, espera: Duration, migraciones: &[&str]) -> Result<Abierta, Fallo>`
- Produces, en `validar.rs`:
  - `pub fn solo_lectura_cerrada(ruta: &Path) -> Result<Connection, Fallo>`: las opciones de `abrir_no_confiable`. Si no existe `<ruta>-wal`, URI `file:…?immutable=1` con la ruta codificada; si existe, `solo_lectura`.
  - `pub fn version_leida(c: &Connection, migraciones: &[&str]) -> Result<usize, Fallo>`: mayor que `migraciones.len()`: `esquema_nuevo`; ilegible: `danado`.
  - `pub fn version_y_esquema(ruta: &Path, migraciones: &[&str]) -> Result<usize, Fallo>`: `version_leida` más `revisar_solo_esquema`, que pasa a usar `solo_lectura_cerrada`.
- Produces, en `comandos.rs`: `Estado` con `conn`, `base: Mutex<Option<Base>>` (se escribe solo con `conn` tomado), `bloqueo: Mutex<Option<File>>`, `rutas`, `version_esquema: AtomicI64`, `error: Mutex<Option<String>>`. Además `pub fn abrir_inicial(&self)`, `pub fn base_abierta(&self) -> Option<Base>` y, en pruebas, `pub(crate) fn de_prueba(conn: Option<Connection>, base: Option<Base>, rutas: Option<Rutas>) -> Estado`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `organizaciones.rs`:
- `id_valido_solo_en_forma_canonica`: acepta un `now_v7().to_string()`; rechaza `""`, `"../x"`, mayúsculas, sin guiones, `{…}`, `urn:uuid:…`.
- `identidad_reemplaza_un_db_id_invalido`: con `db_id = '../../x'` devuelve uno válido y queda escrito; con uno válido, no cambia.
- `segundo_bloqueo_da_abierta_en_otra_copia`: con `espera` 100 ms, `codigo == "abierta_en_otra_copia"`; soltado el primero, bloquea.
- `bloquear_espera_a_que_se_suelte` (Review Focus 5): un hilo suelta a los 50 ms; con `ESPERA_ARRANQUE` se obtiene.
- `con_espera_cambio_no_espera`: con el bloqueo tomado, `ESPERA_CAMBIO` da `abierta_en_otra_copia` al primer intento.
- `bloqueo_sin_soporte_solo_con_unsupported`: true con `Unsupported`; false con `PermissionDenied`.
- `abrir_base_no_toca_un_archivo_de_esquema_mas_nuevo`: base creada con `db::abrir` (en WAL) y `user_version = 99`: da `esquema_nuevo`, sigue 99, y no aparecen `-wal` ni `-shm`.
- `abrir_base_rechaza_lo_que_no_es_sqlite`: da `danado`.
- `abrir_base_con_migracion_que_falla_da_migracion`: código `migracion`, con el texto de SQLite en `detalle`.

En `validar.rs`:
- `solo_lectura_cerrada_no_deja_archivos`: base en WAL ya cerrada, en una ruta con espacios, tildes, `#` y `%`: lee y, al cerrar, no hay `-wal` ni `-shm`.
- `solo_lectura_cerrada_lee_lo_que_sigue_en_el_wal`: con otra conexión abierta y una fila sin volcar, la ve.

En `comandos.rs`, además de ajustar las existentes a `de_prueba`:
- `cerrar_ordenado_suelta_el_bloqueo`: tras cerrar, `bloquear` con otro handle funciona.
- `reabrir_vuelve_a_la_base_abierta_con_su_bloqueo` (Review Focus 5): con `Base` distinta de `rutas.bd`, tras `cerrar_ordenado` y `reabrir`, la conexión es la de esa base y un segundo `bloquear` falla.
- `abrir_inicial_con_esquema_nuevo_guarda_el_texto_de_hoy`: `error` contiene `esquema 99; esta app conoce hasta el <MIGRACIONES.len()>`.

En `errores.test.ts`: «`Otra copia de BoldoAtlas tiene abierta esta base: C:/x` se traduce».

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml organizaciones`. Expected: no compila, falta `organizaciones`.

- [ ] **Step 3: Implementar**

`abrir_base`, en este orden: `create_dir_all(respaldos)`; `bloquear`; si el archivo existe, `solo_lectura_cerrada` y `version_leida`; `db::abrir`; `db::migrar_con` (su error da `migracion`); si hay `id_nuevo`, insertar `db_id`; `db::asegurar_meta`; `identidad`.

`respaldos::restaurar` usa `version_y_esquema`, y sigue dando `esquema_nuevo` o `danado` como hoy.

`Estado::iniciar` deja solo rutas y entorno; `abrir_inicial` abre `rutas.bd` con `ESPERA_ARRANQUE` y guarda el error si falla, con el texto que `errores.ts` reconoce: en `esquema_nuevo`, el de hoy (`db::migrar_con`); en `abierta_en_otra_copia`, «Otra copia de BoldoAtlas tiene abierta esta base: <ruta>», con su regla en `nativos` y la clave `errores.abiertaEnOtraCopia`; si no, su `detalle`. `lib.rs`: `app.state::<comandos::Estado>().abrir_inicial();` al comienzo de `setup`. `cerrar_ordenado` suelta también el bloqueo y conserva `base`; `reabrir` usa `base` y vuelve a bloquear. `con_conexion` no cambia todavía.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src-tauri/src`; `git commit -m "Organizaciones: base abierta, bloqueo y apertura en setup"`

### Task 2: `baseId` en los comandos y en `cliente.ts`

**Visibilidad:** ninguna.

**Files:**
- Create: `src/lib/baseActiva.ts`
- Modify: `src-tauri/src/comandos.rs`, `src-tauri/src/fotos.rs` (`foto_bytes`, `fotos_guardar`, `fotos_compactar`, `Lote`), `src-tauri/src/respaldos.rs` (`From` de `Fallo`), `src-tauri/src/organizaciones.rs` (`abrir_base` deja pasar `sin_espacio`), `src-tauri/src/db.rs` (`texto`), `src/db/cliente.ts`, `src/db/errores.ts`, `src/main.ts`, `src/App.vue`, `src/app/estructura.ts`, `src/features/configuracion/optimizarFotos.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/db/cliente.test.ts`, `src/db/errores.test.ts`, `src/lib/baseActiva.test.ts`, `src/features/configuracion/optimizarFotos.test.ts`, `src-tauri/src/comandos.rs`

**Interfaces:**
- Consumes: `Estado`, `Base` (Task 1).
- Produces, en Rust:
  - `pub const OTRA_BASE: &str = "otra_base"` (en `organizaciones.rs`)
  - `pub(crate) fn con_conexion<T, E: From<String>>(&self, base_id: &str, f: impl FnOnce(&mut Connection) -> Result<T, E>) -> Result<T, E>`
  - `pub(crate) fn con_ranura<T>(&self, base_id: &str, f: impl FnOnce(&mut Option<Connection>, &Base) -> Result<T, Fallo>) -> Result<T, Fallo>`
  - `pub(crate) fn base(&self, base_id: &str) -> Result<Base, Fallo>`
  - `base_id: String` en: `db_consultar`, `db_lote`, `listar_respaldos`, los tres `respaldar_*`, `restaurar_respaldo`, `abrir_carpeta_respaldos`, `info_proyecto`, `exportar_preparar`, `importar_abrir`, `importar_agregar`, `importar_reemplazar`, `importar_comparar`, `revision_pagina`, `revision_detalle`, `revision_verificar`, `revision_bloqueos`, `revision_opciones`, `revision_aplicar`, `foto_bytes`, `fotos_compactar`; y `base_id` en el JSON de `fotos_guardar`.
  - Los que no tocan la conexión no lo llevan: una sesión de intercambio no sobrevive a un cambio de base (Task 9).
- Produces, en `src/lib/baseActiva.ts` (sin importar Tauri, para no romper los `vi.mock("@/db/cliente")`): `baseActual(): string`, `fijarBase(id: string): void`, `alSoltarDatos(f: () => void): void`, `soltarDatos(): void`, `class BaseCambiada extends Error`, `marcarCambio(activo: boolean): void`, `enCambio(): boolean`.
- Produces, en `cliente.ts`: `InfoApp.baseId: string`, `alOtraBase(f: () => void): void`, `colaVacia(): Promise<void>`, `fotoBytes(id: string): Promise<ArrayBuffer>`, `fotosGuardar(armar: (baseId: string) => Promise<Uint8Array>): Promise<number>`, `fotosCompactar(): Promise<void>`. Las tres de fotos salen de `optimizarFotos.ts`; `armarLote` gana `baseId` y lo escribe como `base_id` en su JSON. `alReemplazarBase` sigue hasta la Task 18 para vaciar los recientes al restaurar o reemplazar; su función privada `soltarDatos` pasa a llamarse `vaciarRecientes`, para no confundirse con la nueva.

- [ ] **Step 1: Escribir las pruebas que fallan**

Rust:
- `con_conexion_con_otra_base_no_ejecuta_nada`: el cierre no corre; el error es `"otra_base"`.
- `lote_con_base_antigua_no_escribe`: `data_revision` no cambia.
- `con_ranura_y_base_rechazan_otra_base`: `Fallo.codigo == "otra_base"`.
- `fallo_desde_texto_reconoce_otra_base_y_sin_espacio`; `io::ErrorKind::StorageFull` y un `rusqlite::Error` con `ErrorCode::DiskFull` dan `sin_espacio`.

TS, en `cliente.test.ts`:
```ts
it.each(CASOS)("%s lleva baseId", async (_, llamar) => {
  fijarBase("A"); await llamar();
  expect(invoke.mock.lastCall?.[1]).toMatchObject({ baseId: "A" });
});
it("una respuesta que llega con otra base activa se descarta", async () => {
  fijarBase("A"); const p = consultar("SELECT 1"); fijarBase("B"); resolver([{ n: 1 }]);
  await expect(p).rejects.toBeInstanceOf(BaseCambiada);
});
it("un lote en cola sale con la base con que se pidió", …);  // baseId "A" aunque ya esté activa "B"
it("otra_base con la misma base avisa una vez y no reintenta", …);  // handler 1 vez, invoke 1 vez
it("otra_base con la base ya cambiada no avisa", …);  // handler 0 veces
it("otra_base durante un cambio no avisa y rechaza con BaseCambiada", …);  // marcarCambio(true), misma base, handler 0 veces
```
`CASOS` es una fila por cada función de `cliente.ts` cuyo comando lleva `base_id`, incluidas `fotoBytes` y `fotosCompactar`. `fotosGuardar` tiene su prueba: `armar` recibe la base con que se pidió. En `errores.test.ts`: «`sin_espacio` se traduce». En `optimizarFotos.test.ts`: `armarLote` escribe `base_id`.

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/db/cliente.test.ts` y `cargo test --manifest-path src-tauri/Cargo.toml otra_base`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`con_conexion`: toma `conn`, compara con `base` y luego ejecuta `f`. `conn` queda privado. Sin base solo entra lo interno: `cerrar_ordenado`, `reabrir` y `abrir_inicial` aquí; `cambiar_a` (Task 9), `crear` (Task 10) y `eliminar` (Task 12) después. Así, ningún comando que atienda una consulta de la interfaz llega a la conexión sin pasar un `base_id`; la tabla `CASOS` prueba que TS lo manda, y el grep del Step 4, que ningún comando lo ignora.

`From<String> for Fallo` mapea los textos `otra_base` y `sin_espacio` a su código, y `From<rusqlite::Error>` mapea `ErrorCode::DiskFull`. `db::texto` devuelve `sin_espacio` con `ErrorCode::DiskFull`. En `errores.ts`, regla `sin_espacio` a `errores.sinEspacio`. Claves `errores.sinEspacio` y `respaldos.error.sin_espacio` en es y en.

`cliente.ts` gana un `conBase<T>(comando, args)` privado, el único que agrega `baseId`; captura la base al pedir, no al invocar. Si la respuesta llega con otra base activa rechaza con `BaseCambiada`. No queda colgada: `escribir` debe llegar a su `finally`. `otra_base` se reconoce como texto y como `Fallo.codigo`; con otra base activa o con `enCambio()`, rechaza con `BaseCambiada` sin avisar. `fotosGuardar` hace lo mismo con el cuerpo que arma `armar`.

`fotos::atender`, solo en esta tarea: usa `base_abierta()`; la Task 3 lo cierra. `main.ts`: `fijarBase(info.baseId)` antes de `org.cargar()`. `App.vue`: `alOtraBase` hace `console.error` y un aviso sin caducar con la acción **Recargar**. Clave `respaldos.error.otra_base` en es y en. Se agrega `baseId: ""` a `InfoApp` en `infoSiFalloCarga`, en el `catch` de `main.ts` y en las pruebas.

- [ ] **Step 4: Comprobar que pasan.** Run: `npm test` y `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS. Run: buscar `_base_id` en `src-tauri/src`, y `invoke` de `foto_bytes`, `fotos_guardar` o `fotos_compactar` fuera de `cliente.ts`. Expected: sin coincidencias.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: cada llamada a datos lleva su baseId"`

### Task 3: Fotos por organización

**Visibilidad:** ninguna.

**Files:**
- Modify: `src-tauri/src/fotos.rs`, `src/features/trabajadores/foto.ts:180`, `src/features/trabajadores/foto.test.ts:300-307`

**Interfaces:**
- Consumes: `es_id_valido` (Task 1), `con_conexion(base_id, …)` (Task 2), `baseActual()`.
- Produces: `pub fn respuesta_de(estado: &Estado, metodo: &Method, ruta: &str) -> Response<Vec<u8>>`, que recibe `/<baseId>/<id>`. `servir` y sus pruebas no cambian: sigue recibiendo `/<id>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

- `foto_de_a_con_b_abierta_da_404`: 404, cuerpo vacío, sin `Cache-Control`.
- `foto_con_su_base_se_sirve`: 200 con `immutable`.
- `ruta_sin_base_da_400`: `/ana`, `/`, `/../x/ana`, `/a/b/c`.
- `con_la_base_cerrada_da_503`.

TS:
```ts
expect(urlFoto({ id: "ana-1", updated_at: "2026-11-01T10:00:00.000Z" }))
  .toBe("http://foto.localhost/A/ana-1?v=2026-11-01T10%3A00%3A00.000Z");
```

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/trabajadores/foto.test.ts` y `cargo test --manifest-path src-tauri/Cargo.toml fotos`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`urlFoto = (w) => `${convertFileSrc(baseActual(), "foto")}/${w.id}?v=${encodeURIComponent(w.updated_at)}``. `convertFileSrc` codifica `/`: por eso `id` va fuera. `respuesta_de` separa la ruta y exige `es_id_valido` en la base; `otra_base` se responde con 404. `tauri.conf.json` no cambia.

- [ ] **Step 4: Comprobar que pasan.** Run: los mismos del Step 2.. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: las fotos se piden con su base"`

### Task 4: Respaldos por base y `db_id` conservado

**Visibilidad:** ninguna (mismo comportamiento con una sola base; el `db_id` conservado solo se nota en Acerca de).

**Files:**
- Modify: `src-tauri/src/respaldos.rs`, `src-tauri/src/intercambio/mod.rs:408-432`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs:72-74`, `src-tauri/src/rutas.rs:135`, `src-tauri/src/db.rs:22`, `src/i18n/es.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `Base`.
- Produces:
  - `pub fn limpiar_parciales(dir: &Path, bd: Option<&Path>)`
  - `pub fn restaurar(conexion: &mut Option<Connection>, base: &Base, nombre: &str, migraciones: &[&str]) -> Result<(), Fallo>`
  - `pub fn reemplazar_antes_respaldando(conexion: &mut Option<Connection>, base: &Base, origen: &Path, migraciones: &[&str]) -> Result<(), Fallo>`
  - `intercambio::reemplazar(conexion, base: &Base, i, migraciones)`
  - `rutas::info_proyecto(r: &Rutas, base: &Base)`

- [ ] **Step 1: Escribir las pruebas que fallan**

- `restaurar_funciona_con_otro_nombre_y_carpeta`: con `organizacion.db` no deja `organizacion.restaurando`.
- `limpiar_parciales_usa_el_nombre_de_la_base`: borra `organizacion.restaurando` y su `-wal` con `organizacion.db` al lado; sin la base no lo toca.
- `restaurar_conserva_el_db_id_de_la_base`: el respaldo trae otro `db_id`; queda el de `Base`.
- `reemplazar_conserva_el_db_id_local`: tras reemplazar, `db_id` es el local y se quita `origen_db_id`.
- `info_proyecto_muestra_la_base_abierta`: `ruta_bd == base.bd`, `dir_datos == r.datos`.
- Se ajustan las existentes, incluidas `limpiar_parciales_borra_una_restauracion_interrumpida_si_esta_la_base` y `un_respaldo_interrumpido_no_se_lista_y_se_limpia`.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml respaldos`. Expected: no compila.

- [ ] **Step 3: Implementar**

`cambiar_base` recibe `db_id`: tras `asegurar_meta` en la copia, `UPDATE meta SET valor = ?1 WHERE clave = 'db_id'`, antes de renombrar. La copia sigue siendo `bd.with_extension("restaurando")`. `lib.rs`: `limpiar_parciales(&r.datos, Some(&r.bd))` y `limpiar_parciales(&r.respaldos, None)`. Los comandos usan `estado.base(&base_id)?.respaldos` y `con_ranura`. El mensaje de solo lectura en `db.rs` y la clave `errores.baseSoloLectura`, en es y en, ya no nombran `boldo.db`.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: respaldos por base; restaurar y reemplazar conservan el db_id"`

### Task 5: Preferencias por organización y su migración

**Visibilidad:** ninguna.

**Files:**
- Modify: `src/lib/preferencias.ts`, `src/features/arbol/useVista.ts`, `src/features/directorio/VistaDirectorio.vue:48,58,111,112`, `src/features/unidades/PersonasUnidad.vue:77-78`, `src/main.ts`
- Test: `src/lib/preferencias.test.ts`, `src/features/arbol/useVista.test.ts` (nuevo)

**Interfaces:**
- Consumes: `baseActual`, `alSoltarDatos` (Task 2).
- Produces:
  - `leerPreferenciaOrg<T>(clave: string, porDefecto: T): T`
  - `guardarPreferenciaOrg(clave: string, valor: unknown): void` (sin base no hace nada)
  - `migrarPreferencias(id: string, dirDatos: string): void`
  - Clave: `<clave>:<db_id>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

El simulador de `localStorage` tiene también `length` y `key(i)`.
- «cada organización lee y guarda lo suyo»: con base A guarda; con base B lee el valor por defecto.
- «sin base no guarda nada».
- «migra copiando a la clave de la organización y deja la antigua»: sembrando `boldo:vista`, `boldo:vista:completo`, `boldo:directorio`, `boldo:directorio:columnas`, `boldo:personas:vista`, `boldo:minimapa`, cada una aparece como `…:A` y la original sigue igual; `boldo:plegado:x` no se copia.
- «no migra tema, idioma, respaldos ni recientes».
- «no pisa lo ya guardado y corre una vez por copia»: con `organizaciones:migrado:C:/datos` no hace nada; con otro `dirDatos`, migra.
- `useVista`: «al soltar los datos carga la vista de la otra organización»; «lo de A no se guarda con la clave de B»; «importado antes de `fijarBase`, tras `soltarDatos()` lee lo guardado».

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/lib/preferencias.test.ts src/features/arbol/useVista.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`useVista.ts`: lectura con la base actual al importar y `alSoltarDatos` para recargar `config` y `minimapa` (`vista` sin sufijo también es por organización). `main.ts`: `migrarPreferencias(info.baseId, info.dirDatos)` tras `fijarBase` y luego `soltarDatos()`, antes de crear las pestañas: `router.ts` importa `VistaArbol` sin carga diferida, así que `useVista` ya se evaluó con la base vacía.

- [ ] **Step 4: Comprobar que pasan.** Run: el del Step 2 y `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src`; `git commit -m "Organizaciones: preferencias de datos por organización"`

### Task 6: Pestañas con `org`

**Visibilidad:** ninguna.

**Files:**
- Modify: `src/features/pestanas/pestanas.ts`, `src/features/pestanas/usePestanas.ts`, `src/main.ts:35`
- Test: `src/features/pestanas/pestanas.test.ts`, `src/features/pestanas/usePestanas.test.ts`

**Interfaces:**
- Consumes: `baseActual`, `InfoApp.dirDatos`, `InfoApp.rutaBd`.
- Produces:
  - `Pestana.org: string`
  - `unaPestana(id: string, org: string, ruta?: string)`, `abrir(m, id, ruta, org)`
  - `cerrar(m, id)`: si era la activa, prefiere una vecina de su organización y, si no hay, la de siempre.
  - `leerPestanas(crudo, valida: (ruta: string, org: string) => boolean, nuevoId, orgActual: string)`
  - `usePestanas.conectar(r: Router, dirDatos: string, rutaBd: string)`
  - `valida(ruta: string, org = baseActual())`: para otra organización solo mira la vista, no unidades ni personas.
  - `titulo(p: { ruta: string; org?: string })`: con otra organización, solo el nombre de la vista.

- [ ] **Step 1: Escribir las pruebas que fallan**

- «una pestaña guardada sin `org` queda de la organización actual».
- «las pestañas de otra organización no se descartan por unidades que aquí no existen»: `/?raiz=x` con `org: "B"` se conserva; con `org: "A"`, se descarta.
- «lee la clave antigua si no hay nueva, le pone `org` y no borra la antigua».
- «con la clave nueva, la antigua no se mira».
- «si la activa guardada es de otra organización, `entrar` pasa a una de la abierta o abre una en `/`».
- «al volver de la Bienvenida no activa una pestaña de otra organización con la misma ruta».
- «el título de una pestaña de otra organización no muestra datos de la abierta».
- «al cerrar la activa se pasa a una vecina de su organización, aunque la de al lado sea de otra».
- Clave en las pruebas: `boldo:pestanas:C:/datos`.

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`clave = pestanas:<dirDatos>`. Al leer: `leerPreferencia(nueva) ?? leerPreferencia("pestanas:<rutaBd>")`. Las dos búsquedas `lista.find` de `conectar` (líneas 86-88) filtran por `p.org === baseActual()`. `abrirNueva` usa `baseActual()`.

- [ ] **Step 4: Comprobar que pasan.** Run: `npx vitest run src/features/pestanas` y `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src`; `git commit -m "Organizaciones: cada pestaña sabe de qué organización es"`

### Task 7: `organizaciones.json` y última abierta

**Visibilidad:** ninguna (con una sola entrada todo se ve igual).

**Files:**
- Modify: `src-tauri/src/organizaciones.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`

**Interfaces:**
- Consumes: `abrir_base`, `es_id_valido`, `solo_lectura_cerrada`, `version_y_esquema` (Task 1).
- Produces, en `organizaciones.rs`:
  - `pub struct Entrada { id, ruta: String, externa: bool, nombre: String, color: String, abierta: String, #[serde(default)] ejemplo: bool }`
  - `pub struct Lista { version: u32, organizaciones: Vec<Entrada> }`
  - `pub fn cargar_lista(r: &Rutas) -> Lista`: lee o reconstruye; descarta entradas con `id` inválido o ruta interna absoluta o con `..`.
  - `pub fn escribir_lista(r: &Rutas, l: &Lista) -> Result<(), Fallo>`
  - `pub fn ruta_de(r: &Rutas, e: &Entrada) -> PathBuf`
  - `pub fn base_de(r: &Rutas, e: &Entrada) -> Base`
  - `pub fn abrir_entrada(r: &Rutas, e: &Entrada, espera: Duration, migraciones: &[&str]) -> Result<Abierta, Fallo>`: `ruta_de(...).is_file()` o `no_encontrado`; si es externa, `version_y_esquema`; `abrir_base`; si el id no coincide, suelta y da `otro_id`.
  - `pub fn esta_vacia(conn: &Connection) -> rusqlite::Result<bool>`: sin unidades ni personas, también eliminadas, y `org_nombre` vacío.
  - `pub const PALETA: [&str; 8]` = `#3b6fb5 #2f855a #b7791f #c05621 #9b2c2c #805ad5 #2c7a7b #b83280`
  - `pub fn color_libre(l: &Lista) -> &'static str`: el menos usado, en orden.
  - `pub struct OrganizacionVista { id, nombre, color, abierta, externa, ruta, existe, activa, logo: Option<String>, bytes_base: u64, bytes_respaldos: u64, ejemplo }` (`camelCase`)
- Produces, en `comandos.rs`: `Estado.lista: Mutex<()>` (se toma durante todo leer-cambiar-escribir; orden: `conn`, luego `lista`), `pub fn abrir_inicial_con(&self, espera: Duration, migraciones: &[&str])`, a la que pasa a llamar `abrir_inicial` con `ESPERA_ARRANQUE` y `db::MIGRACIONES`, `InfoApp.aviso_inicio: Option<AvisoInicio { codigo, nombre }>`, comando `listar_organizaciones(estado: State<Estado>) -> Result<Vec<OrganizacionVista>, Fallo>`.
- Produces, en `cliente.ts`: `interface Organizacion`, `listarOrganizaciones()`, `InfoApp.avisoInicio?`, opcional para no tocar los literales de `InfoApp`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Con `rutas::dir_datos` en carpeta temporal:
- `primer_arranque_lista_boldo_db_sin_moverlo`: base de esquema 1 (`migrar_con(&MIGRACIONES[..1])`) con una unidad, `org_nombre`, un respaldo `boldo-20200101-0000.db`. Tras `abrir_inicial_con`: `boldo.db` en su lugar con su fila, el respaldo intacto, un `antes-migracion-1-*` en `respaldos/`, JSON con una entrada `{ruta: "boldo.db", externa: false}` cuyo `id` es el `db_id`, y sin carpeta `organizaciones/<id>`.
- `base_vacia_no_se_lista`.
- `json_danado_se_reconstruye_sin_externas_ni_tocar_archivos`: con `boldo.db` y `organizaciones/<id>/organizacion.db`; la externa sale y su archivo sigue.
- `json_ausente_se_reconstruye`.
- `carpeta_con_otro_db_id_no_se_lista`.
- `rutas_relativas_sobreviven_a_mover_la_carpeta`: copia `datos/` a otra ruta y abre.
- `entrada_con_ruta_con_puntos_se_descarta`: `../x.db` y `organizaciones/../../x.db`.
- `escribir_no_deja_temporal`.
- `externa_ausente_aparece_como_no_existe`: `existe == false`, `bytes_base == 0`.
- `arranca_en_la_ultima_abierta`: la de `abierta` mayor.
- `con_la_ultima_ausente_abre_boldo_db_y_avisa` (Review Focus 1): `aviso_inicio.codigo == "no_encontrado"`, base abierta `boldo.db`, y la entrada ausente sigue en la lista.
- `con_la_ultima_en_otra_copia_abre_boldo_db_y_avisa`: `abierta_en_otra_copia`, con `espera` de 100 ms.
- `arranque_con_externa_con_trigger_abre_boldo_db_y_avisa`: `contenido_invalido`, y el archivo no se abrió para escribir.
- `arranque_con_otro_id_abre_boldo_db_y_avisa`: `otro_id`.
- `listar_no_deja_archivos_junto_a_una_cerrada`: una base en WAL cerrada, con logo: `listar_organizaciones` lo devuelve y no aparecen `-wal` ni `-shm`.
- `la_poda_no_ve_otra_carpeta`: dos entradas; con `base_de`, 12 respaldos en la de A y 1 en la de B: las carpetas son distintas y B sigue intacta.
- `sin_boldo_db_se_crea_vacio_y_no_se_lista`.
- `restaurar_vuelve_a_la_que_estaba_abierta`: tras reiniciar, `abrir_inicial_con` abre la misma entrada.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml organizaciones`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`base_de`: `boldo.db` usa `r.respaldos`; las demás, `organizaciones/<id>/respaldos`. Al reconstruir: `solo_lectura_cerrada` en cada archivo; `abierta` sale de la fecha de modificación.

`abrir_inicial_con`: abre la última con `abrir_entrada`; si falla, `boldo.db` con aviso. Una base no vacía queda en la lista con `abierta` al día; una falla al escribir la lista no impide abrir.

`setup`: limpia también cada `organizaciones/<id>/` (`Some(organizacion.db)`) y su `respaldos/` (`None`). `listar_organizaciones` lee el logo con `solo_lectura_cerrada`; si falla, `None`.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml` y `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: lista en organizaciones.json y arranque en la última abierta"`

### Task 8: CI, actualizar desde la versión publicada

**Visibilidad:** ninguna.

**Files:**
- Create: `scripts/probar-actualizacion.ps1`
- Modify: `.github/workflows/instalador.yml`

**Interfaces:**
- Consumes: `organizaciones.json` escrito en `setup` (Task 7); nombre publicado `BoldoAtlas_windows_x64_setup.exe` (comprobado en `v0.1.0-alpha.34`).

- [ ] **Step 1: Escribir el script**

Parámetros `-Anterior`, `-Nuevo`. Empieza como `probar-instalador.ps1`: `if ($env:CI -ne 'true') { throw … }`, para que nunca corra en el PC del autor. Pasos:
1. Instala `-Anterior` con `/P`.
2. Abre `$env:LOCALAPPDATA\BoldoAtlas\boldo-atlas.exe`, espera hasta 60 s a `$env:APPDATA\io.github.mscottb.boldoatlas\boldo.db` y cierra el árbol con `taskkill /T /F /PID`.
3. Con `node:sqlite` escribe `org_nombre = 'Prueba CI'` y una unidad (`tipo_id` `00000000-0000-7000-8000-000000000001`), lee `db_id` y deja un respaldo `respaldos\boldo-20200101-0000.db`.
4. Instala `-Nuevo` con `/P /UPDATE`.
5. Abre, espera hasta 60 s a `organizaciones.json` y cierra.
6. Comprueba y termina con error si no se cumple: `boldo.db` en el mismo lugar, con su nombre y su unidad; el respaldo sigue; una sola entrada con `ruta = 'boldo.db'`, `id = db_id`, `nombre = 'Prueba CI'`.

- [ ] **Step 2: Agregar el paso al flujo**

En `instalador.yml`:
- Agrega a `paths`: `src-tauri/src/organizaciones.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/rutas.rs`, `src-tauri/migrations/**`, `scripts/probar-actualizacion.ps1`.
- Job aparte, `actualizar`, para partir de un runner limpio; compila igual que `windows`.
- Paso previo con `GH_TOKEN: ${{ github.token }}`: `gh release list --exclude-drafts --limit 1 --json tagName` y `gh release download <tag> -p BoldoAtlas_windows_x64_setup.exe -D anterior`. `contents: read` alcanza.

- [ ] **Step 3: Comprobar**

Run: en el PR, `gh workflow run instalador.yml --ref <rama>` y `gh run watch`.
Expected: job `actualizar` en verde. Si GitHub no deja abrir la app en el runner, se informa como no viable en el PR y se cubre con la Task 20; no se deja el paso en rojo ni se ignora.

- [ ] **Step 4: Commit.** `git add scripts/probar-actualizacion.ps1 .github/workflows/instalador.yml`; `git commit -m "CI: actualizar desde la versión publicada conserva la organización"`

### Task 9: `abrir_organizacion`

**Visibilidad:** comando sin interfaz.

**Files:**
- Modify: `src-tauri/src/comandos.rs`, `src-tauri/src/intercambio/mod.rs` (`Sesiones`), `src-tauri/src/organizaciones.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`

**Interfaces:**
- Consumes: `abrir_entrada`, `ESPERA_CAMBIO`, `cargar_lista`, `escribir_lista`, `base_de`.
- Produces:
  - `Sesiones::ocupada(&self) -> bool`: `trabajo.is_some()`
  - `Estado::cambiar_a(&self, id: &str, ocupada: &dyn Fn() -> bool, migraciones: &[&str]) -> Result<OrganizacionVista, Fallo>`
  - Comando `abrir_organizacion(app, id: String) -> Result<OrganizacionVista, Fallo>`, en `spawn_blocking`
  - `fn cambiar_a_abierta(&self, nueva: Abierta, bd: PathBuf, respaldos: PathBuf, entrada: Option<&Entrada>) -> Result<(), Fallo>`, privada: pasos 4 a 6; `Base.id` sale de `nueva.id`. Sin `entrada` (un `boldo.db` sin listar, Task 12), lo agrega a la lista solo si no está vacío.
  - `cliente.ts`: `abrirOrganizacion(id: string): Promise<Organizacion>`, sin `baseId`

- [ ] **Step 1: Escribir las pruebas que fallan**

Con dos organizaciones en carpeta temporal:
- `cambia_de_base_y_la_anterior_rechaza`: `con_conexion("A", …)` da `otra_base`; `con_conexion("B", …)` lee B.
- `la_anterior_queda_sin_wal`: sin `-wal` ni `-shm`, también tras `listar_organizaciones`.
- `archivo_ausente_no_cambia_nada`: `no_encontrado`, A sigue, y no se crea el archivo.
- `esquema_mas_nuevo_no_cambia_nada`: `esquema_nuevo`; B sigue en 99.
- `migracion_que_falla_deja_la_anterior` (obligatoria): `[MIGRACIONES, &["ESTO NO ES SQL;"]].concat()`; código `migracion`; A sigue escribible, B sin cambios y el `.bloqueo` de B libre.
- `falla_al_escribir_la_lista_deja_la_anterior` (obligatoria, entre los pasos 3 y 5): `organizaciones.json` convertido en carpeta; A sigue y el bloqueo de B queda libre.
- `bloqueo_de_otra_copia_no_cambia_nada`: `abierta_en_otra_copia`.
- `trabajo_en_curso_no_cambia_nada`: `ocupada` devuelve `true`; da el código, A sigue, y tarda menos de 5 s: el runner de Windows es lento.
- `con_un_respaldo_en_curso_rechaza`: `conn` tomado en otro hilo; `trabajo_en_curso`.
- `respaldo_de_migracion_en_la_carpeta_de_esa_organizacion`: `antes-migracion-1-*` en `organizaciones/<id>/respaldos/` y ninguno nuevo en `respaldos/`.
- `otro_db_id_se_rechaza`: `otro_id`.
- `externa_con_un_trigger_ajeno_se_rechaza`: `contenido_invalido`, sin abrir para escribir.
- `abrir_la_misma_no_reabre`: misma conexión, `abierta` al día.
- `actualiza_nombre_y_fecha_en_la_lista`.
- `reabrir_tras_cambiar_vuelve_a_la_nueva` (Review Focus 5).
- `limpia_una_restauracion_interrumpida_junto_a_la_externa`.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml cambiar_a`. Expected: no compila.

- [ ] **Step 3: Implementar `cambiar_a`, en este orden exacto**

```text
0. Si id es la base abierta: actualiza `abierta` en la lista y termina.
1. Hasta 2 s: espera !ocupada() y conn.try_lock(). Si no: trabajo_en_curso. Queda con conn tomado.
2. Busca la entrada (desconocido).
3. abrir_entrada(r, e, ESPERA_CAMBIO, migraciones): archivo, esquema si es externa, bloqueo, migración con su respaldo, otro_id.
4. Actualiza nombre (meta.org_nombre) y abierta; escribir_lista. Si falla: suelta la nueva y devuelve el error.
5. En la anterior: PRAGMA wal_checkpoint(TRUNCATE) y close, ignorando su error (ya no hay vuelta atrás).
6. Con conn tomado: guarda conn, base, bloqueo y version_esquema.
```

En externas, borra además `bd.with_extension("restaurando")` si existe.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: abrir_organizacion, la nueva abre antes de soltar la anterior"`

### Task 10: `crear_organizacion`

**Visibilidad:** comando sin interfaz.

**Files:**
- Modify: `src-tauri/src/organizaciones.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`, `src/stores/organizacion.ts` (junto a `sentenciasEjemplo`)
- Test: `src/stores/organizacion.test.ts`

**Interfaces:**
- Consumes: `abrir_base`, `db::lote`, `esta_vacia`, `color_libre`.
- Produces:
  - `Estado::crear(&self, sentencias: &[Sentencia], version_app: &str, ejemplo: bool, migraciones: &[&str]) -> Result<String, Fallo>`: devuelve el id; **no cambia de base**.
  - Comando `crear_organizacion(app, sentencias: Vec<Sentencia>, version_app: String, ejemplo: bool) -> Result<String, Fallo>`
  - `cliente.ts`: `crearOrganizacionNueva(sentencias: Sentencia[], ejemplo: boolean): Promise<string>`
  - `useOrganizacion().sentenciasNueva(tipo: "vacia" | "ejemplo", datos?: { nombre: string; nombreRaiz: string }): Sentencia[]`: usa `renombresSemilla(TIPOS_SEMILLA…, () => 0)`, como hoy `reemplazarCon`. En `"ejemplo"`, `org_nombre` es el de hoy, `EJEMPLO[idioma].organizacion` («Compañía Demo» / «Demo Company»).

- [ ] **Step 1: Escribir las pruebas que fallan**

Rust:
- `la_primera_usa_boldo_db_vacio_y_abierto`: no se crea carpeta; entrada `ruta = "boldo.db"`.
- `con_boldo_db_ausente_lo_usa`.
- `con_boldo_db_con_datos_crea_su_carpeta`: `organizaciones/<id>/organizacion.db`, `db_id == id`, existe `respaldos/`, y la base abierta no cambió.
- `lote_que_falla_no_deja_carpeta_ni_entrada`, también con una sentencia no permitida (`DROP TABLE meta`).
- `boldo_db_listado_y_vacio_no_se_reusa`.
- `portable_no_escribe_fuera_de_su_carpeta`: tras crear, lo nuevo bajo la carpeta padre está dentro de `exe/`.
- `ejemplo_queda_marcado`.

TS, con `abrirBasePrueba`: `sentenciasNueva("vacia", …)` aplicada deja raíz y nombre; `sentenciasNueva("ejemplo")` aplicada deja `org_nombre = "Compañía Demo"`.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml crear` y `npx vitest run src/stores/organizacion.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`boldo.db` está libre si no está en la lista y falta o está vacío. Si está abierto, el lote va por su conexión, tras comprobar `esta_vacia` con `conn` tomado; si no, `abrir_base`, lote y cierre. En otro caso: id v7, `abrir_base(…, Some(&id), ESPERA_CAMBIO, …)`, lote y cierre; si algo falla, `remove_dir_all` de la carpeta derivada del id. Al final, entrada nueva con `color_libre`.

`reemplazarCon` sigue hasta la Task 18.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml` y `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: crear en un archivo nuevo, sin vaciar la base"`

### Task 11: Archivos externos

**Visibilidad:** comandos sin interfaz.

**Files:**
- Modify: `src-tauri/src/intercambio/validar.rs:325-361`, `src-tauri/src/organizaciones.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`

**Interfaces:**
- Consumes: `cargar_lista`, `es_id_valido`, `Temporal`.
- Produces:
  - `validar::revisar_organizacion(ruta: &Path, migraciones: &[&str], max_bytes: i64) -> Result<Revisada, Fallo>`, con `pub struct Revisada { version: usize, excede_bytes: bool }`: `revisar` sin `leer_meta`, con `solo_lectura_cerrada`, y el total de bytes no rechaza: lo informa. `revisar` pasa a llamarla con `MAX_BYTES_VIVOS` y rechaza como hoy si `excede_bytes`, con su `pesado`. Los demás topes rechazan igual en las dos.
  - `organizaciones::es_ruta_de_red(ruta: &Path) -> bool`: recibe la ruta ya canónica, no toca el disco.
  - `pub struct ArchivoAgregado { id: Option<String>, pide: Option<&'static str>, avisos: Vec<&'static str> }`; `pide`: `"red"` | `"otro_id"` | `"tope"`; `avisos`: `"copia"` | `"fuera_de_portable"`
  - `organizaciones::agregar_archivo(r: &Rutas, ruta: &Path, buscando: Option<&str>, confirmados: &[&str], migraciones: &[&str]) -> Result<ArchivoAgregado, Fallo>`: **no abre la base**. Llama a `agregar_con_tope(…, MAX_BYTES_VIVOS)`, que las pruebas usan con un tope chico.
  - `Estado.pendiente: Mutex<Option<(PathBuf, Option<String>, Vec<&'static str>)>>`: ruta, entrada buscada y lo ya confirmado.
  - Comandos `agregar_archivo_organizacion(app, buscando: Option<String>) -> Result<Option<ArchivoAgregado>, Fallo>` (diálogo nativo con filtro `.db`) y `confirmar_archivo_organizacion(app, si: bool) -> Result<Option<ArchivoAgregado>, Fallo>`: con `si`, suma lo preguntado a lo confirmado y repite. Ambos toman `Estado.lista` durante todo leer-cambiar-escribir.
  - `cliente.ts`: `agregarArchivoOrganizacion`, `confirmarArchivoOrganizacion`

- [ ] **Step 1: Escribir las pruebas que fallan**

- `ajeno_rechazado_sin_abrir_para_escribir`: con trigger, vista, tabla extra, `user_version = 0` y texto no SQLite da `contenido_invalido`; archivo con los mismos bytes y sin `-wal` ni `-shm` al lado.
- `externa_sobre_el_tope_pregunta_antes_de_abrir`: con `agregar_con_tope` de 1 byte, `pide == "tope"`, sin entrada y con los mismos bytes; confirmado `"tope"`, queda en la lista; rechazado, no.
- `un_boldo_sobre_el_tope_se_sigue_rechazando`: `revisar` con un archivo que `excede_bytes`, mismo error de hoy.
- `cada_motivo_se_pregunta_por_separado`: red y otro id: tras confirmar `"red"`, `pide == "otro_id"`.
- `esquema_mas_nuevo_rechazado`: `esquema_nuevo`.
- `externa_guarda_ruta_absoluta_y_sus_respaldos_van_a_la_app`: `base_de(...).respaldos == organizaciones/<id>/respaldos`.
- `mismo_archivo_por_otro_camino_no_es_copia` (Review Focus 4): `dir/../dir/a.db`, y en `cfg(windows)` otra capitalización; una sola entrada y sin aviso.
- `copia_recibe_un_db_id_nuevo_escrito_en_el_archivo`: mismo `db_id` con otra ruta existente; aviso `copia`; el original no cambia.
- `archivo_movido_no_es_copia`: la ruta listada ya no existe; se actualiza la ruta y se conserva el id.
- `db_id_invalido_recibe_uno_nuevo`.
- `buscar_con_otro_id_pide_confirmar`: `pide == "otro_id"`; confirmado, la entrada buscada se reemplaza por la nueva.
- `dentro_de_datos_no_es_externa`: `boldo.db` y `organizaciones/<id>/organizacion.db` con su id: `externa == false` y ruta relativa.
- `base_en_respaldos_se_copia_a_su_carpeta_nueva`: un `.db` en `respaldos/` o en `organizaciones-eliminadas/` queda en `organizaciones/<id>/organizacion.db`, sin preguntar; el original no cambia.
- `portable_avisa_una_vez_fuera_de_su_carpeta`: `fuera_de_portable` al agregar; no al repetir.
- `ruta_de_red` (`cfg(windows)`): `\\srv\c\a.db` y `\\?\UNC\srv\c\a.db` son de red; `C:\a.db` no. Sin confirmar: `pide == "red"`. Confirmado `"red"`: copia a `organizaciones/<id>/organizacion.db`, interna.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml archivo`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Para guardar: `std::path::absolute`. Para comparar: `canonicalize` de ambos. `es_ruta_de_red` mira el `Prefix` (`UNC`, `VerbatimUNC`) de la ruta canónica, con `// shortcut: en Linux y macOS no detecta carpetas montadas; si hace falta, leer /proc/mounts y statfs.`

La copia de red, y la de una base dentro de `datos/` fuera de su lugar, se hace con `VACUUM INTO` desde `solo_lectura_cerrada`. Se pregunta en este orden: `red`, `otro_id`, `tope`. Escribir un `db_id` nuevo: `db::abrir`, `UPDATE meta`, cerrar. La entrada recibe `color_libre`. El diálogo es nuevo, junto a `dialogo` en `comandos.rs:341`.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS (las pruebas de `intercambio` siguen igual).

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: abrir un archivo externo, validado como un .boldo"`

### Task 12: Quitar, eliminar y copias eliminadas

**Visibilidad:** comandos sin interfaz.

**Files:**
- Modify: `src-tauri/src/organizaciones.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`, `src/lib/preferencias.ts`
- Test: `src/lib/preferencias.test.ts`

**Interfaces:**
- Consumes: `Estado::cambiar_a`, `cambiar_a_abierta`, `bloquear`, `solo_lectura_cerrada`, `respaldos::borrar_bd`.
- Produces:
  - `Estado::eliminar(&self, id: &str, guardar_copia: bool, borrar_archivo: bool, migraciones: &[&str]) -> Result<Option<OrganizacionVista>, Fallo>`: `Some` con la base nueva si era la abierta.
  - Comandos: `quitar_organizacion(estado, id)` (error `abierta` si lo es), `eliminar_organizacion(app, id, guardar_copia, borrar_archivo)`, `color_organizacion(estado, id, color)` (exige `#rrggbb`), `listar_eliminadas() -> Vec<EliminadaVista { nombre, organizacion, fecha, bytes }>`, `borrar_eliminada(nombre)`, `restaurar_eliminada(nombre) -> String`
  - `cliente.ts`: `quitarOrganizacion`, `eliminarOrganizacion`, `colorOrganizacion`, `listarEliminadas`, `borrarEliminada`, `restaurarEliminada`
  - `borrarPreferenciasOrg(id: string): void`

- [ ] **Step 1: Escribir las pruebas que fallan**

Cada caso comprueba que **otra** organización y sus respaldos quedan intactos:
- `eliminar_nueva_borra_su_carpeta`.
- `eliminar_boldo_db_borra_archivo_y_respaldos_propios`: `-wal`, `-shm`, `.bloqueo`; un `notas.txt` en `respaldos/` sigue.
- `arrancar_sin_boldo_db_crea_uno_vacio_y_la_proxima_lo_usa`.
- `eliminar_externa_solo_la_saca_y_borra_sus_respaldos`: el archivo sigue.
- `eliminar_externa_con_borrar_archivo_lo_borra`.
- `con_copia_queda_en_organizaciones_eliminadas`: legible, en cada tipo.
- `sin_copia_no_queda_nada`.
- `eliminar_la_abierta_pasa_antes_a_la_mas_reciente`: devuelve `Some`; la borrada ya no abre y la nueva sí.
- `eliminar_la_unica_abierta_en_boldo_db_deja_uno_vacio`: `Some`, vacía y no listada.
- `eliminar_la_abierta_si_la_otra_no_abre_prueba_la_siguiente`.
- `eliminar_lo_que_otra_copia_tiene_abierto_no_borra_nada`: da `abierta_en_otra_copia`, con y sin copia pedida.
- `id_invalido_no_borra_nada`: `..\..\x`.
- `quitar_no_borra_y_rechaza_la_abierta`: código `abierta`.
- `quitada_se_recupera_al_abrir_su_archivo`.
- `restaurar_eliminada_es_organizacion_nueva`: con `db_id` nuevo si el suyo sigue en la lista.
- `borrar_y_restaurar_solo_aceptan_nombres_de_la_lista`: `../boldo.db`, ruta absoluta y `""` dan `desconocido`.
- `color_invalido_se_rechaza`.

TS: `borrarPreferenciasOrg("A")` quita `vista:A` y `minimapa:A`, y deja `vista:B`.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml eliminar`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Orden de `eliminar`: si no es la abierta y se borrará su archivo, `bloquear(bd, ESPERA_CAMBIO)` primero. Si se pide, la copia (`VACUUM INTO` a `organizaciones-eliminadas/<nombre-limpio>_<sello>.db`, con su temporal). Si es la abierta, `cambiar_a` a la más reciente que abra. Si no queda ninguna y es otra, `abrir_base` de `boldo.db`, que puede no estar listado, y `cambiar_a_abierta(…, None)`. Si no queda ninguna y es `boldo.db`: cerrar, borrar y `abrir_base` vacío. Luego soltar el bloqueo y borrar, con `.bloqueo`, que `borrar_bd` no incluye. Carpetas borradas: siempre derivadas de un id validado.

En `respaldos/`, solo los nombres propios (`boldo-*.db`, `antes-migracion-*`).

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml` y `npx vitest run src/lib/preferencias.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: quitar de la lista y eliminar de verdad, con copia opcional"`

### Task 13: `.boldo` como organización nueva

**Visibilidad:** comando sin interfaz.

**Files:**
- Modify: `src-tauri/src/intercambio/mod.rs`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`

**Interfaces:**
- Consumes: `Importacion`, `Sesiones`, `cargar_lista`, `escribir_lista`, `color_libre`.
- Produces:
  - `intercambio::como_nueva(i: &Importacion, r: &Rutas) -> Result<String, Fallo>`: devuelve el id; **no cambia de base**.
  - Comando `importar_como_nueva(app, trabajo: String) -> Result<String, Fallo>`: toma `Estado.lista` durante todo `como_nueva`.
  - `cliente.ts`: `importarComoNueva(trabajo: string): Promise<string>`

- [ ] **Step 1: Escribir las pruebas que fallan**

- `como_nueva_genera_db_id_y_conserva_el_origen`: `db_id` válido y distinto, `origen_db_id` igual al de la base de origen, sin `alcance` ni `raices`.
- `importar_dos_veces_da_dos_organizaciones`.
- `archivo_parcial_se_puede_importar_como_nueva`.
- `archivo_de_esquema_anterior_queda_al_dia`.
- `no_toca_la_base_abierta_ni_usa_boldo_db_vacio`.
- `sin_espacio_o_falla_no_deja_carpeta_ni_entrada`: `organizaciones.json` convertido en carpeta.
- `la_nueva_se_puede_abrir_y_exportar`: `cambiar_a` y `alcance::copiar`.

- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml como_nueva`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Con `abrir_no_confiable(READ_WRITE)` sobre el temporal: `DELETE` de lo que no esté en `META_CONOCIDAS` ni sea `origen_db_id`, y `db_id` nuevo. Copia a `organizaciones/<id>/boldo-nueva.db.tmp` (lo limpia `limpiar_parciales`) y renombra a `organizacion.db`.

- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Importar: un .boldo como organización nueva"`

### Task 14: Cambio de organización en TS

**Visibilidad:** sin efecto con una sola organización.

**Files:**
- Create: `src/stores/organizaciones.ts`, `src/stores/organizaciones.test.ts`
- Modify: `src/features/pestanas/usePestanas.ts`, `src/features/pestanas/pestanas.ts`, `src/stores/organizacion.ts`, `src/features/arbol/useLienzo.ts`, `src/features/trabajadores/useFicha.ts`, `src/features/trabajadores/FichaTrabajador.vue`, `src/features/puestos/usePuesto.ts`, `src/features/respaldos/respaldos.ts`, `src/app/ventana.ts`, `src/App.vue` (`RouterView` del área central), `src/main.ts`, `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs`, `src/db/cliente.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/features/pestanas/usePestanas.test.ts`, `src/features/pestanas/pestanas.test.ts`, `src/stores/organizacion.test.ts`, `src/features/respaldos/respaldoAutomatico.test.ts`, `src/features/arbol/useLienzo.test.ts`

**Interfaces:**
- Consumes: todo `cliente.ts` de las Tasks 7 a 13, `colaVacia`, `fijarBase`, `marcarCambio`, `soltarDatos`, `alSoltarDatos`, `BaseCambiada`, `borrarPreferenciasOrg`, `trabajos`.
- Produces, en `useOrganizaciones` (todas las acciones devuelven `Resultado` y no lanzan):
  - `lista: Ref<Organizacion[]>`, `recientes: ComputedRef<Organizacion[]>` (por `abierta`, hasta 8), `cambiando: Ref<boolean>`, `sinAbrir: Ref<Map<string, { codigo: string; mensaje: string }>>` (por id de pestaña)
  - `cargarLista()`, `abrir(id: string)`, `activarPestana(id: string)`, `crear(tipo: "vacia" | "ejemplo", datos?)`, `explorarEjemplo()`, `quitar(id)`, `eliminar(id, opciones: { guardarCopia: boolean; borrarArchivo: boolean })`, `cambiarColor(id, color)`
  - `agregarArchivo(confirmar: (motivo: "red" | "otro_id" | "tope") => Promise<boolean>, buscando?: string): Promise<Resultado & { avisos?: string[] }>`: la pregunta y los avisos los muestra quien llama; pregunta hasta que Rust no pida más.
- Produces, en otros:
  - `useOrganizacion().soltar(): void`: `ultimaCarga++` y limpia `ultimoBorrado`, `fechaVista`, `historico`, `estiloCopiado`, `cambios`
  - `useFicha().puedeSoltar(): Promise<boolean>`
  - `usePestanas().validarActivada(id: string): void`; `ir` pasa a despachar: si `p.org !== baseActual()`, anota `pedida = id` y llama a `useOrganizaciones().activarPestana(id)`; `siguiente` cuenta desde `pedida ?? destino?.id ?? activa`; `pedida` se borra al terminar el cambio, salga bien o mal
  - `usePestanas().marcarActiva(id: string): void`: activa sin navegar; mientras la activa sea de otra organización, `afterEach` no anota rutas en ella
  - `usePestanas().cerrarDeOrganizacion(org: string): void`, con `P.sinOrganizacion(m, org, nuevoId, orgAbierta): Pestanas`: si no queda ninguna, una de la abierta en `/`. Sin tope de «la última no se cierra»
  - `useLienzo.ts`: `reiniciarLienzo(): void`, que vacía `colapsados`, `seleccion`, `multi`, `editando`, `centrarEn`, `pedidoZoom`, `pestanaPanel`, `ramaPersonas`, `puestoUbicado`, `enfocar` y `avisoExpansion`, y `ventanaConexion` si ya entró `conexiones-editables`; si no, lo agrega esa rama. `pedidoEliminar` es un contador y no se toca
  - `ventana.ts`: exporta `soltarEdicion`
  - Comando `sincronizar_organizacion(app, base_id) -> Result<(), Fallo>`: lee `meta.org_nombre` de la base y actualiza la lista. En `cliente.ts`: `sincronizarOrganizacion(): Promise<void>`, por `conBase`

- [ ] **Step 1: Escribir las pruebas que fallan**

Con `vi.mock("@/db/cliente")`:
- «espera la cola de lotes antes de abrir»: orden `colaVacia`, `abrirOrganizacion`.
- «con un trabajo en curso avisa y no cambia»: `ok: false`, sin `abrirOrganizacion`.
- «la ficha con cambios y Cancelar no cambia».
- «un error del archivo muestra el motivo en la pestaña y no cambia la base»: `no_encontrado`, `desconocido` y `migracion` dejan `sinAbrir`, la pestaña activa con `marcarActiva` y `baseActual()` igual.
- «un error pasajero se queda en la pestaña actual»: `trabajo_en_curso`: `ok: false`, sin `sinAbrir`.
- «al abrir: `fijarBase`, luego `soltarDatos`, luego `org.cargar`»: por orden de llamadas.
- «si `org.cargar` falla tras cambiar, `sinAbrir` lleva su mensaje».
- «durante el cambio `cambiando` y `enCambio()` son true y la vista se desmonta antes de abrir; con error, ambos vuelven a false».
- «`performance.measure` recibe `{ start }`, tomado tras el paso 2».
- «Ctrl+Tab dos veces entre organizaciones avanza dos pestañas»: por `siguiente`.
- «cerrar la última pestaña de la abierta hacia otra organización: si el cambio falla, la pestaña sigue en la lista y activa».
- «con la frecuencia `abrir`, respalda la primera vez por organización y no al volver a ella».
- «dos cambios seguidos terminan en el último y nunca a la vez» (Review Focus 2): A a B a C con `abrirOrganizacion` pendiente; nunca dos en curso; base final C.
- «una pestaña de la otra organización se activa y, sin ninguna, se abre una nueva».
- «con el tope de pestañas no cambia de base»: `MAX_PESTANAS`.
- «la ruta que no existe en la organización abierta vuelve a `/`» (`validarActivada`).
- «`recientes` ordena por `abierta` y corta en 8».
- «`crear` valida el nombre sin llamar a Rust», usando `store.nombreVacio`.
- «`eliminar` de la abierta pasa por el cambio y cierra sus pestañas; de otra, las cierra sin cambiar de base; si es la última, queda una de la abierta en `/`».
- «`eliminar` borra las preferencias si salió bien; si falla, no borra ni preferencias ni pestañas».
- «`explorarEjemplo` abre el de la lista; sin él, lo crea con `ejemplo: true`».
- «`crear` con datos no vacía la base»: `crearOrganizacionNueva` y luego `abrirOrganizacion`; ningún `lote` y ningún `respaldar`.
- «`agregarArchivo` con `pide: "red"` llama a `confirmar` y, con true, sigue y abre; con false, no cambia nada»; igual con `"tope"`.
- «`agregarArchivo` devuelve los avisos `copia` y `fuera_de_portable`».
- En `respaldoAutomatico.test.ts`: «`BaseCambiada` no avisa ni posterga el respaldo».
- En `organizacion.test.ts`: «`BaseCambiada` no pone `error`».
- En `useLienzo.test.ts`: «`reiniciarLienzo` deja vacío cada ref con ids».
- En `pestanas.test.ts`: «`sinOrganizacion` quita las suyas y, si no queda ninguna, deja una de la abierta en `/`».

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/stores/organizaciones.test.ts src/stores/organizacion.test.ts src/features/pestanas src/features/arbol/useLienzo.test.ts src/features/respaldos/respaldoAutomatico.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar el cambio, en este orden**

```text
1. Si useFicha().puedeSoltar() es false, termina. soltarEdicion(); espera org.guardando hasta 2 s.
2. Si trabajos.value.length > 0, { ok: false, mensaje }.
3. t0 = performance.now(). await colaVacia(). marcarCambio(true); cambiando = true; await nextTick(): la vista se desmonta y guarda su estado.
4. abrirOrganizacion(id).
   Error del archivo: sinAbrir, marcarActiva, { ok: true }. Pasajero: { ok: false, mensaje }. En ambos: marcarCambio(false); cambiando = false y fin.
5. fijarBase(o.id); marcarCambio(false); soltarDatos(); await org.cargar().
   Si falla: sinAbrir con su mensaje, marcarActiva. Si no: borra su sinAbrir; validarActivada; ir a la pestaña. cambiando = false.
6. performance.measure("cambio-organizacion", { start: t0 }); void respaldoAutomatico(primera vez de esta organización en la sesión); void cargarLista().
```

Sin atajo «ya es la abierta» en TS: tras `crear` en un `boldo.db` abierto, Rust no reabre, pero el paso 5 igual recarga.

`eliminar`, tras `eliminarOrganizacion` correcto: si devolvió otra base, el paso 5 con ella y a Inicio; luego `cerrarDeOrganizacion(id)` y `borrarPreferenciasOrg(id)`. `usePestanas.cerrar`: si la nueva activa es de otra organización, primero el cambio, y la pestaña se quita solo si salió bien.

Un solo cambio a la vez: si llega otro mientras tanto, se recuerda el último pedido y corre al terminar. `usePestanas.ir` muestra con `toast` el `mensaje` que reciba.

Registran `alSoltarDatos`: `org.soltar`, `reiniciarLienzo`, cierre de ficha y puesto. `App.vue`: con `cambiando`, indicador `role="status"` en vez de la vista. `main.ts`: si hay `info.avisoInicio`, se muestra el aviso en Inicio. Un `watch` sobre `org.org.nombre` llama a `sincronizarOrganizacion`. `respaldoAutomatico`: ignora `BaseCambiada`. `fallo()` del store: con `BaseCambiada`, devuelve `{ ok: false, mensaje: "" }` sin tocar `error`. Claves `organizaciones.pideRed`, `pideOtroId` y `pideTope`; esta última dice que el archivo pesa más de 512 MiB y que puede tardar en abrir y ocupar más memoria, con **Abrir igual** y **Cancelar**. Se agregan en es y en las claves `respaldos.error.<codigo>` que falten de Global Constraints, y `organizaciones.ejemplo`.

- [ ] **Step 4: Comprobar que pasan.** Run: `npm test` y `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Organizaciones: cambiar de base desde TS, en orden y sin mezclas"`

### Task 15: Pestañas en pantalla; menú y paleta

**Visibilidad:** la barra solo cambia con dos organizaciones; menú y paleta tras la bandera.

**Files:**
- Create: `src/features/pestanas/PestanaSinAbrir.vue`
- Modify: `src/app/proximamente.ts`, `src/features/pestanas/BarraPestanas.vue`, `src/features/pestanas/pestanas.ts`, `src/App.vue`, `src/features/proyecto/menuApp.ts`, `src/features/proyecto/MenuApp.vue`, `src/components/PaletaComandos.vue`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/features/pestanas/pestanas.test.ts`, `src/features/proyecto/menuApp.test.ts` (nuevo)

**Interfaces:**
- Consumes: `useOrganizaciones` (Task 14).
- Produces:
  - `export const ORGANIZACIONES_VISIBLES: boolean = false` en `proximamente.ts`
  - `P.hayVariasOrganizaciones(m: Pestanas): boolean`
  - `entradasAbrirOtra(recientes: Organizacion[], activa: string): { id: string; nombre: string }[]`, en `menuApp.ts`: sin la abierta.

- [ ] **Step 1: Escribir las pruebas que fallan**

- «con todas de la misma organización no hay etiqueta» (`hayVariasOrganizaciones` false).
- «con dos, sí».
- «`entradasAbrirOtra` no ofrece la abierta y respeta el orden».

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/pestanas/pestanas.test.ts src/features/proyecto`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`BarraPestanas`: con varias organizaciones, un punto de color `aria-hidden` y el nombre de la organización en el texto y en `title`. El color nunca es la única señal.

`PestanaSinAbrir`: motivo (`mensajeFallo`), detalle seleccionable y copiable; **Buscar archivo** (`no_encontrado`, `otro_id`), **Buscar actualizaciones** (`esquema_nuevo`) y **Cerrar pestaña**. **Buscar archivo** hace sus preguntas con `AlertDialog`. `App.vue`: con `sinAbrir` en la activa, lo muestra en vez de la vista.

Menú y paleta: **Abrir otra organización…**, con las recientes; cada una llama a `organizaciones.abrir(id)`. Van con `v-if` de la bandera, sin prueba de la constante: `entradasAbrirOtra` ya recibe lo que usa.

- [ ] **Step 4: Comprobar que pasan.** Run: el del Step 2 y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src`; `git commit -m "Organizaciones: pestañas con nombre y color; abrir otra desde el menú"`

### Task 16: Configuración › Organizaciones

**Visibilidad:** tras la bandera.

**Files:**
- Create: `src/features/organizaciones/SeccionOrganizaciones.vue`, `src/features/organizaciones/DialogoEliminarOrganizacion.vue`, `src/features/organizaciones/eliminar.ts`, `src/features/organizaciones/eliminar.test.ts`, `src/features/organizaciones/paleta.ts`
- Modify: `src/vistas/VistaConfiguracion.vue`, `src/i18n/es.json`, `src/i18n/en.json`, `src-tauri/src/organizaciones.rs` (prueba)

**Interfaces:**
- Consumes: `useOrganizaciones`, `listarEliminadas`, `borrarEliminada`, `restaurarEliminada`, `tamano` (`lib/formato`).
- Produces:
  - `textoAConfirmar(o: Organizacion, sinNombre: string): string`
  - `confirmaEliminar(escrito: string, esperado: string): boolean`
  - `espacioQueLibera(o: Organizacion, borrarArchivo: boolean): number`
  - `pestanasDe(lista: Pestana[], id: string): number`: solo informa.
  - `paleta.ts`: `PALETA: readonly { color: string; nombre: string }[]`, los 8 valores de la Task 7, con `nombre` como clave de i18n.

- [ ] **Step 1: Escribir las pruebas que fallan**

- (Review Focus 3) «sin nombre se confirma con el texto que se muestra»: `textoAConfirmar({nombre: ""}, "Sin nombre") === "Sin nombre"`.
- «con tildes y espacios»: `confirmaEliminar("  Compañía  Ñandú ", "Compañía Ñandú")` true; `"compania ñandu"` false (coincide salvo espacios en los extremos y repetidos).
- «la misma palabra en NFD confirma»: `confirmaEliminar("Ñandú".normalize("NFD"), "Ñandú")` true.
- «otro nombre no confirma».
- «interna: libera base y respaldos, con cualquier valor de `borrarArchivo`».
- «externa: sin borrar el archivo libera solo los respaldos; borrándolo, también la base».
- «cuenta las pestañas de la organización».
- Rust, `paleta_de_ts_coincide`: con `include_str!`, `paleta.ts` contiene cada valor de `PALETA`, y son 8.

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/organizaciones` y `cargo test --manifest-path src-tauri/Cargo.toml paleta`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Sección con `id="cfg-organizaciones"`: nombre, color (`PALETA`, con su nombre accesible), ruta, espacio de base y respaldos, **Quitar de la lista** (deshabilitado en la abierta, con el motivo) y **Eliminar**.

Diálogo: escribir el nombre (`confirmaEliminar` normaliza a NFC los dos lados); espacio que libera; **Guardar una copia antes**, marcada por defecto y, desmarcada, el aviso de que no se puede recuperar; en externa, por defecto solo sale de la lista y hay una casilla aparte con la ruta a la vista; con pestañas abiertas, dice cuántas y que al confirmar se cierran.

Lista de `organizaciones-eliminadas/` con tamaño, **Borrar** y **Restaurar como organización nueva**. Acciones destructivas con `AlertDialog`.

- [ ] **Step 4: Comprobar que pasan.** Run: el del Step 2 y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Configuración: organizaciones, espacio que ocupan y eliminar"`

### Task 17: Importar, barra superior y bandeja

**Visibilidad:** tras la bandera.

**Files:**
- Modify: `src/features/intercambio/PanelImportar.vue:93,100,380-405`, `src/features/intercambio/intercambio.ts`, `src/components/BarraSuperior.vue:33`, `src/features/proyecto/DatosProyecto.vue:68`, `src/lib/trabajos.ts`, `src/features/respaldos/respaldos.ts`, `src/features/respaldos/SeccionRespaldos.vue:80`, `src/features/configuracion/SeccionFotos.vue:74`, `src/features/intercambio/PanelExportar.vue`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/features/intercambio/intercambio.test.ts`, `src/lib/trabajos.test.ts`

**Interfaces:**
- Consumes: `importarComoNueva`, `useOrganizaciones`.
- Produces:
  - `modoInicial(r: ResumenImportacion, conNueva: boolean): "nueva" | "agregar" | "revisar" | "reemplazar"`
  - `conOrganizacion(nombreTrabajo: string, organizacion: string, varias: boolean): string`, en `trabajos.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

- «con la bandera, «Como organización nueva» es el primero, también con un parcial».
- «`modoInicial(r, false)`, igual que hoy»: los tres casos de la línea 93.
- «con una sola organización, el trabajo se nombra como hoy».
- «con varias, nombra la organización».

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/intercambio/intercambio.test.ts src/lib/trabajos.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`PanelImportar`: `modo` «nueva» primero y recomendado; los otros tres nombran la organización abierta (`{nombre}`). Al aplicar: `importarComoNueva`, luego `await trabajo.soltar()` (si no, Rust ve la sesión ocupada) y luego `organizaciones.abrir(id)`.

Tras la bandera: `BarraSuperior` y `DatosProyecto` cambian la insignia por color y nombre. `DatosProyecto` ya muestra la ruta de la abierta (Task 4). Los trabajos de respaldar, restaurar, optimizar, exportar e importar usan `conOrganizacion`; actualizar no: no es de una organización. El aviso de `respaldos.automaticoFallo` también la nombra.

- [ ] **Step 4: Comprobar que pasan.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src`; `git commit -m "Importar como organización nueva; barra superior y bandeja nombran la organización"`

### Task 18: Inicio nuevo; se retira lo viejo; sin bandera

**Visibilidad:** **visible. Es el interruptor de la entrega.**

**Files:**
- Modify: `src/vistas/VistaBienvenida.vue`, `src/features/inicio/RecientesInicio.vue`, `src/features/inicio/ListaCaminos.vue`, `src/features/inicio/recientes.ts` (queda solo `hace`), `src/features/inicio/recientes.test.ts`, `src/main.ts` (`useRecientes`), `src/db/cliente.ts` (quita `respaldarAntesDeReemplazar`, `alReemplazarBase` y `vaciarRecientes`), `src/stores/organizacion.ts` (quita `reemplazarCon`, `cargarEjemplo`, `crearOrganizacion`), `src/stores/organizacion.test.ts` (sus bloques), `src/db/repos/reemplazo.ts`, `src/db/repos/reemplazo.test.ts`, `src/features/respaldos/respaldos.ts` (`conRespaldoPrevio`), `src/features/respaldos/respaldos.test.ts`, `src-tauri/src/comandos.rs` (`respaldar_antes_de_reemplazar`), `src-tauri/src/lib.rs` (su registro), `src-tauri/src/respaldos.rs` (`respaldar_antes_de_reemplazar`), `src/app/proximamente.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Modify, para quitar la bandera: `src/features/proyecto/menuApp.ts`, `src/features/proyecto/MenuApp.vue`, `src/components/PaletaComandos.vue`, `src/vistas/VistaConfiguracion.vue`, `src/features/intercambio/PanelImportar.vue`, `src/features/intercambio/intercambio.ts`, `src/features/intercambio/intercambio.test.ts`, `src/components/BarraSuperior.vue`, `src/features/proyecto/DatosProyecto.vue`
- Delete: `src/features/inicio/useRecientes.ts`, `src/features/inicio/useRecientes.test.ts`

**Interfaces:**
- Consumes: `useOrganizaciones` (`recientes`, `abrir`, `crear`, `explorarEjemplo`, `agregarArchivo`, `quitar`, `eliminar`), `DialogoEliminarOrganizacion`.
- Produces: `ORGANIZACIONES_VISIBLES` deja de existir, con todos sus `v-if`. `modoInicial(r: ResumenImportacion): "nueva" | "agregar" | "revisar" | "reemplazar"`, sin `conNueva`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `intercambio.test.ts`: `modoInicial(r)` da `"nueva"`, también con un parcial; se borran las pruebas de `modoInicial(r, false)`.

Se borran los bloques de `reemplazarCon`, `cargarEjemplo` y `crearOrganizacion`, y las pruebas de `conRespaldoPrevio`. `respaldos.rs`: las pruebas que usaban `respaldar_antes_de_reemplazar` pasan a `volcar(conn, dir, PREFIJO_REEMPLAZO, sello)`: `boldo-antes-de-reemplazar-` sigue para importar, y `listar` lo marca igual.

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/intercambio/intercambio.test.ts`. Expected: FAIL. El resto de las pruebas del cambio ya está en la Task 14.

- [ ] **Step 3: Implementar**

**«Abierto recientemente»:** logo o inicial, nombre, color y fecha de apertura, hasta 8. Un clic abre. Menú de cada entrada: **Quitar de la lista**, **Eliminar organización**. Si el archivo no está, lo dice y ofrece **Buscar archivo** o **Quitar de la lista**.

**Botones siempre visibles:** **Crear organización**, **Abrir archivo…**, **Explorar el ejemplo**. Sin datos, los caminos de hoy. `?accion=vacia|ejemplo` sigue funcionando. `VistaBienvenida` hace las preguntas de `agregarArchivo` y muestra sus avisos.

En los archivos de la bandera se quitan sus `v-if` y `conNueva`. Se quitan el bloque «Empezar de nuevo», el `AlertDialog` de reemplazar, `hayDatos` como guardia y las claves `bienvenida.reemplazar*`, `bienvenida.hayDatos`, `inicio.empezarDeNuevo`, `inicio.recientesBorrada`, `inicio.borrarRecientes`, `proyecto.principal` en es y en. Comando y `respaldarAntesDeReemplazar` fuera. `vaciarOrganizacion` fuera; `TIPOS_SEMILLA` se queda.

**Comprobar lo retirado:**

Run: `graphify query "reemplazarCon respaldarAntesDeReemplazar useRecientes"`, y luego buscar esos tres nombres más `conRespaldoPrevio` y `ORGANIZACIONES_VISIBLES` en `src` y `src-tauri/src`.
Expected: sin coincidencias, salvo `reemplazar_antes_respaldando`, que sigue.

- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck`, `npm run lint`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src src-tauri/src`; `git commit -m "Inicio: varias organizaciones; crear ya no reemplaza los datos"`

### Task 19: Ayuda, novedades, sitio y spec principal

**Visibilidad:** **visible.**

**Files:**
- Create: `ayuda/es/organizaciones.md`, `ayuda/en/organizaciones.md`
- Modify: `ayuda/orden.json`, `src/vistas/VistaAyuda.vue:58-71` (icono), `ayuda/{es,en}/inicio.md` (líneas 34, 36, 40, 65, 75 de `es` y sus equivalentes), `ayuda/{es,en}/respaldos.md` (sección «Antes de reemplazar los datos», línea 35), `ayuda/{es,en}/exportar-importar.md`, `ayuda/{es,en}/pestanas.md`, `site/novedades.json`, `site/index.md`, `site/en/index.md`, `site/.vitepress/theme/Presentacion.vue`, `site/scripts/novedades.test.mjs`, `docs/superpowers/specs/2026-10-28-boldo-atlas-design.md:224,229,237,238,239,254,256`

**Interfaces:**
- Consumes: pantallas de las Tasks 15 a 18.

- [ ] **Step 1: Escribir la ayuda**

`organizaciones.md`, misma estructura en los dos idiomas: qué es; **Crear**, **Abrir archivo…** y el ejemplo; pestañas de varias organizaciones; qué se guarda aparte; archivos externos, con red y portable; quitar y eliminar; errores. Título para el ancla: `## Abrir y cambiar` / `## Open and switch`. En `inicio.md` se reescribe lo de reemplazar y **Principal**; en `respaldos.md`, «Antes de reemplazar» queda solo para importar.

- [ ] **Step 2: Agregar la novedad al inicio de `site/novedades.json`**

```json
{
  "id": "varias-organizaciones",
  "pagina": "organizaciones",
  "es": {
    "titulo": "Varias organizaciones, cada una en lo suyo",
    "texto": "Abre varias organizaciones y pasa de una a otra con sus pestañas. Cada una guarda aparte sus datos, fotos, respaldos y preferencias: nada de una llega a otra. Inicio muestra las que abriste hace poco, y crear una nueva no toca las demás.",
    "ancla": "abrir-y-cambiar"
  },
  "en": {
    "titulo": "Several organizations, each on its own",
    "texto": "Open several organizations and move between them with their tabs. Each keeps its data, photos, backups and preferences apart: nothing from one reaches another. Home shows the ones you opened recently, and creating a new one does not touch the others.",
    "ancla": "open-and-switch"
  }
}
```

Si la portada describe «una organización», se ajusta en `site/index.md`, `site/en/index.md` y `Presentacion.vue`; con `sitio-mejoras` fusionada, se mira también `site/comparador.json`.

Si `novedades.test.mjs` trae en `PROHIBIDO` `varias organizaciones` y `(several|multiple) organizations` (llegan con `sitio-mejoras`), se quitan de la expresión y de su comentario: la función ya existe.

- [ ] **Step 3: Actualizar la spec principal**

- Línea 224: quita «si no es la base principal»; la barra muestra color y nombre de la organización.
- Línea 237: quita «principal o escenario»; remite a la spec de varias organizaciones; los escenarios serán organizaciones derivadas.
- Líneas 229, 238, 239, 254, 256: una nota «Reemplazado por `2026-11-02-varias-organizaciones-design.md`».

- [ ] **Step 4: Comprobar y hacer commit**

Run: `npx vitest run src/i18n/ayuda.test.ts` y `node --test site/scripts/novedades.test.mjs site/scripts/masReciente.test.mjs`
Expected: PASS (mismos títulos en los dos idiomas, anclas válidas, sin versiones ni «próximamente»).

```bash
git add ayuda site src/vistas/VistaAyuda.vue docs/superpowers/specs/2026-10-28-boldo-atlas-design.md
git commit -m "Ayuda y sitio: varias organizaciones"
```

### Task 20: Arnés de migración y medición

**Visibilidad:** solo las capturas nuevas de la ayuda; **puerta del PR 7: no se fusiona sin esto.**

**Files:**
- Create: `scripts/arnes-organizaciones.mjs` (solo desarrollo; la app no lo importa)
- Modify: `scripts/sembrar-grande.mjs` (opción `--fotos N`), `ayuda/img/{es,en}/inicio-{organizacion,menu,proyecto}.webp`, `ayuda/{es,en}/inicio.md` (`alt`, `width`, `height`), `site/novedades.json` (solo si no se puede rehacer `inicio-organizacion`)

**Interfaces:**
- Consumes: la portable de Windows de `node scripts/release.mjs --solo-portable --perfil prueba`; el último `BoldoAtlas_windows_x64_portable.zip` publicado; `performance.measure("cambio-organizacion")` (Task 14).

- [ ] **Step 1: Escribir el arnés**

Node, con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<puerto libre>` y `WebSocket` global para evaluar en la página. Reglas: todo bajo una carpeta nueva de `os.tmpdir()`; ventana con `Start-Process -WindowStyle Minimized`; se cierra por PID en `finally`. **Antes de escribir nada en la página, lee `info_app` y aborta si `rutaBd` no está en el temporal.**

- [ ] **Step 2: Migración**

Descomprime la portable publicada; la abre; siembra por la página `boldo:vista`, `boldo:directorio`, `boldo:plegado:x`, `boldo:pestanas:<rutaBd>` (dos pestañas); agrega datos en `datos/boldo.db`, con una persona con foto. Cierra. Copia encima el exe nuevo. Abre.

Comprueba: mismo `boldo.db` con sus filas; `respaldos/` intacto; una entrada en la lista; cada preferencia en `…:<db_id>` y la antigua sin cambios; `boldo:plegado:x` sin copia; dos pestañas con `org`; `foto` responde con la base y da 404 con otra.

- [ ] **Step 3: Medición**

Portable limpia con `sembrar-grande.mjs <temp>/datos/boldo.db --fotos 1000` (la opción agrega 1.000 fotos válidas) y una segunda organización chica. Fija `boldo:respaldos` en `"nunca"`, para que un respaldo no frene la alternancia. Alterna 10 veces y lee `performance.getEntriesByName("cambio-organizacion")`.
Expected: mediana menor a 1000 ms. Si no se cumple, se informa con los números en el PR y **se pregunta al autor**: no se baja la meta ni se fusiona en silencio.

- [ ] **Step 4: Rehacer las capturas**

Run: `node scripts/arnes-organizaciones.mjs --capturas`, tras avisar al autor (decisión 33). Solo datos de ejemplo y carpeta temporal. Ventana normal, movida fuera de la pantalla con `SetWindowPos`, y `Page.captureScreenshot`. Actualiza `alt`, `width` y `height` en `inicio.md`, es y en.
Expected: las tres `.webp` nuevas en cada idioma y `npx vitest run src/i18n/ayuda.test.ts` en verde. Si no se puede, se quita la imagen de la ayuda y se avisa en el PR; si es `inicio-organizacion`, se quitan también `imagen` y `alt` de la novedad `inicio-con-resumen`.

- [ ] **Step 5: Probar el arnés y hacer commit**

Run: `node scripts/arnes-organizaciones.mjs`
Expected: salida `migración: ok` y `cambio: <n> ms`. Se pega en el PR 7.

Con la build del PR 7 se revisa además, en la misma carpeta temporal: restaurar un respaldo vuelve a la organización abierta; exportar e importar un `.boldo` en los cuatro modos; la portable no deja archivos fuera de su carpeta, salvo el `-wal`, `-shm` y `.bloqueo` junto a un externo elegido.

```bash
git add scripts/arnes-organizaciones.mjs scripts/sembrar-grande.mjs ayuda site/novedades.json
git commit -m "Arnés: migración desde la versión publicada y tiempo de cambio"
```
