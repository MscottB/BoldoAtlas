# Varias organizaciones, entrega 2 (Comparar): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comparar la organización abierta con otra de la lista y ver qué unidades, personas y puestos están solo en una o difieren, sin escribir nada en la otra.

**Architecture:** Rust copia la otra organización a un temporal desde una conexión de solo lectura, la migra si es más antigua y, si no comparten origen, le reescribe los ids según nombre de unidad y correo. Después la compara por `id` con `intercambio/comparar.rs`, como la importación, y guarda el resultado en un estado propio (`Comparaciones`), aparte de `Sesiones`. La interfaz pide resumen, páginas y el detalle de una fila. La otra nunca pasa a ser la base abierta.

**Tech Stack:** Tauri 2, Rust (rusqlite), Vue 3, Pinia, vue-i18n, Vitest, node:sqlite en el arnés.

**Spec:** `docs/superpowers/specs/2026-11-02-varias-organizaciones-design.md`, sección «Entrega 2: Comparar», más «Pruebas». Sigue a `docs/superpowers/plans/2026-11-02-varias-organizaciones.md` (entrega 1, ya publicada).

## Decisiones tomadas al planificar

La spec choca con el código o queda ambigua en estos puntos. **[VISIBLE]** cambia algo que el autor verá.

1. **[VISIBLE] Dónde está «Comparar con…».** En el menú de cada tarjeta de Inicio (`RecientesInicio.vue`), salvo la de la abierta, la entrada es **Comparar con la abierta**: compara esa organización con la que está abierta. En la paleta hay una entrada por organización, **Comparar con «<nombre>»**, como las de «Abrir otra organización». Siempre se compara la abierta con otra; no hay selector aparte.
2. **[VISIBLE] Siempre se copia a un temporal.** La spec copia solo si el esquema es más antiguo. Copiar siempre da una sola foto de la otra: lo que se ve en el resumen y en el detalle es lo mismo aunque otra copia de la app la esté editando. Además nunca quedan `-wal` ni `-shm` junto a un archivo externo. El costo es espacio en `datos/` mientras la comparación está abierta: el tamaño de la otra organización.
3. **Qué es «comparten origen».** Las dos se relacionan si el `db_id` de una es el `origen_db_id` de la otra, o si las dos tienen el mismo `origen_db_id`. Hoy `origen_db_id` lo escribe solo **Importar › Como organización nueva** (`intercambio/mod.rs:459`). Dos organizaciones creadas por separado, aunque las dos vengan de **Explorar el ejemplo**, se comparan en modo aproximado.
4. **[VISIBLE] Coincidencia aproximada.** Primero se emparejan las filas que tienen el mismo `id` en las dos (por ejemplo, los catálogos sembrados). Lo que queda se empareja así:
   - **Unidades:** por la ruta de nombres desde la raíz, normalizada con `fusion::normalizar_nombre` (`Gerencia/Finanzas`). Lo que sobra, por nombre solo si ese nombre es único en las dos.
   - **Personas:** por correo, sin mayúsculas ni espacios. Sin correo, o con un correo repetido en esa organización, no se emparejan. El resumen dice cuántas quedaron sin correo.
   - **Puestos:** por la unidad emparejada más el nombre del cargo. Si hay varios iguales, se emparejan en orden de `id`. La spec no dice cómo emparejar puestos; esta regla es la más simple que no cruza unidades.
5. **[VISIBLE] Una persona cambiada de puesto difiere.** `comparar` deja las asignaciones como una tabla aparte, pero al autor le importa «Juan está en otro puesto». Una persona que está en las dos difiere también si sus puestos vigentes no son los mismos, y su detalle los muestra en cada lado. Las asignaciones no salen como filas propias.
6. **[VISIBLE] Qué cuenta como «solo en una».** Una fila borrada en un lado y viva en el otro cuenta como «solo en» la que la tiene viva. Un `DuplicadoPersona` (otro `id`, mismo correo) en modo por `id` cuenta como dos filas, una en cada lado: la spec pide comparar por `id` cuando comparten origen. Los catálogos se comparan para no ver como diferencia un cargo con el mismo nombre, pero no salen en el resumen.
7. **[VISIBLE] Una comparación a la vez.** Comparar de nuevo, con la misma o con otra, reemplaza la anterior y borra su temporal. Cambiar de organización, cerrar la vista o cerrar la app también la sueltan.
8. **No pasa por `Sesiones`.** `Sesiones::empezar` suelta cualquier importación en curso, y `ocupada()` frenaría el cambio de organización mientras la vista siga abierta. La comparación tiene su estado propio, `Comparaciones`, con su marca de cancelado. Mientras calcula tiene `conn` tomado, igual que `importar_comparar`, así que un cambio de organización recibe `trabajo_en_curso`. En TS va por `intentarTrabajo`, como la importación.
9. **Migrar el temporal sin el tope de 512 MiB.** `validar::migrar_copia` vuelve a revisar con `revisar`, y eso rechaza una organización propia con muchas fotos. Se separa la parte que migra en `migrar_temporal`; `migrar_copia` la usa y sigue igual.
10. **[VISIBLE] Meta de tiempo.** La spec no la fija. Se propone: menos de 5 s en cada modo con la organización grande (10.000 personas, 1.000 fotos), medido en la portable. Si no se cumple, se informa con los números y se pregunta al autor.
11. **Una sola entrega y un PR con `version:menor`.** Son 6 tareas sin bandera: el PR publica 0.2.0. La vista no se fusiona sin su ayuda y su novedad.
12. **Sin capturas nuevas en la ayuda.** La sección nueva de la ayuda va sin imagen. Una captura hecha a mano no se agrega; si el autor quiere una, se hace con el arnés en otra entrega.

**Comprobado en el código, sin sorpresas:** `comparar::comparar` recorre las dos bases por `id` sin cargarlas y salta lo que solo está en la local (`comparar.rs:592`). `validar::solo_lectura_cerrada` abre en solo lectura sin dejar archivos al lado, y `organizaciones::copiar_a_carpeta` ya copia con `VACUUM INTO` desde esa conexión. `Temporal` se borra al soltarse, y `respaldos::limpiar_parciales` borra los `boldo-*.db.tmp` que queden tras un cierre de golpe. `revision.rs` ya tiene `nombre_en`, `valor_campo` y `fecha_mostrable`, que muestran una referencia por su nombre. `entradasAbrirOtra` (`menuApp.ts:44`) da las organizaciones que no son la abierta. `site/comparador.json` no tiene filas sobre organizaciones.

## Global Constraints

- La otra organización se lee por una conexión con `SQLITE_OPEN_READ_ONLY` y `PRAGMA query_only=ON`, sin `bloquear`, sin `anotar_abierta` y sin cambiar `Estado.base`. Ningún comando escribe por ella. El original no cambia: mismo contenido y misma fecha de modificación.
- Lo que se escribe (migrar, reescribir ids) se escribe solo en el temporal `Temporal::nuevo(&rutas.datos, "comparar")`.
- La otra se valida antes de copiarla, como al abrirla (`abrir_entrada`): archivo presente (`no_encontrado`), `version_y_esquema` (`esquema_nuevo`, `danado`, `contenido_invalido`) y su `db_id` igual al de la entrada (`otro_id`). Comparar una organización consigo misma da `misma`.
- Códigos de error nuevos: `misma`, `comparacion_vencida`. Se traducen en `respaldos.error.<codigo>`, es y en.
- Todo comando de comparación que mira la base abierta lleva `base_id` y pasa por `con_conexion`.
- Resumen, páginas y detalle: solo `unidades`, `trabajadores` y `puestos`. Páginas de hasta `MAX_PAGINA` (200).
- Textos de interfaz en es y en: «Comparar con la abierta», «Comparar con «{nombre}»», «Solo en {nombre}», «Difieren», «Coincidencia aproximada». En `site/novedades.json`, nada de versiones, fases ni «próximamente».
- **Pruebas nunca con datos reales del autor.** Rust: `tempfile` y las ayudas de `organizaciones::pruebas` (`rutas`, `crear`, `escribir`); ninguna llama a `Estado::iniciar`. TS: `localStorage` simulado. El arnés aborta si `rutaBd` no está en su temporal y no deja ventanas a la vista.
- Tras cambiar código: `graphify update .`. Antes del PR: `npm run typecheck`, `npm run lint`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.

## Review Focus

Cada línea tiene su prueba en la tarea indicada.

1. **La otra está abierta en otra copia de la app, con filas sin volcar en su `-wal`:** la comparación las ve, no espera el bloqueo y no cambia ningún archivo de la otra (Task 2).
2. **Dos unidades «Finanzas» en gerencias distintas**, en modo aproximado: cada una se empareja con la de su gerencia y no se cruzan (Task 3).
3. **Dos organizaciones creadas desde el ejemplo y sin cambios:** cero diferencias, en modo aproximado (Task 3).
4. **Cambiar de organización o eliminar la otra con la vista de comparación abierta:** la vista dice que la comparación ya no vale y ofrece **Comparar de nuevo**; nada falla en silencio (Tasks 4 y 5).
5. **La otra es de un esquema más antiguo:** se compara, el original sigue en su versión y el temporal desaparece al cerrar la vista (Task 2).

## Mapa de tareas y PR

| # | Tarea | Visibilidad |
|---|---|---|
| 1 | `comparar` también da lo que solo está aquí | ninguna |
| 2 | La otra en un temporal de solo lectura | ninguna |
| 3 | Coincidencia aproximada | ninguna |
| 4 | Resumen, página, detalle y comandos | sin interfaz |
| 5 | Vista Comparar, menú de Inicio y paleta | **visible** |
| 6 | Ayuda, novedades y sitio; medición con la organización grande | **visible**; puerta del PR |

Un solo PR, «Organizaciones: Comparar con…», con la etiqueta `version:menor`.

---

### Task 1: `comparar` también da lo que solo está aquí

**Visibilidad:** ninguna.

**Files:**
- Modify: `src-tauri/src/intercambio/comparar.rs`
- Test: `src-tauri/src/intercambio/comparar.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `Comparacion.solo_aqui: Vec<(&'static str, String)>`: tabla e `id` de las filas vivas que solo están en la base local, en el orden de `tablas()`.
  - `pub fn comparar_con_locales(local: &Connection, imp: &Connection, meta: &MetaArchivo, ahora: &str, seguir: impl FnMut(u64, u64) -> bool) -> Result<Comparacion, Fallo>`. `comparar` no cambia de firma y deja `solo_aqui` vacío. Las dos usan un `fn recorrer(…, con_locales: bool, …)` privado.

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `con_locales_lista_las_vivas_que_faltan_en_el_otro`: base local con las unidades `a` (viva), `b` (borrada) y `c` (también en el otro). Resultado: `solo_aqui == [("unidades", "a")]`.
  - `comparar_no_llena_solo_aqui`: con las mismas bases, `comparar(...).solo_aqui.is_empty()`.
- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml comparar::tests`. Expected: no compila, falta `solo_aqui`.
- [ ] **Step 3: Implementar.** En la rama `Ordering::Less` de `recorrer`, si `con_locales` y la fila está viva, se agrega a `solo_aqui`.
- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml intercambio`. Expected: PASS, incluidas las pruebas de `revision.rs`.
- [ ] **Step 5: Commit.** `git commit -m "Comparar: lo que solo está en la base local"`

### Task 2: La otra en un temporal de solo lectura

**Visibilidad:** ninguna.

**Files:**
- Create: `src-tauri/src/comparar_organizaciones.rs` (más su `mod` en `src-tauri/src/lib.rs`)
- Modify: `src-tauri/src/intercambio/validar.rs` (`migrar_temporal`), `src-tauri/src/organizaciones.rs` (`id_del_archivo` y `esta_su_archivo` pasan a `pub(crate)`)
- Test: `src-tauri/src/comparar_organizaciones.rs`, `src-tauri/src/intercambio/validar.rs`

**Interfaces:**
- Consumes: `organizaciones::{Entrada, base_de}`, `rutas::Rutas`, `validar::{solo_lectura, solo_lectura_cerrada, version_y_esquema}`, `intercambio::Temporal`.
- Produces, en `validar.rs`: `pub fn migrar_temporal(ruta: &Path, version: usize, migraciones: &[&str]) -> Result<(), Fallo>`: migra en una transacción y revisa solo el esquema (`revisar_solo_esquema`). `migrar_copia` pasa a ser `migrar_temporal` más `revisar`.
- Produces, en `comparar_organizaciones.rs`:
  - `pub struct Copia { pub temporal: Temporal, pub id: String, pub origen: Option<String> }`
  - `pub fn copiar_otra(r: &Rutas, e: &Entrada, abierta: &str, migraciones: &[&str]) -> Result<Copia, Fallo>`
  - `pub fn leer(copia: &Copia) -> Result<Connection, Fallo>`: `validar::solo_lectura` sobre el temporal, más `PRAGMA query_only=ON`.

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `copiar_otra_no_toca_el_original`: guarda el contenido y la fecha de modificación de la otra. Tras `copiar_otra` y soltar la copia, son iguales, y no hay `-wal`, `-shm` ni `.bloqueo` a su lado.
  - `con_otra_copia_escribiendo_ve_lo_del_wal` (Review Focus 1): otra conexión en WAL tiene una fila sin volcar y `bloquear` tomado. La copia tiene esa fila, y `copiar_otra` no espera.
  - `esquema_antiguo_se_migra_solo_en_el_temporal` (Review Focus 5): la otra está en la versión `MIGRACIONES.len() - 1`. La copia queda en la última versión, el original sigue en la suya y el temporal no existe después del `drop`.
  - `esquema_nuevo_no_se_compara`: `user_version = 99` da `esquema_nuevo`.
  - `archivo_ausente_da_no_encontrado`, `otro_db_id_da_otro_id`, `consigo_misma_da_misma`.
  - `leer_no_deja_escribir`: un `INSERT INTO meta` por `leer(&copia)` falla.
  - En `validar.rs`, `migrar_temporal_no_revisa_como_un_boldo`: una base vieja sin `data_revision` en `meta`, que `leer_meta` exige, migra con `migrar_temporal`; con `migrar_copia` da `contenido_invalido`.
- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml comparar_organizaciones`. Expected: no compila.
- [ ] **Step 3: Implementar `copiar_otra`**, en este orden:
  1. `e.id == abierta` da `misma`.
  2. `base_de` y `esta_su_archivo`; si no está, `no_encontrado`.
  3. `version_y_esquema`.
  4. Abre `solo_lectura_cerrada` con `PRAGMA query_only=ON`. Comprueba `id_del_archivo == e.id` (si no, `otro_id`), lee `origen_db_id` de `meta` y hace `VACUUM INTO` al temporal. Cierra.
  5. Si la versión es menor que `migraciones.len()`, `migrar_temporal`.

  Si SQLite rechaza `VACUUM INTO` con `query_only`, se quita el pragma solo en esa conexión, que sigue siendo `READ_ONLY`, y se dice en el PR.
- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Comparar: la otra organización en un temporal de solo lectura"`

### Task 3: Coincidencia aproximada

**Visibilidad:** ninguna.

**Files:**
- Modify: `src-tauri/src/comparar_organizaciones.rs`
- Test: `src-tauri/src/comparar_organizaciones.rs`

**Interfaces:**
- Consumes: `Copia` (Task 2), `fusion::{normalizar_nombre, describir}`, `comparar::tablas`.
- Produces:
  - `pub fn relacionadas(abierta: &Connection, copia: &Copia) -> Result<bool, Fallo>`: la regla de la decisión 3.
  - `pub struct Emparejadas { pub ids: HashSet<String>, pub sin_correo: u64 }`. `ids` son los de la abierta que se emparejaron por nombre o correo; `sin_correo` cuenta las personas vivas sin correo de las dos.
  - `pub fn emparejar(abierta: &Connection, copia: &Copia) -> Result<Emparejadas, Fallo>`: decide los pares según la decisión 4. En el temporal, en una sola transacción, cambia el `id` de cada fila emparejada al de la abierta, y también cada columna que la referencia (`describir(...).referencias`).

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `relacionadas_por_origen`: es `true` si el `origen_db_id` de la copia es el `db_id` de la abierta, al revés, o si las dos tienen el mismo. Sin origen, `false`.
  - `finanzas_en_dos_gerencias_no_se_cruzan` (Review Focus 2): cada «Finanzas» queda con el `id` de la «Finanzas» de su misma gerencia en la abierta.
  - `nombre_repetido_sin_ruta_no_se_empareja`: dos unidades con el mismo nombre que no coinciden por ruta quedan solo en un lado.
  - `correo_sin_mayusculas_ni_espacios`: `" Ana@X.cl"` empareja con `"ana@x.cl"`. Un correo repetido en un lado no empareja, y `sin_correo` cuenta a quien no tiene.
  - `puestos_por_unidad_y_cargo_en_orden`: con tres «Analista» en la abierta y dos en la otra, se emparejan dos y uno queda solo aquí.
  - `mismo_id_en_las_dos_no_se_reescribe`: un catálogo sembrado con el mismo `id` sigue igual.
  - `referencias_siguen_al_nuevo_id`: tras emparejar, `asignaciones.puesto_id`, `unidades.parent_id` y los extremos de `conexiones` en el temporal apuntan a los ids nuevos, y `PRAGMA foreign_key_check` no devuelve filas.
  - `dos_ejemplos_sin_cambios_no_difieren` (Review Focus 3): dos organizaciones creadas con la siembra del ejemplo. Tras `emparejar` y `comparar_con_locales`, no hay casos de `unidades`, `trabajadores` ni `puestos`, y `solo_aqui` no tiene filas de esas tablas.
- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml comparar_organizaciones`. Expected: FAIL, faltan `relacionadas` y `emparejar`.
- [ ] **Step 3: Implementar.** Los pares se calculan en memoria, con dos lecturas por tabla; la ruta de nombres sale de un CTE recursivo sobre `parent_id`. La reescritura usa una tabla `TEMP mapa(tabla, viejo, nuevo)` y un `UPDATE … WHERE col IN (SELECT viejo …)` por columna, en el orden de `tablas()`.
- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Comparar: coincidencia aproximada por nombre de unidad y correo"`

### Task 4: Resumen, página, detalle y comandos

**Visibilidad:** sin interfaz.

**Files:**
- Modify: `src-tauri/src/comparar_organizaciones.rs`, `src-tauri/src/intercambio/revision.rs` (`nombre_en`, `valor_campo` y `fecha_mostrable` pasan a `pub(crate)`), `src-tauri/src/comandos.rs`, `src-tauri/src/lib.rs` (`.manage(Comparaciones::default())` y el registro de los comandos), `src/db/cliente.ts`, `src/db/errores.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src-tauri/src/comparar_organizaciones.rs`, `src-tauri/src/comandos.rs`, `src/db/cliente.test.ts`

**Interfaces:**
- Consumes: `comparar_con_locales` (Task 1); `copiar_otra` y `leer` (Task 2); `relacionadas` y `emparejar` (Task 3).
- Produces, en Rust (`serde` en camelCase):
  - `pub enum Presencia { SoloAqui, SoloAlla, Difieren }` (no `Estado`, que ya es el de `comandos.rs`) (snake_case)
  - `pub struct Grupo { pub tabla: &'static str, pub solo_aqui: u64, pub solo_alla: u64, pub difieren: u64 }`
  - `pub struct ResumenComparacion { pub otra: String, pub aproximada: bool, pub sin_correo: u64, pub grupos: Vec<Grupo>, pub iguales: u64 }`
  - `pub struct FiltroComparacion { pub tabla: Option<String>, pub presencia: Option<Presencia>, pub desde: usize, pub cuantos: usize }`
  - `pub struct FilaComparada { pub tabla: &'static str, pub id: String, pub nombre: String, pub presencia: Presencia, pub columnas: Vec<String>, pub aproximada: bool }`
  - `pub struct PaginaComparada { pub filas: Vec<FilaComparada>, pub total: usize }`
  - `pub struct DetalleComparado { pub campos: Vec<revision::CampoDetalle>, pub puestos_aqui: Vec<String>, pub puestos_alla: Vec<String>, pub actualizada_aqui: Option<String>, pub actualizada_alla: Option<String> }`
  - `#[derive(Default)] pub struct Comparaciones`: un `Mutex<Option<Activa>>` (base, otra, `Copia`, filas y resumen) y una marca de cancelado por `trabajo`.
  - Comandos: `comparar_organizaciones(base_id, otra_id, trabajo) -> ResumenComparacion`, `comparacion_pagina(base_id, filtro) -> PaginaComparada`, `comparacion_detalle(base_id, tabla, id) -> DetalleComparado`, `comparacion_cancelar(trabajo)`, `comparacion_cerrar()`.
  - Si no hay una comparación de esa `base_id`: `comparacion_vencida`.
- Produces, en `cliente.ts`, con sus tipos: `compararOrganizaciones(otraId: string, trabajo: string): Promise<ResumenComparacion>`, `comparacionPagina(filtro: FiltroComparacion): Promise<PaginaComparada>`, `comparacionDetalle(tabla: string, id: string): Promise<DetalleComparado>`, `comparacionCancelar(trabajo: string): Promise<void>`, `comparacionCerrar(): Promise<void>`.

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `resumen_cuenta_por_tabla_y_estado`: con una unidad solo aquí, dos personas solo allá y un puesto que difiere, hay un `Grupo` por tabla con esos números, e `iguales` no cuenta catálogos.
  - `borrada_en_un_lado_cuenta_solo_en_el_otro`: borrada en la abierta y viva en la otra da `SoloAlla`.
  - `persona_en_otro_puesto_difiere` (decisión 5): con los mismos campos y otro puesto vigente da `Difieren` con `columnas == ["puestos"]`. El detalle trae los nombres de los puestos en `puestos_aqui` y `puestos_alla`.
  - `detalle_muestra_referencias_por_nombre`: `tipo_unidad_id` sale como el nombre del tipo en cada lado.
  - `filas_aproximadas_se_marcan`: en modo aproximado, `aproximada` es `true` solo en las filas emparejadas por nombre o correo.
  - `pagina_respeta_el_tope`: `cuantos = 10_000` da 200 filas y el `total` real.
  - En `comandos.rs`:
    - `comparar_no_cambia_la_base_abierta`: `Estado.base` y `organizaciones.json` quedan iguales, sin fecha `abierta` nueva.
    - `otra_base_no_ve_la_comparacion`: con otro `base_id` da `otra_base`.
    - `cambiar_de_organizacion_suelta_la_comparacion` (Review Focus 4): tras `cambiar_a`, `comparacion_pagina` da `comparacion_vencida` y el temporal ya no existe.
    - `cancelar_detiene_y_no_guarda`.
  - En `cliente.test.ts`: las funciones que miran la base envían `baseId`, y `comparacion_vencida` se traduce.
- [ ] **Step 2: Comprobar que fallan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml comparar_organizaciones` y `npx vitest run src/db/cliente.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `comparar_organizaciones` corre en un hilo aparte, como `importar_comparar`:
  1. Busca la entrada en la lista y llama a `copiar_otra`.
  2. Dentro de `con_conexion`: `relacionadas`; `emparejar` si no lo son; `comparar_con_locales` con `MetaArchivo { parcial: false, ramas: vec![], organizacion: String::new(), origen }`. El avance se avisa con la etapa `"comparando"`, como `seguimiento`, pero la cancelación se lee en `Comparaciones`.
  3. Compara los puestos vigentes de las personas que están en las dos.
  4. Guarda el resultado en `Comparaciones` y reemplaza el anterior.

  `cambiar_a` y `cerrar_ordenado` sueltan `Comparaciones`.
- [ ] **Step 4: Comprobar que pasan.** Run: `cargo test --manifest-path src-tauri/Cargo.toml` y `npx vitest run src/db`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Comparar: resumen, páginas, detalle y comandos"`

### Task 5: Vista Comparar, menú de Inicio y paleta

**Visibilidad:** **visible.**

**Files:**
- Create: `src/features/comparar/VistaComparar.vue`, `src/features/comparar/DetalleComparado.vue`, `src/features/comparar/comparar.ts`
- Modify: `src/router.ts` (ruta `/comparar`, `name: "comparar"`), `src/features/inicio/RecientesInicio.vue` (entrada del menú), `src/components/PaletaComandos.vue`, `src/features/proyecto/menuApp.ts`, `src/i18n/es.json`, `src/i18n/en.json`
- Test: `src/features/comparar/comparar.test.ts`, `src/features/comparar/VistaComparar.test.ts`, `src/features/proyecto/menuApp.test.ts`

**Interfaces:**
- Consumes: `cliente.ts` (Task 4); `useOrganizaciones().lista` e `idAbierta`; `intentarTrabajo` (`src/features/intercambio/intercambio.ts:56`) con `deLaAbierta(t("trabajos.comparar"))`, como `PanelImportar`; `BarraAvance.vue`.
- Produces:
  - En `menuApp.ts`: `entradasComparar(lista: Organizacion[], activa: string): { id: string; nombre: string }[]`, igual que `entradasAbrirOtra` pero con toda la lista.
  - `rutaComparar(id: string): RouteLocationRaw` = `{ name: "comparar", query: { con: id } }`.
  - En `comparar.ts`: `useComparar()`, con `resumen`, `pagina`, `detalle`, `cargando` y `vencida`, y las acciones `comparar(otraId)`, `verPagina(filtro)`, `verDetalle(tabla, id)` y `cerrar()`. Devuelven `{ ok, mensaje }` y no lanzan.

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `entradasComparar` deja fuera la abierta y conserva el orden de la lista.
  - Con un resumen aproximado, la vista muestra «Coincidencia aproximada» y cuántas personas no tienen correo.
  - Con un resumen por `id`, no hay aviso de coincidencia aproximada.
  - Pulsar una fila pide `comparacionDetalle` y muestra los dos lados, con el nombre de cada organización como encabezado.
  - `comparacion_vencida` en una página (Review Focus 4): se ve el aviso, y **Comparar de nuevo** vuelve a llamar a `compararOrganizaciones`.
  - Salir de la vista llama a `comparacionCerrar`. Mientras compara hay un trabajo registrado, y **Cancelar** llama a `comparacionCancelar`.
  - `?con=` con un id que no está en la lista: la vista dice que esa organización ya no está y no llama a Rust.
- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run src/features/comparar src/features/proyecto`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - La vista lee `con` de la ruta y compara al montarse.
  - Arriba muestra las dos organizaciones con su color y nombre. Debajo, una tabla con tres filas (Unidades, Personas, Puestos) y tres columnas: «Solo en <abierta>», «Solo en <otra>» y «Difieren».
  - Cada número filtra la lista de abajo, de 50 en 50.
  - Una fila abre `DetalleComparado` en un panel lateral, en dos columnas y solo con los campos que difieren.
  - En `RecientesInicio.vue`, **Comparar con la abierta** va en el menú de cada tarjeta que no es la abierta, y se deshabilita si la organización no tiene su archivo.
  - La paleta suma `...entradasComparar(...)` con la etiqueta `paleta.acciones.comparar`, como `abrirOtra`.
- [ ] **Step 4: Comprobar que pasan.** Run: `npm run typecheck`, `npm run lint` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Comparar: vista, menú de Inicio y paleta"`

### Task 6: Ayuda, novedades y sitio; medición con la organización grande

**Visibilidad:** **visible**. Puerta del PR: no se fusiona sin la medición.

**Files:**
- Modify: `ayuda/es/organizaciones.md`, `ayuda/en/organizaciones.md` (sección nueva después de «Abrir y cambiar»), `site/novedades.json`, `site/funciones.md` y `site/en/funciones.md`, `scripts/arnes-organizaciones.mjs`, `src/features/comparar/VistaComparar.vue` (`performance.measure("comparar-organizaciones")`)
- Test: `src/i18n/ayuda.test.ts`, `site/scripts/novedades.test.mjs`, `scripts/arnes-organizaciones.test.ts`

**Interfaces:**
- Consumes: la vista de la Task 5; `scripts/sembrar-grande.mjs <bd> --fotos 1000`; la portable de `node scripts/release.mjs --solo-portable --perfil prueba`.

- [ ] **Step 1: Escribir la ayuda.** Una sección `## Comparar` / `## Compare`, igual en los dos idiomas: cómo se abre (Inicio y paleta), qué muestra, qué es la coincidencia aproximada y qué personas quedan fuera, que la otra no cambia y que siempre se compara con la abierta. En `funciones.md`, es y en, una línea de Comparar donde se describen las varias organizaciones.
- [ ] **Step 2: Agregar la novedad al inicio de `site/novedades.json`.**

```json
{
  "id": "comparar-organizaciones",
  "pagina": "organizaciones",
  "es": {
    "titulo": "Compara dos organizaciones",
    "texto": "Desde Inicio o la paleta, compara la organización abierta con otra. Verás qué unidades, personas y puestos están solo en una o tienen datos distintos, y el detalle de cada lado. La otra no se modifica. Si no vienen de la misma organización, se emparejan por nombre de unidad y correo de persona, y se avisa.",
    "ancla": "comparar"
  },
  "en": {
    "titulo": "Compare two organizations",
    "texto": "From Home or the palette, compare the open organization with another one. You will see which units, people and positions are only in one or have different data, with the detail of each side. The other one is not modified. If they do not come from the same organization, they are matched by unit name and person email, and you are told so.",
    "ancla": "compare"
  }
}
```

- [ ] **Step 3: Medir en el arnés.** Se agrega `medirComparacion` a `arnes-organizaciones.mjs`, después de `medicionYEliminar`, que ya siembra la grande.
  - Arma dos organizaciones internas. `relacionada` es un `VACUUM INTO` de la grande con `db_id` nuevo, `origen_db_id` igual al de la grande y 100 personas con el teléfono cambiado. `aparte` es otra `sembrar-grande.mjs`, que tiene otros ids.
  - Abre la grande, compara 3 veces con cada una por la paleta y lee `performance.getEntriesByName("comparar-organizaciones")`.
  - Comprueba que con `relacionada` difieren 100 personas y que su archivo no cambió.
  - Sigue las reglas del arnés: comprueba `rutaBd` antes de escribir, todo va en `os.tmpdir()` y la ventana no queda a la vista.
  - Expected: mediana menor a 5000 ms en cada modo (decisión 10). Si no se cumple, se informa con los números en el PR y **se pregunta al autor**.
- [ ] **Step 4: Comprobar.**
  - Run: `npx vitest run src/i18n/ayuda.test.ts scripts/arnes-organizaciones.test.ts` y `node --test site/scripts/novedades.test.mjs site/scripts/masReciente.test.mjs`. Expected: PASS.
  - En CI de Windows, run: `node scripts/arnes-organizaciones.mjs <zips>`. Expected: las líneas `comparar por id: <n> ms` y `comparar aproximado: <n> ms`, que se pegan en el PR.
- [ ] **Step 5: Commit y PR.**

```bash
git add ayuda site scripts src/features/comparar
git commit -m "Comparar: ayuda, novedad y medición con la organización grande"
```

Después: `graphify update .`, las comprobaciones de Global Constraints y el PR con la etiqueta `version:menor`.
