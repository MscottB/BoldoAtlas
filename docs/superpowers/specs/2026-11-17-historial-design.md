# Task 19c, Historial de cambios: diseño

Aprobado por el autor por partes el 2026-11-17. Detalla la Task 19c del Anexo 6 de `docs/superpowers/plans/2026-10-28-fase2-nucleo.md` y el pedido original del autor (2026-11-01, `progress.md`): deshacer por partes o por rango, adelante y atrás, con bitácora, retención y respetando el borrado definitivo de la 19b.

## Qué se logra

- Cada acción del usuario queda guardada con cómo estaba antes y cómo quedó después. Sirve de bitácora y de deshacer y rehacer que no se pierden al cerrar la app.
- **Ctrl+Z** deshace y **Ctrl+Y** rehace, en cualquier vista, salvo dentro de un campo de texto, donde sigue el deshacer del campo.
- Una vista **Historial** muestra la lista y permite deshacer una acción suelta o **volver a un punto**.
- Lo antiguo se borra según un plazo elegible; el borrado definitivo quita a la persona también del historial.

## Decisiones del autor

1. **Plazo de retención** elegible en Configuración: 30 días, 90 días, **1 año (por defecto)** o sin límite. Se guarda en la organización (`meta.historial_plazo_dias`, vacío = sin límite). Al abrir la organización se borran las acciones más antiguas que el plazo.
2. **Conflicto al deshacer una acción antigua:** si una acción posterior, todavía hecha, tocó las mismas filas, la app lo dice, nombra esas acciones y ofrece deshacerlas junto con ella en un solo paso. Si no se acepta, no cambia nada.
3. **Camino A:** triggers de SQLite anotan los cambios; Rust deshace, rehace y vuelve a un punto.
4. La vista, lo que se anota y la entrega en dos PR, como se describe abajo.
5. **El nombre de una persona borrada definitivamente se queda en la bitácora** (decisión del autor, 2026-11-17). Del historial sale todo lo demás: correo, teléfono, foto, notas, valores de su ficha y motivos de sus asignaciones. El borrado definitivo deja de ser completo y se dice así: su diálogo y la ayuda avisan que el nombre queda en el historial hasta que venza el plazo de retención; la página de la 19e lo explica.

## Modelo de datos (migración 0003)

- `historial_acciones`: `id` (UUID v7), `fecha` (ISO UTC), `datos` (JSON solo con ids y conteos, **nunca nombres**), `origen` (`app`, `importar`, `revisar`, `suprimir`), `estado` (`hecha`, `deshecha`) y `rehacible` (si está en la pila de Ctrl+Y).
- `historial_filas`: `accion_id`, `orden`, `tabla`, `fila_id` (la clave primaria de la fila; en `meta`, la `clave`), `op` (`insert`, `update`, `delete`), `antes` y `despues` (JSON). En un `update` solo van **los campos que cambiaron**. En un `insert` va la fila entera en `despues` y en un `delete` físico, la fila entera en `antes`.
- `historial_en_curso`: una sola fila con la acción abierta, o `NULL`. Es una tabla normal y no `TEMP`, porque un trigger de la base principal no puede leer tablas temporales.
- **Triggers** `AFTER INSERT`, `AFTER UPDATE` y `AFTER DELETE` en cada tabla de negocio, con `WHEN` la acción abierta no es `NULL`. En `meta` solo anotan `org_nombre`, `logo_png`, `revision_bien` y `historial_plazo_dias`.
- Sin acción abierta no se anota nada. Así quedan fuera, sin código aparte, «Optimizar fotos», compactar, las migraciones, `data_revision`, `app_version_ultima` y `meta.suprimidas`.
- Una acción que al cerrarse no tiene filas se borra.

## Cómo se anota

- La frase se deduce de las filas (tabla, operación y campos), sin un tipo guardado. `db::lote` abre la acción, la pone en `historial_en_curso`, ejecuta las sentencias, la cierra y hace commit, todo en la misma transacción. Si algo falla, no queda nada.
- Al anotar una acción nueva de la app, las que estaban en la pila de Ctrl+Y dejan de ser rehacibles con Ctrl+Y (como en Word). Siguen en la bitácora como deshechas.
- **Importar con «Agregar lo nuevo»** (`fusion::fusionar`) y **aplicar «Revisar y decidir»** (`revision_aplicar`) abren una acción cada uno: «Importaste ventas.boldo: 12 cambios».
- **Las pasadas de prueba que se deshacen** (`revisar`, la verificación de la revisión) no abren acción. Si los triggers corrieran, igual se revierten con la transacción.
- **Borrado definitivo** (`supresion::suprimir`): no se anota lo que vacía. Deja una acción `suprimir` con el id de la persona, que no se puede deshacer («Borraste definitivamente a Juan Pérez»), y limpia el historial (abajo).
- **«Reemplazar todo»** deja la base nueva con el historial vacío, porque los `.boldo` no lo llevan. Su aviso lo dice; el historial anterior queda en el respaldo previo. **Restaurar un respaldo** devuelve el historial de ese respaldo.
- `INSERT OR REPLACE` no dispara el trigger de borrado salvo con `recursive_triggers`. El plan revisa cada `REPLACE` del código y lo cambia por `ON CONFLICT DO UPDATE` o activa ese pragma, con una prueba.

## Deshacer, rehacer y volver a un punto (Rust, `historial.rs`)

- **Deshacer una acción:** sin acción abierta, para no anotarlo, aplica el revés de sus filas en orden inverso: un `insert` se borra, un `update` vuelve a los valores de `antes`, un `delete` se vuelve a insertar. Marca la acción `deshecha` y `rehacible`. Todo en una transacción IMMEDIATE, con `marcar_cambio`.
- **Rehacer:** lo mismo hacia adelante, con `despues`. Vuelve a `hecha`.
- **Ctrl+Z** deshace la última acción hecha. **Ctrl+Y** rehace la última de la pila.
- **Volver a este punto:** deshace, de la más nueva a la más antigua, todas las acciones hechas posteriores a la elegida, en una sola transacción.
- **Conflicto:** antes de deshacer o rehacer una acción suelta, Rust busca acciones posteriores hechas que tocaron alguna de las mismas `(tabla, fila_id)`, y también las que crearon filas que apuntan a filas que este deshacer borraría (por ejemplo, una unidad creada bajo la unidad cuya creación se deshace). Devuelve la lista y la ventana ofrece deshacerlas juntas.
- **Si aun así no se puede** (una clave foránea, un ciclo, un correo repetido), la transacción se revierte, no cambia nada y la app dice por qué.
- **No se pueden deshacer:** una acción `suprimir`, y una acción que tocó a una persona después suprimida (su detalle lo dice).
- Al terminar, la ventana recarga los datos como tras importar.

## Retención y borrado definitivo

- **Al abrir la organización** se borran las acciones con `fecha` más antigua que el plazo, con sus filas.
- **Al suprimir a una persona,** en la misma transacción se limpia `historial_filas`:
  - en las filas de `trabajadores` con su id, `antes` y `despues` quedan solo con `nombre`; los demás campos se quitan;
  - en las de `asignaciones` con su `trabajador_id`, se quita `motivo`;
  - `actividad_roles` no guarda datos de la persona aparte del id, y queda igual.

  Las acciones que tocaron a esa persona se marcan para que no se puedan deshacer, porque ya no tienen sus datos. Luego se compacta como hoy.
- La bitácora no guarda frases escritas: las arma al mostrarlas con lo que hay en `historial_filas`. Por eso el nombre de la persona sigue apareciendo.
- El nombre sale del historial cuando vence el plazo de retención de esas acciones; con «sin límite», no sale.
- Los respaldos anteriores con sus datos completos se podan con el plazo de 30 días de la 19b, sin cambios.
- **Textos que cambian de la 19b:**
  - el diálogo de «Borrar definitivamente» dice que el nombre queda en el historial de cambios;
  - `ayuda/{es,en}/fichas.md` dice lo mismo.

## La vista «Historial»

- Entrada en el menú lateral, junto a Revisión. Ruta propia, como las otras vistas.
- Lista de acciones, de la más nueva a la más antigua, agrupadas por día. Cada una tiene hora, frase y cuántos elementos tocó. Debe verse fluida con miles de acciones: carga por partes desde Rust.
- Una línea **«Estás aquí»** marca hasta dónde llega lo hecho. Lo deshecho se ve atenuado y marcado «Deshecha».
- Al abrir una acción, el detalle campo por campo (antes → después) y tres botones:
  - **Ir a**: lleva a la unidad, puesto o persona en el árbol.
  - **Deshacer esta acción** o **Rehacer esta acción**, con el conflicto.
  - **Volver a este punto.**
- **Buscar por nombre** (las acciones que tocaron a «Ventas») y filtrar por fecha.
- **«Ver historial»** en la ficha de unidad, puesto y persona: abre la vista filtrada por ese elemento.
- **Exportar esta lista a Excel**, con la aceptación obligatoria de spec §11, como las otras listas.
- **En la organización de al lado** (solo lectura) se ve sin botones, y Ctrl+Z y Ctrl+Y no hacen nada.
- Los avisos de **Deshacer de 8 segundos** siguen a la vista igual, pero llaman al deshacer del historial.
- Ctrl+Z y Ctrl+Y muestran un aviso: «Deshecho: Renombraste Ventas… · Rehacer».

## `.boldo`, respaldos y validación

- Los respaldos son copias del archivo: llevan el historial.
- **Exportar un `.boldo`** (todo o por rama) no lleva filas de historial. Las tablas y los triggers sí van, porque `validar::revisar_esquema` exige el esquema exacto. Las tablas de historial se agregan a `alcance::PODA` como «nunca viajan».
- Al importar, las tablas de historial del archivo deben venir vacías; si no, el archivo se rechaza.
- `meta.historial_plazo_dias` se agrega a `META_CONOCIDAS`, porque viaja con la organización.
- **Toda migración futura** que recree una tabla debe recrear sus triggers. Una prueba de Rust recorre las tablas de negocio y falla si alguna no tiene sus tres triggers, o si un trigger no cubre todas las columnas.
- **Edición Pro** (spec `2026-11-06-edicion-pro-design.md`): los triggers no deben correr a la vez en el navegador y en PostgreSQL. Queda anotado; no se resuelve ahora.

## Pruebas

- **Rust:**
  - cada tabla de negocio tiene sus triggers y cubren todas las columnas;
  - un `update` guarda solo lo que cambió;
  - deshacer y rehacer devuelven la base exacta;
  - volver a un punto;
  - conflicto por mismas filas y por dependencia;
  - fallo que no deja nada;
  - retención;
  - purga al suprimir;
  - exportar sin historial e importar un archivo con historial (se rechaza);
  - `REPLACE`.
- **TypeScript:** las frases por tipo (con una persona suprimida, que mantiene el nombre), la pila de Ctrl+Y en el store, los atajos que no actúan en un campo de texto y la vista con `renderToString`.
- **Arnés en la app real** (CI de Windows):
  - hacer un cambio, Ctrl+Z, cerrar y abrir, Ctrl+Y;
  - volver a un punto;
  - comprobar `rutaBd`.
- **Medición** con la organización grande: tiempo de guardar un lote antes y después, y cuánto crece el archivo tras unas mil acciones.

## Entrega

Un PR con este diseño y el plan, y luego dos PR de código con `version:menor`:

1. **Motor:**
   - migración, triggers y `historial.rs`;
   - anotar en `db::lote`, importar, revisar y suprimir;
   - Ctrl+Z y Ctrl+Y con su aviso;
   - el Deshacer de 8 s sobre el historial;
   - plazo en Configuración, retención y purga;
   - `.boldo` sin historial;
   - ayuda (es y en) y una novedad en el sitio.
2. **Vista «Historial»:**
   - lista, detalle, Deshacer o Rehacer esta acción, Volver a este punto y búsqueda;
   - «Ver historial» en las fichas y Excel;
   - ayuda y novedad.

Queda para después, como estaba en el plan: la parte de historial de la Revisión (29c: desde cuándo está un aviso y qué cambio lo causó).
