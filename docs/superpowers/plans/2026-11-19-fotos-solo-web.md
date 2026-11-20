# Task 27c, fotos solo en la edición web: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el escritorio deje de guardar y mostrar fotos, y que las que existen salgan de las organizaciones, de su historial y de sus respaldos.

**Architecture:** una función de Rust, `fotos::quitar`, vacía las fotos de un archivo SQLite y compacta. Se llama desde cada camino por donde una foto puede entrar o quedarse: el arranque, al abrir un archivo externo, al importar y al restaurar. `db::lote` rechaza escribir `foto_png`. La ventana usa iniciales y muestra un aviso único.

**Tech Stack:** Tauri 2, rusqlite, Vue 3, Pinia, vue-i18n y Vitest en node.

**Spec:** `docs/superpowers/specs/2026-11-19-fotos-solo-web-design.md`

## Global Constraints

- **Textos:** la app y la ayuda en español simple y directo; el inglés dice lo mismo.
- **Pruebas:** Vitest corre en `node`, sin DOM. Los componentes se prueban con `renderToString` y la lógica va en funciones puras.
- **App real:** no se lanza en local. La prueba en la app real es el arnés del CI de Windows (`scripts/probar-app.mjs`), y ningún arnés toca datos reales (comprueba `rutaBd`).
- **Dependencias:** ninguna nueva.
- **Sitio:** no dice versiones, «próximamente» ni lo que falta. `site/novedades.json` acumula y nada se quita.
- **La columna `foto_png`** se queda en el esquema, siempre vacía. Ni migración ni cambio de triggers ni de `validar::revisar_esquema`.
- **Al terminar código:** `graphify update .`. En Bash, `git -C` y nunca `cd`.
- **Entrega:** un PR con `version:menor`.

## Review Focus

1. **Bytes escondidos.**
   - Riesgo: tras `quitar`, los bytes de la foto no deben aparecer en el `.db` ni en el `-wal`. Un `UPDATE` sin `VACUUM` y sin checkpoint los deja en páginas libres.
   - Prueba: `quitar_no_deja_los_bytes_en_el_archivo`, Task 1.
2. **Respaldo dañado o bloqueado.**
   - Riesgo: un respaldo que no abre o que está en uso no debe frenar la limpieza de los demás. Debe quedar en la lista para el próximo arranque, sin borrarse.
   - Prueba: `quitar_todas_sigue_si_un_respaldo_falla`, Task 2.
3. **Importar mientras quedan fotos.**
   - Riesgo: «Agregar lo nuevo» y «Revisar y decidir» comparan contra la copia importada. La foto debe salir antes de comparar, o la revisión mostraría un cambio de foto.
   - Prueba: `importar_con_fotos_no_muestra_cambios_de_foto`, Task 2.
4. **La organización de al lado.**
   - Riesgo: está abierta en solo lectura. La limpieza nunca la escribe, aunque tenga fotos y aparezca en la lista.
   - Prueba: `pendientes_no_escribe_y_quitar_salta_la_de_al_lado`, Task 2.
5. **«Más tarde» repetido.**
   - Riesgo: el aviso vuelve en cada arranque, pero nunca mientras se limpia ni dos veces en la misma sesión.
   - Prueba: `aviso_no_se_repite_en_la_sesion`, Task 3.

---

## Task 1: Quitar las fotos en Rust y cerrarles la puerta

**Files:**
- Modify: `src-tauri/src/fotos.rs`
  - Se borran `servir`, `respuesta_de`, `atender`, `foto_bytes`, `desarmar`, `escribir_lote`, `guardar_lote`, `fotos_guardar`, `fotos_compactar` y sus pruebas.
  - Se quedan `compactar` y `compactar_en` si algo más los usa (`grep`).
- Modify: `src-tauri/src/lib.rs`: el protocolo (línea ~53) y los comandos de fotos (~176-178).
- Modify: `src-tauri/tauri.conf.json`: en `csp` y `devCsp`, quitar `foto:` y `http://foto.localhost` de `img-src`.
- Modify: `src-tauri/src/db.rs`: el rechazo de `lote`, junto al de `historial_` (~221).
- Modify: `src-tauri/src/comandos.rs`:
  - quitar `respaldar_antes_de_optimizar` (~1436) y su registro;
  - `respaldos::respaldar_antes_de_optimizar` deja de crearse;
  - `PREFIJO_OPTIMIZAR` se sigue reconociendo al listar.

**Interfaces:**
- Produces:
  - `pub fn quitar(c: &mut Connection) -> Result<u64, Fallo>`. Devuelve cuántas fotos quitó de `trabajadores`.
  - `pub fn hay(c: &Connection) -> Result<bool, Fallo>`.
  - Error de `lote`: `Fallo` con código `foto_no_permitida`.

- [ ] **Step 1: Pruebas que fallan, en `fotos.rs`:**
  - **`quitar_vacia_personas_e_historial`:**
    - base migrada con una persona con `foto_png`;
    - una acción del historial que cambió la foto y el nombre;
    - otra acción que solo cambió la foto.
    - Tras `quitar`: `foto_png` es NULL en todas las personas; la primera acción conserva solo `nombre` en `antes` y `despues`; la segunda acción ya no existe; `hay` da `false`; devuelve `1`.
  - **`quitar_no_deja_los_bytes_en_el_archivo`:**
    - base en un archivo temporal, con WAL;
    - foto con un marcador ASCII reconocible (por ejemplo `FOTO-27C-MARCA`), en base64;
    - tras `quitar`, ni el `.db` ni el `-wal` contienen los bytes del marcador.
  - **`quitar_sin_fotos_no_cambia_nada`:** devuelve `0` y no abre una acción del historial.
  - **`lote_rechaza_foto_png`:**
    - `db::lote` con un `UPDATE trabajadores SET foto_png = 'x'` falla con `foto_no_permitida` y no escribe;
    - lo mismo con `FOTO_PNG` en mayúsculas.
- [ ] **Step 2:** `cargo test fotos` falla.
- [ ] **Step 3: Implementar `quitar` y `hay`.** Lo de la spec, sección «Cómo se limpia»:
  - transacción IMMEDIATE sin acción abierta;
  - `json_remove(antes,'$.foto_png')` y `json_remove(despues,'$.foto_png')`;
  - borrar las filas `update` cuyo `antes` y `despues` quedan en `'{}'`, y las acciones sin filas;
  - después `VACUUM` y `PRAGMA wal_checkpoint(TRUNCATE)`.

  En `lote`, rechazar la sentencia si `to_lowercase()` contiene `foto_png`. Quitar el protocolo, los comandos y el CSP.
- [ ] **Step 4:** pasan `cargo test` y `cargo clippy --all-targets -- -D warnings`.
- [ ] **Step 5: Commit** `feat(fotos): quitar fotos en Rust y cerrar su escritura`.

## Task 2: Dónde se limpia: arranque, archivo externo, importar y restaurar

**Files:**
- Modify: `src-tauri/src/fotos.rs`: comandos nuevos.
- Modify: `src-tauri/src/intercambio/mod.rs`:
  - en `abrir` (~378), tras validar la copia temporal y antes de `revisar`;
  - `ResumenImportacion` (~280) gana el campo `fotos_quitadas: u64`.
- Modify: `src-tauri/src/respaldos.rs`: `restaurar` (~513) llama a `quitar` en la base restaurada.
- Modify: `src-tauri/src/lib.rs`: registrar los comandos.

**Interfaces:**
- Consumes: `fotos::quitar` y `fotos::hay` (Task 1); `organizaciones::cargar_lista`, `ruta_de` y `base_de`; `respaldos::listar`.
- Produces (comandos de Tauri):
  - `fotos_pendientes() -> Result<Pendientes, Fallo>`, con `#[derive(Serialize)] pub struct Pendientes { pub organizaciones: Vec<String>, pub respaldos: u32 }`. `organizaciones` son los nombres. Solo cuenta las organizaciones de la lista y sus respaldos; los archivos externos se tratan al abrirlos.
  - `fotos_quitar_todas(trabajo: String) -> Result<u64, Fallo>`. Emite el evento `fotos-avance` `{ hechos: u32, total: u32 }`, igual que el avance de los respaldos.
  - `fotos_hay(base_id: String) -> Result<bool, Fallo>` y `fotos_quitar(base_id: String) -> Result<u64, Fallo>`, para la organización abierta (archivo externo).
- **Reglas:**
  - `pendientes` abre cada archivo en solo lectura.
  - `quitar_todas` abre cada uno para escribir. Usa la conexión ya abierta si es la organización actual, y salta la organización de al lado.

- [ ] **Step 1: Pruebas que fallan:**
  - **`pendientes_cuenta_organizaciones_y_respaldos`:** dos organizaciones en una carpeta temporal; una con foto y dos respaldos con foto; la otra sin fotos. El resultado es una organización y `respaldos: 2`.
  - **`pendientes_no_escribe_y_quitar_salta_la_de_al_lado`:** con una organización de al lado abierta, `pendientes` no cambia la fecha de modificación de ningún archivo, y `quitar_todas` no escribe la de al lado.
  - **`quitar_todas_sigue_si_un_respaldo_falla`:** un respaldo con bytes basura junto a otro con foto. Se limpia el bueno, el malo queda igual, y `pendientes` lo sigue contando.
  - **`importar_con_fotos_no_muestra_cambios_de_foto`:** un `.boldo` con una persona con foto se importa con «Agregar lo nuevo» y con «Reemplazar todo». La base queda sin fotos, `fotos_quitadas == 1`, y la revisión no lista `foto_png`.
  - **`restaurar_un_respaldo_con_fotos_lo_deja_limpio`.**
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan `cargo test` y `clippy`.
- [ ] **Step 5: Commit** `feat(fotos): limpiar al arrancar, al abrir, al importar y al restaurar`.

## Task 3: La ventana: iniciales, aviso y sin «Optimizar fotos»

**Files:**
- Delete:
  - `src/features/trabajadores/FotoPersona.vue`, `foto.ts` y `foto.test.ts`;
  - `src/features/configuracion/SeccionFotos.vue`, `optimizarFotos.ts` y `optimizarFotos.test.ts`.
- Modify:
  - `src/db/cliente.ts`: quitar `fotoBytes`, `fotosGuardar`, `fotosCompactar`, el respaldo previo a optimizar y el campo de bytes de foto (~275, 311, 527, 745-760); agregar los cuatro comandos de la Task 2.
  - `src/db/tipos.ts`;
  - `src/stores/organizacion.ts`;
  - `src/features/unidades/personas.ts`;
  - `NodoUnidad.vue`, `ArbolPersonas.vue`, `PersonasUnidad.vue`, `FichaTrabajador.vue`, el Directorio y `LadoOtra.vue`: usan las iniciales que ya existen (`iniciales` de `src/lib`);
  - `features/trabajadores/validar.ts`;
  - `features/excel/persona.ts`;
  - la sección de Configuración que montaba `SeccionFotos`;
  - el resumen de importar: si `fotos_quitadas > 0`, muestra «N fotos no se importaron».
- Create: `src/features/fotos/AvisoFotos.vue` y `src/features/fotos/aviso.ts` (lógica pura), con sus pruebas. Se monta en `App.vue` al terminar la carga inicial, y al abrir un archivo externo con fotos.
- Modify: `src/i18n/es.json` y `en.json`.
- Update: las pruebas que hoy esperan una foto (`grep -rl foto src --include=*.test.ts`).

**Interfaces:**
- Consumes: los cuatro comandos de la Task 2 y el evento `fotos-avance`.
- Produces: `textoAviso(p: Pendientes, t: Traducir): string` y `debeAvisar(p: Pendientes, yaAvisado: boolean): boolean` en `aviso.ts`.

**Textos exactos (es):**
- Aviso: «Esta versión ya no guarda fotos de las personas, para tener menos datos personales en el equipo. Tienes fotos en {organizaciones} y {respaldos} respaldos. Si quieres conservarlas, exporta antes cada organización a un .boldo.».
- Botones: «Quitar las fotos ahora» y «Más tarde».
- Importar: «{n} fotos no se importaron».

- [ ] **Step 1: Pruebas que fallan:**
  - `aviso.test.ts`:
    - `debeAvisar` es falso sin pendientes, verdadero con alguno y falso si `yaAvisado`;
    - `aviso_no_se_repite_en_la_sesion`;
    - `textoAviso` lleva los nombres y el conteo.
  - `AvisoFotos.test.ts` (`renderToString`): los dos botones y el texto.
  - Pruebas de las tarjetas, la ficha y el Directorio: muestran iniciales y ningún `<img>` de persona.
- [ ] **Step 2:** fallan. **Step 3:** implementar.
  - «Quitar las fotos ahora» llama a `fotos_quitar_todas`, muestra el avance, recarga los datos al terminar y cierra el aviso.
  - «Más tarde» solo lo cierra. `yaAvisado` vive en memoria de la sesión, no en `localStorage`.
- [ ] **Step 4:** pasan `npm test`, `npm run typecheck` y `npm run lint`.
- [ ] **Step 5: Commit** `feat(fotos): iniciales en toda la app y aviso para quitar las fotos`.

## Task 4: Ayuda, sitio, arnés y medición

**Files:**
- Modify: `ayuda/{es,en}/` con `arbol.md`, `directorio.md`, `fichas.md`, `exportar-importar.md`, `organizaciones.md` y `respaldos.md`. Lo que dicen está en la spec, sección «Textos».
- Modify:
  - `site/textos/es/funciones.json`, `inicio.json`, sus versiones en inglés, `site/comparador.json`, `site/.vitepress/theme/Comparador.vue` y `site/acerca.md` (y en inglés): quitar las menciones a fotos;
  - `site/novedades.json`: agregar al principio la novedad de la spec, en es y en.
- Modify: `scripts/probar-app.mjs`.
  - Se reemplaza el paso de la foto (~420-510), que escribe `foto_png` con `db_lote` y comprueba `urlFoto`. Eso ya no existe y `lote` lo rechazaría.
  - El paso nuevo `fotosSoloEnLaWeb`:
    1. con la app cerrada, escribe una foto en la base de prueba con `node:sqlite` (`DatabaseSync`, como `versionDe`), después de comprobar `rutaBd`;
    2. abre la app y espera el aviso;
    3. pulsa «Quitar las fotos ahora»;
    4. espera que `fotos_pendientes` dé cero;
    5. cierra y comprueba con `node:sqlite` que `foto_png` es NULL en todas las personas.
  - Además: `db_lote` con `foto_png` da `foto_no_permitida`.
- Medición: con la organización grande con fotos sembradas, el tamaño del archivo antes y después de `quitar`. Anotarlo en el PR.

- [ ] **Step 1:** `site/` `npm test` pasa, y revisa que no haya versiones, «Próximamente» ni fases.
- [ ] **Step 2:** `node --check scripts/probar-app.mjs` pasa.
- [ ] **Step 3: Commit** `docs(fotos): ayuda, sitio y arnés sin fotos`. `graphify update .`.
- [ ] **Step 4:** abrir el PR con `version:menor`.
