# Task 27c, fotos solo en la edición web: diseño

El autor lo aprobó por partes el 2026-11-19. Detalla la Task 27c del Anexo 10 de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md`.

## Qué se logra

- El escritorio deja de guardar y de mostrar fotos de las personas. Hay menos datos personales en el equipo si se pierde o lo roban, y las fotos pasan a la edición web.
- Las tarjetas, la ficha, las listas de personas y el Directorio muestran las iniciales, como hoy cuando no hay foto.
- Las fotos que ya existen salen de las organizaciones, de su historial y de los respaldos. No quedan escondidas en el espacio libre de los archivos.

## Decisiones del autor

1. **Avisar una vez y limpiar todo junto.** En el primer arranque tras actualizar, se revisan todas las organizaciones propias y sus respaldos. Los archivos externos se limpian al abrirlos.
2. **Los respaldos se limpian por dentro.** No se borran: siguen sirviendo para volver atrás, solo que sin fotos.
3. **Se puede guardar las fotos antes.** Se exporta cada organización a un `.boldo` con el «Exportar» de siempre. No se construye nada nuevo para esto.
4. **El sitio publica una novedad sobre la privacidad** y quita las menciones a fotos de sus páginas. Las novedades antiguas se quedan.
5. **Sencillo.** Por ahora el autor es el único que usa la app. Se reutiliza lo que existe: el «Exportar», la barra de avance de los respaldos y la compactación.

## Decisión técnica

**La columna `foto_png` se queda en el esquema, siempre vacía.** No se borra con una migración. Así:
- los `.boldo` siguen siendo compatibles con versiones anteriores y con la futura web, que podrá leer las fotos de un `.boldo` viejo;
- los triggers del historial no cambian;
- `validar::revisar_esquema` no cambia.

## Qué ve la persona

1. **Primer arranque tras actualizar.** Si nada tiene fotos, la app no muestra nada.
2. **Aviso, si hay fotos:** «Esta versión ya no guarda fotos de las personas, para tener menos datos personales en el equipo. Tienes fotos en 2 organizaciones y 5 respaldos. Si quieres conservarlas, exporta antes cada organización a un `.boldo`». Tiene dos botones:
   - **«Quitar las fotos ahora»:** limpia todo, con la barra de avance de los respaldos, sin bloquear la ventana.
   - **«Más tarde»:** la app sigue funcionando sin mostrar fotos, y el aviso vuelve en el próximo arranque.
3. **Archivo externo con fotos:** el mismo aviso al abrirlo, solo para ese archivo.
4. **Importar un `.boldo`** o **restaurar un respaldo** con fotos: las fotos se quitan solas. El resumen de la importación lo dice, por ejemplo «12 fotos no se importaron».
5. **En toda la app:** las personas aparecen con sus iniciales. Ya no hay botón para subir una foto, y desaparece «Optimizar fotos» de Configuración.

## Cómo se limpia (Rust, `fotos.rs`)

- **`fotos::quitar(c) -> Result<u64, Fallo>`** trabaja en una transacción IMMEDIATE, sin acción abierta, así que no anota nada en el historial. Hace esto:
  1. `UPDATE trabajadores SET foto_png = NULL WHERE foto_png IS NOT NULL`;
  2. en `historial_filas` de `trabajadores`, quita la clave `foto_png` de `antes` y de `despues` con `json_remove`;
  3. borra las filas `update` que quedan sin campos y las acciones que quedan sin filas;
  4. al final compacta (`VACUUM`) y deja el `-wal` vacío (`wal_checkpoint(TRUNCATE)`).

  Devuelve cuántas fotos quitó.
- **`fotos::hay(c) -> Result<bool, Fallo>`** dice si queda alguna foto en las personas o en el historial.
- **Dónde se llama:**
  - **Primer arranque:** en cada organización de la lista y en cada respaldo de `respaldos/`.
    - `fotos_pendientes` abre cada archivo en solo lectura y devuelve los que tienen fotos.
    - `fotos_quitar_todas` los limpia con avance.
  - **Archivo externo:** al abrirlo, si `hay`, el aviso pide confirmar antes de limpiarlo.
  - **Importar:** en la copia temporal ya descifrada, antes de validar los cambios y de aplicar cualquier modo.
  - **Restaurar:** en la base restaurada, apenas termina.
- **Para que no vuelvan:**
  - `db::lote` rechaza cualquier sentencia que nombre `foto_png`, como ya hace con `historial_`;
  - se borran el protocolo `foto` y los comandos que leían, guardaban y optimizaban fotos.
- **La organización de al lado** se abre en solo lectura y nunca se modifica. Sin el protocolo, no muestra fotos.
- **Lo que no cambia:**
  - `validar.rs` sigue aceptando `.boldo` y respaldos con fotos (con su tope `MAX_IMAGEN`), para poder leerlos y limpiarlos;
  - el borrado definitivo de la 19b sigue vaciando la foto;
  - las podas de `alcance.rs` siguen igual.
- **Deshacer un cambio antiguo** ya no devuelve una foto, porque la foto también salió del historial.

## Lo que se quita

- **Ventana:**
  - `FotoPersona.vue`, `features/trabajadores/foto.ts` y su prueba;
  - `SeccionFotos.vue`, `optimizarFotos.ts` y su prueba;
  - las llamadas de foto en `src/db/cliente.ts`, y `tiene_foto` o similares en `trabajadores.ts` y `historico.ts`;
  - la validación de la foto en `features/trabajadores/validar.ts`;
  - la foto en el Excel de una persona (`excel/persona.ts`).
- **Pasan a iniciales:** `NodoUnidad.vue`, `ArbolPersonas.vue`, `PersonasUnidad.vue`, `FichaTrabajador.vue`, el Directorio y `LadoOtra.vue`.
- **Rust y Tauri:**
  - el protocolo y sus comandos en `fotos.rs`, `lib.rs` y `comandos.rs`;
  - el ajuste del CSP para el protocolo;
  - la creación de respaldos `boldo-antes-de-optimizar-`. Los que ya existen se siguen listando y se limpian como los demás.
- **Se queda:** la carga de notas bajo demanda de la 27b.

## Textos

- **Ayuda (es y en):** se quitan las menciones a fotos en `arbol.md`, `directorio.md`, `fichas.md`, `exportar-importar.md`, `organizaciones.md` y `respaldos.md`.
  - `exportar-importar.md` y `respaldos.md` dicen que las fotos de un `.boldo` o de un respaldo no entran.
  - `fichas.md` dice que las personas se muestran con sus iniciales.
- **Sitio:**
  - se quitan las menciones de `site/textos/es/funciones.json`, `inicio.json`, `site/comparador.json`, `Comparador.vue`, `site/acerca.md` y sus versiones en inglés;
  - novedad nueva en `site/novedades.json`: «Menos datos personales en tu equipo: el escritorio ya no guarda fotos de las personas; las tarjetas muestran sus iniciales». Sin versión ni lo que falta;
  - las novedades antiguas se quedan.

## Pruebas

- **Rust:**
  - `quitar` deja sin fotos `trabajadores`, `historial_filas` y el `-wal`, y los bytes de la foto ya no están en el archivo;
  - una acción que solo cambió la foto desaparece, y una que cambió la foto y el nombre conserva el nombre;
  - `lote` rechaza `foto_png`;
  - importar un `.boldo` con fotos, en los tres modos, deja la base sin fotos y la cuenta correcta;
  - restaurar un respaldo con fotos lo deja limpio;
  - `fotos_pendientes` encuentra organizaciones y respaldos con fotos y no abre los demás para escribir;
  - la organización de al lado no cambia.
- **TypeScript (Vitest en node, `renderToString`):**
  - las tarjetas, la ficha y el Directorio muestran iniciales;
  - el aviso con sus dos botones y su texto con los conteos.
- **Arnés en la app real** (CI de Windows), comprobando `rutaBd`:
  1. prepara una base de prueba con una foto;
  2. comprueba que sale el aviso;
  3. pulsa «Quitar las fotos ahora»;
  4. comprueba que no quedan fotos.
- **Medición:** tamaño del archivo antes y después de limpiar, con la organización grande.

## Entrega

Un PR con este diseño y su plan, y luego un PR de código con `version:menor`.
