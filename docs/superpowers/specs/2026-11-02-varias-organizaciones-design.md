# Varias organizaciones en BoldoAtlas

Fecha: 2026-11-02. Complementa `2026-10-28-boldo-atlas-design.md`; donde se contradicen, manda este documento.

## Qué pidió el autor

- «Abierto recientemente», en Inicio, muestra las organizaciones abiertas, no los módulos: «los modulos abierto no me sirve».
- Uso: un poco de todo (clientes distintos, empresas de un grupo, real y de prueba).
- Ubicación: las dos, en la carpeta de la app y también archivos en otro lugar.
- Pestañas de organizaciones distintas, «justamente para hacer comparaciones», pero sin que se mezclen: «eso no debe pasar».
- Comparar con un resumen de diferencias y también lado a lado.

## Se logra si

1. Se pasa de una organización a otra en un par de clics, sin perder nada.
2. Nada de una organización llega a otra: datos, fotos, respaldos ni preferencias. Un error de programación tampoco lo permite.
3. El `boldo.db` actual sigue abriendo sin moverlo, con sus respaldos, pestañas y preferencias.
4. La portable sigue sin escribir fuera de su carpeta, salvo en el archivo externo que el usuario abre a propósito.
5. Sin servidor ni cuentas, igual que hoy.

## Entregas

Cada una se usa y se revisa sola.

1. **Organizaciones y pestañas:** este documento, de «Dónde se guarda» a «Errores».
2. **Comparar:** resumen de diferencias entre dos organizaciones.
3. **Lado a lado:** junto con la vista dividida (Task 29b del plan).

## Dónde se guarda

Rutas relativas a la carpeta de datos de la copia (`datos/` en la portable, `%APPDATA%\io.github.mscottb.boldoatlas` o equivalente en la instalada):

| Qué | Dónde |
|---|---|
| Organización existente | `boldo.db`, sin moverlo |
| Sus respaldos | `respaldos/`, como hoy |
| Organización nueva | `organizaciones/<id>/organizacion.db` |
| Respaldos de una nueva o de un archivo externo | `organizaciones/<id>/respaldos/` |
| Lista de organizaciones | `organizaciones.json` |

`<id>` es el `db_id` de `meta`, con la forma de UUID que ya tiene. Antes de usarlo como nombre de carpeta se valida: un `db_id` de un archivo ajeno no elige rutas. Si no es un UUID válido, se le asigna uno nuevo como en «Identidad y copias».

**Primera organización:** si `boldo.db` está vacío, la primera que se crea usa ese archivo. Así una instalación nueva no deja una base vacía de más.

**Respaldos sin mezclas:** `respaldos.rs` hoy lista, poda y limpia una carpeta única, con `boldo.db` al lado. Sus funciones pasan a recibir la base abierta (`Base { id, bd, respaldos }`), y `limpiar_parciales` deja de asumir el nombre `boldo.db`. La poda solo ve la carpeta de la organización abierta.

**Archivos externos:** la lista guarda la ruta absoluta. Los respaldos van a la carpeta de la app, no al lado del archivo. El `-wal` y el `-shm` de SQLite quedan junto al archivo: es inevitable y es la decisión explícita de abrirlo allí. En la portable se avisa la primera vez que ese archivo está fuera de su carpeta. Las carpetas de red no se admiten para escribir, porque WAL no es seguro allí: si se detecta una ruta de red, se avisa y se ofrece copiarlo a la carpeta de la app.

**Portable:** las rutas internas se guardan relativas, para que la carpeta se pueda mover. Una entrada externa cuya ruta ya no existe aparece como «no se encuentra».

### `organizaciones.json`

```json
{
  "version": 1,
  "organizaciones": [
    {
      "id": "0190…",
      "ruta": "boldo.db",
      "externa": false,
      "nombre": "Compañía Demo",
      "color": "#3b6fb5",
      "abierta": "2026-11-02T10:15:00Z"
    }
  ]
}
```

- `nombre` es una copia para mostrar sin abrir el archivo, y se actualiza al abrir o renombrar. La fuente sigue siendo `meta.org_nombre`.
- `color` lo asigna la app de una paleta al agregar la organización y se puede cambiar. Es de la lista, no de la base: identifica la organización en esta copia.
- El archivo se escribe a un temporal y se renombra, para que un corte no lo deje a medias. Si está dañado o no existe, se reconstruye con `boldo.db` y lo que haya en `organizaciones/`. Las externas salen de la lista, sin tocar sus archivos.
- Primer arranque tras actualizar: se crea con `boldo.db` como única entrada.
- Una base vacía sin organización (recién instalado) no se lista: Inicio muestra los caminos de siempre.

### Identidad y copias

La identidad es `db_id`, no la ruta. Si se abre un archivo cuyo `db_id` ya está en la lista con otra ruta, es una copia: se avisa y se escribe un `db_id` nuevo en el archivo que se abre, para que sus pestañas y preferencias no se crucen.

Al importar un `.boldo` como organización nueva siempre se genera un `db_id` nuevo, y `origen_db_id` conserva de dónde vino. Importar el mismo archivo dos veces da dos organizaciones.

## Abrir y cambiar de organización

Hoy `Estado` tiene una sola conexión y `Rutas` fijas al arrancar, y `cambiar_base` deja la conexión cerrada hasta reiniciar.

**Rust:** `Rutas` sigue fija por copia. Se agrega a `Estado` una base abierta mutable (`Mutex<Option<Base>>`), y un comando `abrir_organizacion(id)`:

1. Rechaza el cambio si hay un trabajo en curso en Rust (`intercambio::Sesiones`, respaldos, optimizar fotos).
2. Comprueba que el archivo existe y que no está abierto en otra copia.
3. Abre la nueva conexión y migra, con su respaldo `antes-migracion-*` en la carpeta de esa organización. Si falla, la base actual sigue abierta y nada cambió.
4. Cierra la anterior con `PRAGMA wal_checkpoint(TRUNCATE)`.
5. Reemplaza la base abierta y actualiza `organizaciones.json`.

El orden importa: la nueva abre antes de soltar la anterior, para no quedar sin base si falla.

**Otra copia usando el archivo:** al abrir, se toma un bloqueo exclusivo sobre `<base>.bloqueo`, que el sistema libera si la app se cae. Si otra copia lo tiene, el error es `abierta_en_otra_copia`. El plan elige la API, prefiriendo la biblioteca estándar a una dependencia nueva.

**TS:** al activar una pestaña de otra organización, en este orden:

1. Si hay un formulario con cambios sin aplicar, se pregunta, igual que al cerrar la ventana.
2. Si hay un trabajo en curso (`src/lib/trabajos.ts`), se avisa y no se cambia.
3. Se vacía `colaLotes` y se guarda el estado de la vista.
4. `abrir_organizacion`. Si falla, se queda en la pestaña actual y se muestra el motivo.
5. `soltarDatos()` y `org.cargar()`, y se monta la vista de la pestaña con un indicador de carga.

La meta es abrir en menos de 1 segundo con la organización grande de referencia (10.000 personas, 1.000 fotos). Se mide.

**Reinicios:** `restaurar_respaldo` e `importar_reemplazar` siguen reiniciando la app, y vuelven a la organización que tenían abierta: la última abierta se recuerda.

## El seguro contra mezclas

Cada llamada que toca datos lleva la identidad de la organización que la app cree tener abierta:

- `db_consultar`, `db_lote`, respaldos, intercambio y fotos reciben `baseId`.
- Rust compara con la base abierta dentro de `con_conexion`, con el mutex tomado. Si no coincide, responde el error `otra_base` y no ejecuta nada. No hay camino a la conexión que no pase por esta comprobación.
- `cliente.ts` agrega `baseId` en un solo lugar. Una respuesta que llega cuando ya hay otro `baseId` activo se descarta: una carga lenta de la organización A no puede llenar la vista de B.
- Las fotos usan `foto://<baseId>/<id>`, y su caché `immutable` queda separado por organización.

`otra_base` no se reintenta. Se registra y se muestra un mensaje que pide recargar, porque significa un error de la app.

Pruebas obligatorias: lote y consulta con `baseId` antiguo rechazados; respuesta tardía descartada; foto de A pedida con B abierta da 404; una falla entre los pasos 3 y 5 de `abrir_organizacion` deja la base anterior abierta.

## Preferencias

| Alcance | Cuáles |
|---|---|
| Por organización (`<clave>:<db_id>`) | vistas (`vista:*`), filtros y columnas del directorio, `personas:vista`, `plegado:*`, minimapa |
| De la copia | pestañas, que ahora incluyen a qué organización pertenecen |
| Por PC, como hoy | tema, acento, escala, idioma, frecuencia de respaldos y de actualizaciones, barra lateral, al cerrar |

**Migración:** al primer arranque, `pestanas:<rutaBd>` y las claves de datos que hoy no llevan base se copian a su clave nueva, con la organización de `boldo.db`. Las claves antiguas no se borran hasta una versión posterior.

## Pestañas

`Pestana` gana `org` (el `db_id`). Una pestaña guardada sin `org` pertenece a `boldo.db`.

- Pestaña de otra organización: muestra nombre y color. Si todas son de la misma, se ve como hoy.
- «Abrir otra organización» abre una pestaña nueva con la vista de trabajo de esa organización; si ya hay una suya, la activa.
- Solo la pestaña activa está montada, como hoy, y solo su organización está cargada.
- Una pestaña cuya organización no abre (archivo no encontrado, versión más nueva) muestra el motivo dentro de la pestaña, con «Buscar archivo» o «Cerrar pestaña». Las demás no se tocan.
- `valida()` solo se usa con la organización cargada: las pestañas de otras se validan al activarlas.

## Lo que cambia en pantalla

- **Inicio, «Abierto recientemente»:** organizaciones con logo o inicial, nombre, color y fecha de apertura, hasta 8. Reemplaza la lista de módulos: `useRecientes.ts` se quita y `recientes:*` deja de escribirse. Un clic abre la organización. Menú de cada entrada: **Quitar de la lista**, que no borra el archivo, y **Eliminar organización** en las de la carpeta de la app. Si el archivo no está, lo dice y ofrece **Buscar archivo** o **Quitar de la lista**.
- **Inicio, abrir:** botones **Crear organización**, **Abrir archivo…** y **Explorar el ejemplo**, siempre visibles. Sin datos, los caminos de hoy.
- **Crear:** crea un archivo nuevo y lo abre. Ya no vacía la base: se retira `reemplazarCon`, su diálogo de confirmación y `respaldarAntesDeReemplazar` en este camino. `boldo-antes-de-reemplazar-` sigue para importar.
- **Explorar el ejemplo:** igual que Crear, con nombre «Ejemplo». Si ya hay uno en la lista, lo abre en vez de crear otro.
- **Eliminar organización:** pide escribir el nombre. Guarda antes un respaldo en `organizaciones-eliminadas/` y borra su carpeta. Si tiene pestañas abiertas, pide cerrarlas antes. `boldo.db` y los archivos externos no se eliminan desde la app: solo se quitan de la lista, y se dice así.
- **Importar `.boldo`:** se suma el modo **Como organización nueva**, que es el primero y el recomendado. Los otros tres siguen e indican a qué organización afectan.
- **Barra superior:** deja la insignia «Principal» y muestra color y nombre. **Datos del proyecto** muestra la ruta de la organización abierta.
- **Menú de la app y paleta:** **Abrir otra organización…**, con las recientes.
- **Título de la ventana:** el nombre de la organización activa, como hoy.
- **Bandeja:** los trabajos y avisos nombran la organización.
- **Respaldo automático:** corre para la organización abierta. Una que no se abre no cambió, así que no necesita uno nuevo.

Sitio, ayuda y novedades se actualizan en la entrega, en español e inglés.

## Errores

| Caso | Qué pasa |
|---|---|
| Archivo no encontrado | La entrada o pestaña lo dice; **Buscar archivo** o **Quitar**. Si el archivo buscado tiene otro `db_id`, se pide confirmar |
| Versión de esquema más nueva | «Esta organización se guardó con una versión más nueva»; ofrece buscar actualización. No se abre |
| Migración que falla | Se deshace; sigue abierta la anterior; el mensaje lleva el detalle para copiar |
| Abierta en otra copia | Lo dice y no abre |
| Archivo dañado o que no es de BoldoAtlas | No se abre (ver abajo) |
| `organizaciones.json` dañado | Se reconstruye (ver arriba) |
| Ruta de red | Avisa y ofrece copiar a la carpeta de la app |
| Sin espacio al crear o migrar | Error claro; la base actual sigue abierta |

**Archivo ajeno:** abrir un `.db` de otra persona trae los mismos riesgos que un `.boldo`. Antes de abrirlo se aplica la misma validación de `validar.rs`: solo lectura, `trusted_schema=OFF`, integridad y esquema exacto de una versión conocida. Solo después se abre para escribir.

## Entrega 2: Comparar

- **Entrada:** menú de cada organización y paleta: **Comparar con…**.
- **Resultado:** resumen con unidades, personas y puestos que solo están en una o que difieren, y sus conteos. Cada fila abre el detalle de ambas.
- **Coincidencia:** por `id` si vienen de la misma organización (`db_id` u `origen_db_id` relacionados); si no, por nombre de unidad y correo de persona, y dice «coincidencia aproximada». Reutiliza `intercambio/comparar.rs`.
- **Solo lectura:** la otra organización se abre en una segunda conexión con `SQLITE_OPEN_READ_ONLY` y `PRAGMA query_only=ON`, sin registrarla como base abierta. No existe comando que escriba por esa conexión.
- **Sin migrar:** si la otra es de un esquema más antiguo, se copia a un temporal y se migra allí. El original no se toca.

## Entrega 3: Lado a lado

Va con la Task 29b, que define el divisor, los atajos y el foco.

- Dos paneles. De la misma organización, ambos se editan.
- De organizaciones distintas: el panel secundario es de solo lectura, con un aviso visible y sin acciones de edición, y usa la conexión de solo lectura de la entrega 2. Su store es una instancia propia, de modo que los singletons de hoy no se mezclan. Cómo se separa se decide en el plan de esa entrega, tras medir.
- Se mide la memoria con la organización grande. Si dos no caben, se avisa antes de abrir.

## Escenarios

Serán organizaciones derivadas (`escenario_origen_id`), en la misma lista y agrupadas bajo su origen, con este mismo cambio de base. La spec principal, líneas 220 y 233, se actualiza: deja de haber una única «base principal». Se implementan en su fase.

## Fuera de alcance

- Editar dos organizaciones a la vez lado a lado.
- Copiar unidades de una organización a otra arrastrando: para traer datos sigue el `.boldo`.
- Sincronizar archivos entre equipos.

## Pruebas

- **Rust:** `abrir_organizacion` (éxito, archivo ausente, esquema más nuevo, migración que falla, bloqueo de otra copia, trabajo en curso); `otra_base` en cada comando; respaldos y poda separados por organización; `limpiar_parciales`; `organizaciones.json` (dañado, ausente, rutas relativas); validación de `<id>`; `.boldo` como organización nueva; archivo ajeno rechazado.
- **TS:** cambio de pestaña con cola pendiente, formulario abierto y trabajo en curso; respuesta tardía descartada; preferencias por `db_id` y su migración; pestaña con organización que no abre.
- **Migración desde una instalación real:** arnés con una copia de prueba de `boldo.db` de esquema anterior, con pestañas y preferencias: todo se conserva y el archivo no se mueve.
- **Instalador en CI:** actualizar desde la versión publicada anterior conserva la organización.
- **Medición:** tiempo de cambio con la organización grande.
- Nunca con los datos reales del autor; arnés aislado según las reglas del proyecto.
