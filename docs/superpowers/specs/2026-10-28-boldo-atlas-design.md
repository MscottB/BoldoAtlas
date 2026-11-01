# BoldoAtlas — Diseño v1

Fecha: 2026-10-28 · Estado: borrador para revisión · Licencia del proyecto: AGPL-3.0

## 1. Objetivo

App de escritorio local para construir y revisar un organigrama grande de una organización:
unidades (gerencias, superintendencias, áreas… con tipos que define cada organización) conectadas jerárquicamente o lateralmente, con sus jefaturas,
procesos (SIPOC), actividades (RACI) y las fichas de cada trabajador. Debe pesar poco, verse moderna,
funcionar sin servidor ni conexiones a otras plataformas, y poder intercambiar datos entre PCs mediante archivos.

**Éxito en v1:**
- Una persona carga la organización desde Excel o a mano, y registra procesos, actividades y trabajadores.
- Ve indicadores (dotación, vacantes, personas a cargo) por unidad y por rama.
- Exporta un archivo `.boldo`; otra persona lo importa (reemplazando o fusionando con revisión).
- Guarda escenarios (borradores de reorganización) y los compara con la estructura actual.
- Genera un PDF presentable, capturas PNG/SVG y un Excel con la información que elija.
- Se distribuye como versión portable (zip) e instalador desde GitHub Releases, con un sitio de presentación (manual de usuario + descarga) publicado automáticamente.

## 2. Alcance

**Incluido en v1:** todo lo descrito en las secciones 3–15.

**Fuera de v1 (explícito):**
- Cualquier integración con otras plataformas (RR.HH., SSO, Slack/Teams, enlaces web para compartir). El visor HTML (§11) es un archivo, no un enlace, y leer archivos exportados por otros sistemas (§10) no conecta con ellos.
- Sincronización en vivo / multiusuario simultáneo / servidor.
- Usuarios y permisos dentro de la app. (La contraseña de la base y el candado por árbol sí están previstos: plan, Tasks 19d y 19f.)
- Funciones "premium" del modelo open core (solo se elige la licencia ahora).
- Campos personalizados definidos por el usuario.
- Instalar actualizaciones sin preguntar: la app solo **consulta** si hay versión nueva (a pedido o cada cierto tiempo según Configuración, ver §12 "Actualizar") y siempre pide confirmación antes de descargar e instalar.
- Envío por correo desde la app (se guarda el archivo y se ofrece "Abrir carpeta").
- Idiomas distintos al español y al inglés.
- Firma de código de pago (certificado de Windows, cuenta de desarrollador de Apple): los binarios salen sin firmar y el README explica cómo abrirlos (SmartScreen, Gatekeeper). Windows, Linux y macOS sí se publican (pedido del autor, ver §14).

## 3. Stack

| Capa | Elección |
|---|---|
| Shell de escritorio | Tauri 2 (backend Rust, mínimo código propio) |
| Frontend | Vue 3 + TypeScript (`strict`) + Vite |
| Estado | Pinia |
| UI | Tailwind CSS v4 + shadcn-vue (Reka UI), iconos Lucide, fuente Inter |
| Diagrama | Vue Flow + elkjs (layout automático) |
| BD | SQLite vía `rusqlite` (SQLite incluido en el binario) expuesto con 3 comandos Tauri; migraciones con `PRAGMA user_version`. Se descartó `tauri-plugin-sql` porque su pool de conexiones no garantiza transacciones atómicas desde el frontend. |
| Archivos/diálogos | `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener` |
| Cifrado del `.boldo` | Rust: `argon2` (Argon2id) + `chacha20poly1305` (XChaCha20-Poly1305), RustCrypto |
| PDF | pdfmake (fuente Inter embebida) |
| Excel (leer y escribir) | ExcelJS (MIT); CSV leído con el mismo flujo |
| Tests | Vitest |
| Calidad | ESLint + Prettier, `vue-tsc` en CI |
| Sitio de presentación | VitePress (Vue, Markdown) en GitHub Pages |

Go se descartó: Tauri usa Rust; con Go habría que cambiar a Wails. El código Rust se limita a
detectar el modo portable, resolver rutas (sección 12) y un puente mínimo con SQLite (consultar, ejecutar lote en transacción, migrar).

## 4. Buenas prácticas de código

- **Organización por funcionalidad:** `src/features/{arbol,unidades,procesos,trabajadores,directorio,indicadores,escenarios,carga,sync,export,config}`; cada una con sus componentes, store y tipos.
- **Capa de datos única:** solo `src/db/` habla con SQLite (repositorios por tabla). Componentes y stores nunca escriben SQL.
- **Lógica pura separada de la UI:** diff/fusión, derivación de rutas, indicadores, validación de carga masiva y armado de SVG/PDF/Excel son funciones puras testeables.
- **Consultas parametrizadas siempre** (nunca concatenar texto en SQL).
- **Escrituras en transacción** cuando tocan más de una fila; errores mostrados al usuario con mensaje claro, nunca tragados.
- **Tipos compartidos** en `src/db/types.ts`, derivados del esquema.
- Commits con Conventional Commits; versiones con semver.

## 5. Modelo de datos

### Principios
- Normalizado (3FN): cada dato vive en un solo lugar. Gerencia y área de un trabajador **no** se guardan; se derivan de la jerarquía. El responsable de una actividad **no** es una columna: sale de la tabla RACI.
- `PRAGMA foreign_keys = ON` y `journal_mode = WAL` al abrir.
- Claves foráneas declaradas `DEFERRABLE INITIALLY DEFERRED` (la fusión y la carga masiva insertan en cualquier orden dentro de una transacción; también permite la referencia circular `unidades.jefe_id` ↔ `trabajadores.unidad_id`).
- `NOT NULL` y `CHECK` donde corresponde; índice en cada clave foránea.
- Nombres de tablas y columnas en español, `snake_case`, tablas en plural.
- Todas las tablas de negocio tienen:
  - `id TEXT PRIMARY KEY` — UUID v7 generado en el frontend (nunca autoincremental).
  - `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` — ISO-8601 UTC.
  - `deleted_at TEXT NULL` — borrado lógico; nunca `DELETE` en tablas de negocio. Las consultas normales filtran `deleted_at IS NULL`.
  - Los índices únicos son parciales (`WHERE deleted_at IS NULL`).

### `meta` (clave/valor)
| clave | contenido |
|---|---|
| `db_id` | UUID de esta base (se crea una vez; un escenario recibe uno nuevo) |
| `org_nombre` | nombre de la organización |
| `db_creada` | fecha de creación de la base |
| `escenario_nombre` | NULL en la base principal; nombre del escenario en una copia |
| `escenario_origen_id` | `db_id` de la base de la que se copió el escenario |
| `data_revision` | entero; +1 en cada transacción de escritura |
| `app_version_ultima` | versión de la app que escribió por última vez |
| `logo_png` | logo de la organización en base64 (viaja con la base) |
| `costos_activos` | `1` si la organización usa costos por puesto; sin la clave, los costos no se muestran en ninguna parte (§5 "Costo por puesto") |
| `moneda` | código de la moneda de los costos (`CLP` por defecto) |

La versión de esquema la lleva `PRAGMA user_version`.

### `unidades`
| columna | tipo | reglas |
|---|---|---|
| `tipo_id` | TEXT | NOT NULL → `tipos_unidad.id` (ver abajo) |
| `nombre` | TEXT | NOT NULL, CHECK largo > 0 |
| `descripcion` | TEXT | NULL |
| `parent_id` | TEXT | NULL → `unidades.id`; NULL = raíz (permite árboles sueltos) |
| `jefe_puesto_id` | TEXT | NULL → `puestos.id` (la jefatura de la unidad; ver "Puestos y asignaciones") |
| `orden` | INTEGER | NOT NULL DEFAULT 0 |

Profundidad libre. La ausencia de ciclos se valida en la capa de datos antes de guardar (SQLite no puede expresarlo con CHECK). El jefe puede pertenecer a la propia unidad o a la superior.

### `tipos_unidad` (pedido del autor: tipos flexibles, p. ej. Gerencia, Superintendencia, Área, Departamento)
Cada organización nombra sus propios niveles; no hay tipos fijos en el código.
- Columnas: `nombre` NOT NULL (único parcial por `lower(trim(nombre))`), `orden` INTEGER NOT NULL DEFAULT 0 (nivel sugerido: menor = más arriba) + comunes. Mantenedor en Configuración › Mantenedores igual a los demás catálogos (crear, renombrar, reordenar, desactivar; un tipo desactivado sigue válido en las unidades que ya lo usan pero no se ofrece para nuevas).
- La migración siembra Gerencia, Área, Subárea y Otra con ids fijos; el usuario los renombra, reordena o agrega otros (Superintendencia, Departamento…).
- El orden **no restringe** la estructura: cualquier tipo puede colgar de cualquier otro. Solo se usa para listar, para sugerir el tipo de una unidad hija nueva (el siguiente en orden después del de su superior) y para ordenar columnas.
- **Ruta por tipo** (reemplaza "Gerencia › Área › Subárea" fijo en todo el documento): para cada tipo, la unidad más cercana hacia arriba de ese tipo. La ficha, el directorio (columnas y filtros), el Excel y el PDF muestran una columna por cada tipo en uso, en el orden del catálogo; las migas de pan muestran la ruta completa.
- Las marcas heredadas y "Colorear por" se eligen por tipo: "marca de <tipo>" para cada tipo en uso, además de "ninguno" y "leyenda del puesto".

### `conexiones` (relaciones laterales)
`origen_id` NOT NULL → `unidades.id`, `destino_id` NOT NULL → `unidades.id`, `etiqueta` TEXT NULL. CHECK `origen_id <> destino_id`.

### `etiquetas` y `unidad_etiquetas`
- `etiquetas`: `nombre` NOT NULL (único), `color` TEXT NOT NULL (hex).
- `unidad_etiquetas`: `unidad_id` NOT NULL → `unidades.id`, `etiqueta_id` NOT NULL → `etiquetas.id`; único (`unidad_id`, `etiqueta_id`).

### `procesos`
| columna | reglas |
|---|---|
| `unidad_id` | NOT NULL → `unidades.id` |
| `nombre` | NOT NULL |
| `descripcion` | NULL |
| `proveedores`, `entradas`, `salidas`, `clientes` | TEXT NULL (SIPOC; texto libre, un elemento por línea) |
| `frecuencia` | NULL, CHECK in ('diaria','semanal','mensual','trimestral','anual','eventual') |
| `criticidad` | NULL, CHECK in ('baja','media','alta') |
| `estado` | NOT NULL DEFAULT 'borrador', CHECK in ('borrador','documentado','en_revision','obsoleto') |
| `documento_ref` | NULL (URL o ruta a un archivo; se abre con el programa del sistema) |
| `orden` | INTEGER NOT NULL DEFAULT 0 |

### `actividades`
`proceso_id` NOT NULL → `procesos.id`, `nombre` NOT NULL, `descripcion` NULL, `orden` INTEGER NOT NULL DEFAULT 0.

### `actividad_roles` (RACI)
| columna | reglas |
|---|---|
| `actividad_id` | NOT NULL → `actividades.id` |
| `trabajador_id` | NOT NULL → `trabajadores.id` |
| `rol` | NOT NULL, CHECK in ('R','A','C','I') |

Único (`actividad_id`, `trabajador_id`): una persona tiene un solo rol por actividad.
Único parcial (`actividad_id`) `WHERE rol = 'A'`: como máximo un Aprobador por actividad.
La UI avisa (sin bloquear) si una actividad no tiene ningún R.

### Mantenedores: `cargos`, `tipos_contrato`, `sedes`, `jornadas`
Cuatro catálogos con la misma forma, administrados en Configuración › Mantenedores, para que la ficha use listas controladas y no texto libre:
`nombre` NOT NULL (CHECK largo > 0), `orden` INTEGER NOT NULL DEFAULT 0 + comunes.
Único parcial `lower(trim(nombre))` donde `deleted_at IS NULL` (por catálogo).
Una tabla por catálogo, y no una tabla genérica de "valores", para que la clave foránea garantice el tipo correcto (en `cargo_id` solo puede ir un cargo).
Desactivar un valor = borrado lógico: deja de ofrecerse en las listas, pero las fichas que ya lo usan lo conservan y lo muestran como "(inactivo)". El mantenedor muestra cuántas personas usan cada valor.

### `trabajadores`
| columna | reglas |
|---|---|
| `estado` | NOT NULL DEFAULT 'activo', CHECK in ('activo','vacante') |
| `nombre` | NULL solo si `estado = 'vacante'` (CHECK) |
| `cargo_id` | NULL → `cargos.id`; NOT NULL si `estado = 'vacante'` (CHECK) |
| `tipo_contrato_id` | NULL → `tipos_contrato.id` |
| `sede_id` | NULL → `sedes.id` |
| `jornada_id` | NULL → `jornadas.id` |
| `correo`, `telefono` | NULL |
| `unidad_id` | NOT NULL → `unidades.id` |
| `foto_png` | NULL (base64) |
| `notas` | NULL |

Una vacante es una fila con `estado = 'vacante'`: un cargo sin persona asignada. "Cubrir vacante" = completar los datos y pasar a `activo`.
Índice único parcial: `lower(trim(correo))` donde `correo IS NOT NULL AND deleted_at IS NULL`.

### Puestos y asignaciones (pedido del autor; reemplaza el modelo "vacante = trabajador sin nombre")
El **puesto** (un cargo en una unidad) y la **persona** son cosas distintas, para registrar reemplazos sin pisar al titular y conservar el historial de cada puesto.
- `puestos`: `unidad_id` NOT NULL → `unidades.id`, `cargo_id` NOT NULL → `cargos.id`, `descripcion` NULL, `orden` + comunes. Con los costos activos, también `costo_mensual` (ver "Costo por puesto").
- `asignaciones`: `puesto_id` NOT NULL → `puestos.id`, `trabajador_id` NOT NULL → `trabajadores.id`, `tipo` NOT NULL CHECK in ('titular','reemplazo'), `desde` TEXT NOT NULL (fecha `AAAA-MM-DD`), `hasta` TEXT NULL (NULL = vigente; CHECK `hasta IS NULL OR hasta >= desde`), `motivo` NULL + comunes. Únicos parciales: un **titular vigente** por puesto y un **reemplazo vigente** por puesto (`WHERE hasta IS NULL AND deleted_at IS NULL`, por tipo).
- `trabajadores` pasa a ser solo la **persona**: `nombre` NOT NULL, `correo`, `telefono`, `tipo_contrato_id`, `sede_id`, `jornada_id`, `foto_png`, `notas` (sin `estado`, `cargo_id` ni `unidad_id`).
- **Vacante** = puesto sin titular vigente; si tiene reemplazo vigente se muestra "Vacante · cubre <persona> (reemplazo)". Asignar un titular nuevo cierra la asignación titular anterior (`hasta` = fecha), nunca la borra: así queda el historial.
- **Jefatura:** `unidades.jefe_puesto_id` → `puestos.id` (reemplaza `jefe_id`); el jefe visible es el titular vigente o, si no hay, el reemplazo vigente.
- **Dotación:** puestos con titular vigente (directa y de la rama); vacantes = puestos sin titular vigente. Un reemplazo no suma dotación.
- La unidad, gerencia y área de una persona se derivan de sus asignaciones vigentes (puede tener más de una: titular en un puesto y reemplazo en otro).
- Ficha de la persona: sus puestos vigentes y su historial. Puesto: titular, reemplazo vigente e historial completo, con acciones "Asignar titular", "Registrar reemplazo" y "Terminar asignación" (fecha y motivo).

### Costo por puesto (pedido del autor, 2026-11-01)
Para que un escenario muestre cuánto cuesta una reorganización. Es opcional y va apagado: se activa en Configuración.
- `puestos.costo_mensual` INTEGER NULL, CHECK `>= 0`: costo estimado del puesto en unidades enteras de `meta.moneda`. Es una cifra de planificación, no un registro de remuneraciones: va en el puesto y no en la persona, y un reemplazo no lo cambia.
- **Totales:** costo de la unidad y de su rama = suma de sus puestos, con las vacantes aparte. Un puesto sin costo no cuenta como 0: los totales avisan "N puestos sin costo".
- **Dato sensible:** en un puesto con una sola persona, el costo puede revelar su sueldo. No aparece en la tarjeta del árbol; en Excel sale solo si se marca (§11) y nunca va en el visor HTML. Hasta que exista la base cifrada (Task 19d) queda sin cifrar en el equipo, y Configuración lo advierte al activarlo.

### Preferencias por PC (no van en la BD, no viajan)
Tema, color de acento, columnas elegidas para Excel, filtros del directorio, última carpeta usada, lista de escenarios recientes. En `localStorage` del webview; si la lectura falla se usan valores por defecto.

## 6. Versiones

- **App:** [SemVer 2.0](https://semver.org/lang/es/) con **la etiqueta de git como única fuente** (`vX.Y.Z`). Nadie edita el número a mano en archivos.
  - `scripts/version.mjs` ejecuta `git describe --tags --long --match "v*"` (y `git status` para detectar cambios sin commitear) y arma la versión con una función pura `formatearVersion({ tag, distancia, sha, sucio, fecha })`:

    | Situación | Versión completa | Ejemplo |
    |---|---|---|
    | Compilado exactamente en una etiqueta, sin cambios locales | `X.Y.Z+DDMMAAAA` | `1.2.0+28102026` |
    | N commits después de una etiqueta final | versión siguiente: `X.Y.(Z+1)-dev.N+DDMMAAAA.SHA` (en SemVer `X.Y.Z-dev.N` quedaría *antes* de `X.Y.Z`) | `1.2.1-dev.5+28102026.3f2a1bc` |
    | N commits después de una pre-release | `X.Y.Z-beta.K.dev.N+DDMMAAAA.SHA` | `1.3.0-beta.1.dev.2+28102026.abc1234` |
    | Con cambios sin commitear | se agrega `.sucio` a los metadatos | `1.2.1-dev.5+28102026.3f2a1bc.sucio` |
    | Repositorio sin etiquetas | como si la última fuera `0.0.0` | `0.0.1-dev.12+28102026.3f2a1bc` |

  - `DDMMAAAA` = fecha de compilación en zona `America/Santiago` (fija, para que el runner en UTC no cambie el día). Va como metadato de compilación de SemVer (`+…`), que el estándar permite y que no altera el orden de versiones.
  - El script entrega a Vite las constantes `__APP_VERSION__` (completa), `__APP_VERSION_CORTA__` (sin metadatos: `1.2.0` o `1.2.1-dev.5`), `__APP_FECHA__` (`DDMMAAAA`) y `__APP_COMMIT__` (SHA).
  - `scripts/release.mjs` (usado por `npm run release` y por el workflow) pasa `X.Y.Z` a Tauri con `--config`, sin modificar archivos versionados, porque el instalador de Windows solo acepta `X.Y.Z`. En el workflow, además, falla si la versión calculada no coincide con la etiqueta empujada.
  - Se muestra en "Acerca de", en la barra de estado de Configuración, en portada/pie del PDF, en la hoja Información del Excel y en `meta.app_version_ultima`.
- **Esquema BD:** número de migración. Al abrir una base con esquema menor → respaldo automático y migración. Al importar o abrir un archivo con esquema **mayor** → se rechaza con "Actualiza BoldoAtlas para abrir este archivo".
- **Datos:** `data_revision` + `db_id` + `db_creada` (+ `escenario_nombre` si aplica) identifican de qué base y momento viene un archivo, PDF o Excel.

## 7. UX/UI

### Estructura de la ventana
- **Barra lateral izquierda** (colapsable): arriba, las secciones del programa: Árbol · Árboles · Directorio · Indicadores · Escenarios · Importar/Exportar; abajo, separadas: Configuración · Ayuda · Acerca de.
- **Idiomas:** español e inglés en toda la interfaz (`vue-i18n`; diccionarios `src/i18n/es.json` y `en.json`). El idioma inicial sigue al de Windows (`es*` → español, otro → inglés) y se cambia en Configuración (preferencia por PC). Ningún texto de interfaz va literal en componentes, stores ni mensajes de error. Los datos que ingresa el usuario (nombres de unidades, valores de mantenedores) no se traducen. Fechas y números con `Intl` según el idioma.
- **Ayuda:** sección con páginas en Markdown por idioma (`ayuda/es/*.md`, `ayuda/en/*.md`), mostradas dentro de la app y publicadas también en el sitio web (una sola fuente). Cada función nueva agrega su página en ambos idiomas.
- **Barra superior:** nombre de la organización, insignia de escenario activo (color de acento + nombre) si no es la base principal, búsqueda global, botón Exportar, indicador "Guardado".
- **Área central:** la vista elegida.
- **Panel derecho contextual:** se abre al seleccionar una unidad, proceso o persona; se cierra con Esc. No tapa el lienzo: lo desplaza.

### Comentarios del autor tras probar el ejemplo (2026-10-30)
- **Menú de la app** (botón con el logo/nombre en la barra superior, también en la paleta): Inicio (vuelve a la Bienvenida en cualquier momento), Nueva organización vacía, Explorar el ejemplo, Abrir `.boldo` (Fase 5), Importar Excel (Fase 4), Respaldos, Configuración. Reemplazar los datos actuales (nueva vacía o ejemplo) pide confirmación explícita y hace antes un respaldo automático; la Bienvenida también lo advierte si ya hay datos.
- **Configuración, Ayuda y Acerca de se comportan como interruptores:** un segundo clic en su entrada (o Esc, o el botón Cerrar visible) vuelve a la vista anterior.
- **Todo panel lateral se puede cerrar o plegar con un control visible:** la barra izquierda tiene su botón de plegar en la propia barra (además del de la barra superior) y el panel derecho tiene "Cerrar" (×) además de Esc.
- **Menú contextual (clic derecho)** en unidad, puesto y fondo del lienzo, con las acciones de su elemento (nueva subunidad, renombrar, abrir panel, ver personas, expandir/contraer rama, duplicar, abrir como árbol, copiar/pegar estilo, eliminar…); también se abre con `Shift+F10` o la tecla Menú.
- **Expandir y contraer:** "Expandir todo" y "Contraer todo" en la barra del lienzo; "Expandir rama" y "Contraer rama" en el menú contextual de una unidad; "Contraer hasta el nivel N".
- **Orden del diagrama:** el layout automático debe verse ordenado por defecto (superiores centrados sobre sus hijos, hermanos en su orden, niveles alineados, conexiones laterales sin deformar el árbol). Opción "Orden estricto por niveles" (activable) y botón "Reordenar" que vuelve a calcular y encuadrar.
- **Personas de una unidad:** la dotación de la tarjeta es clicable y abre la lista de personas; el panel de unidad tiene la pestaña **Personas** (titulares y reemplazos vigentes, con interruptor "Incluir subunidades") y "Ver en el directorio" (directorio filtrado por esa unidad y su rama).
- **Divulgación progresiva en toda la app:** por defecto se muestran solo las opciones básicas; las avanzadas van en secciones "Más opciones" plegables (recordadas por PC). Aplica a la barra del lienzo, panel Vista, panel de unidad, diálogo de puesto, ficha, directorio y configuración.
- **Qué proyecto está abierto:** el título de la ventana y la barra superior muestran el nombre de la organización y el tipo de base (principal o escenario, con su nombre); un clic en ese nombre muestra dónde están los datos (carpeta portable o del perfil, ruta del archivo, tamaño, última modificación) con "Abrir carpeta" y "Copiar ruta". Cuando lleguen los escenarios (Fase 5), "Abrir proyecto" lista la base principal y los escenarios.
- **Pestañas de trabajo dentro del mismo proyecto:** una barra de pestañas sobre el área central permite tener abiertas a la vez distintas partes (árbol completo, un subárbol, el directorio con un filtro, una persona…). "Abrir en pestaña nueva" desde el menú contextual, la paleta, Ctrl+clic o clic central; Ctrl+T nueva, Ctrl+W cerrar, Ctrl+Tab cambiar; se reordenan arrastrando y se recuerdan por PC. Cada pestaña guarda su ruta y su estado (ramas plegadas, selección, encuadre, filtros); solo la pestaña activa queda montada, para no multiplicar el costo del lienzo.
- **Comparar dos proyectos:** se resuelve con "Comparar" de Escenarios (Fase 5), que además ofrecerá ver ambos árboles lado a lado con las diferencias resaltadas.
- **Personas de una unidad (ampliado):** la pestaña Personas lista titulares y reemplazos con foto, cargo, tipo y unidad; búsqueda y orden; resumen por cargo (cuántos y vacantes); vista previa de la ficha individual en el mismo panel (foto, contacto, puestos vigentes e historial) con "Abrir ficha" para editar; "Copiar correos" de la lista; exportar la lista llega con Excel (Fase 4).
- **Personas dentro del diagrama:** la tarjeta de unidad muestra al jefe (foto o iniciales, nombre y cargo) y hasta 4 fotos pequeñas del equipo con "+N"; clic abre la pestaña Personas. Se puede ocultar en Personalizar diagrama.
- **Calendario de cambios:** en «Ver en otra fecha» los días con cambios se destacan; al elegir uno se listan sus cambios en frases simples (quién asumió o dejó un puesto, unidades y puestos creados o eliminados) y se puede saltar al cambio anterior o siguiente.
- **Idioma a la vista:** selector español/inglés en la Bienvenida, el menú de la app y Configuración; app, ayuda y sitio web completos en ambos idiomas.
- **Revisión visual de los temas claro y oscuro:** paleta de tokens refinada (superficies, bordes, texto secundario con AA real, acento), jerarquía visual más clara y consistencia de espaciado; se valida con capturas en ambos temas.

### Primer uso
Pantalla de bienvenida con cuatro caminos, cada uno con una línea de explicación:
crear organización vacía · cargar desde Excel (con enlace a la plantilla) · abrir/importar un `.boldo` · explorar un ejemplo (base de muestra que se puede borrar).

### Edición
- **Guardado automático**: no existe botón "Guardar"; cada cambio se guarda al confirmar el campo y el indicador pasa a "Guardado".
- En el lienzo: botón "+" en la tarjeta para crear subunidad; arrastrar una tarjeta sobre otra cambia su superior (con validación de ciclo y aviso); doble clic edita el nombre.
- **Eliminar** muestra un aviso con **Deshacer** durante 8 s (posible porque el borrado es lógico). Eliminar una unidad con hijos o personas pide elegir: mover su contenido a la unidad superior o cancelar.
- Confirmación explícita solo para acciones masivas: reemplazar base, aplicar fusión, aplicar carga masiva.

### Navegación y búsqueda
- **Paleta de comandos `Ctrl+K`**: buscar unidades, personas y procesos, y ejecutar acciones ("Nueva unidad", "Exportar PDF", "Cambiar tema"…).
- Atajos: `N` nueva unidad hija de la seleccionada, `F` buscar en el lienzo, `Supr` eliminar, `Esc` cerrar panel, `Ctrl+0` encuadrar todo.
- Migas de pan Gerencia › Área › Subárea en el panel derecho, clicables.

### Estados y retroalimentación
- Estados vacíos con una acción sugerida (p. ej. "Esta unidad no tiene procesos — Agregar proceso").
- Progreso visible en tareas largas (PDF, carga masiva, fusión) con opción de cancelar antes de escribir.
- Mensajes de error en lenguaje claro, indicando qué pasó y qué hacer; nunca códigos sueltos.

### Al cerrar la ventana (pedido del autor, 2026-11-01)
Reemplaza la regla anterior "cerrar la ventana siempre cierra la app".
- El diálogo "¿Seguro que quieres salir?" ofrece tres salidas: **Cancelar**, **Dejar en la bandeja** (oculta la ventana y la app sigue abierta con su icono, disponible al instante) y **Cerrar la app**, con la casilla **No volver a preguntar**, que recuerda la elección.
- En Configuración: "Al cerrar la ventana": Preguntar (por defecto) | Dejar en la bandeja | Cerrar la app. Por PC.
- **Trabajo en curso:** si se está generando un archivo, importando o respaldando, el diálogo dice qué trabajo es y que cerrar lo interrumpirá, aunque se haya marcado "No volver a preguntar". Dejar en la bandeja no lo interrumpe, y el icono de la bandeja dice que está en curso y cuándo termina; si falla, la ventana vuelve al frente con el error. Cerrar con un trabajo en curso lo interrumpe: un archivo parcial nunca queda con nombre válido. Las copias en claro de `datos/` se borran al volver a abrir la app; un `.boldo.tmp` cifrado que quede junto al destino tras un corte se borra a mano.
- Sin bandeja disponible (Linux sin appindicator) no se ofrece "Dejar en la bandeja", y una preferencia guardada con esa opción vale como "Preguntar".
- **Salir de verdad:** "Salir" de la bandeja y del menú de la app cierra la app. Con "Preguntar" o con un trabajo en curso muestra el mismo diálogo, que también ofrece la bandeja; una preferencia guardada de bandeja no lo oculta. Dejar en la bandeja no aplica a actualizar, restaurar un respaldo, el instalador ni el apagado del sistema, que cierran como hasta ahora.
- Con la app en la bandeja, volver a abrirla (acceso directo o clic en el icono) muestra la ventana sin arrancar otra copia.

### Accesibilidad y aspecto
- Contraste mínimo WCAG AA en ambos temas; si el color de acento elegido no alcanza contraste sobre el fondo, el texto encima del acento cambia automáticamente a blanco o negro.
- Foco visible y toda acción alcanzable por teclado (incluido el lienzo: flechas recorren nodos).
- Ventana mínima 1024×700; escala de interfaz ajustable (90 %–125 %) en Configuración.
- Sistema visual: Inter, iconos Lucide, radios de 8 px, sombras suaves, espaciado en múltiplos de 4 px; tokens de color definidos una vez en CSS para claro y oscuro.

### Validación del diseño antes de programar
**Fase 0 de la implementación:** maquetas interactivas (HTML) de las pantallas clave —bienvenida, árbol con panel, ficha, directorio, indicadores, revisión de fusión, carga masiva y exportar— para que el autor las apruebe antes de escribir la app.

## 8. Vistas de trabajo

### Administrador de árboles y subárboles
- Una base puede tener **varios árboles independientes** (uno por raíz).
- Cualquier unidad se puede **abrir como árbol**: el lienzo muestra solo su rama, con esa unidad como raíz. No es una copia: sigue colgando de su superior y lo que se edita ahí se edita en el árbol completo. Arriba del lienzo, la ruta de origen (`Gerencia General › Operaciones › Mantención`, cada tramo clicable), "Subir un nivel" y "Ver en el árbol completo".
- Vista **Árboles** (barra lateral): lista cada árbol independiente (nombre de la raíz, dotación total) y, debajo, sus **subárboles guardados**; permite crear un árbol nuevo (nueva raíz), abrir cualquiera, y renombrar, reordenar o quitar un subárbol guardado (quitarlo no borra la rama). Desde el lienzo o el panel de unidad: "Abrir como árbol" y "Guardar en Árboles".
- Tabla `subarboles_guardados`: `unidad_id` NOT NULL → `unidades.id`, `nombre` NULL (por defecto se muestra el de la unidad), `orden` INTEGER NOT NULL DEFAULT 0 + comunes; único parcial (`unidad_id`) donde `deleted_at IS NULL`. Es dato de la organización: viaja en el `.boldo` (en una exportación parcial, solo los de unidades incluidas). Si la unidad se elimina, el subárbol guardado deja de mostrarse.

### Árbol (lienzo)
Vue Flow con el árbol completo, zoom, mover, minimapa, colapsar/expandir ramas.
Tarjeta de unidad: tipo, nombre, foto y nombre del jefe (o "Sin jefatura"), dotación total de la rama, vacantes (si hay), chips de etiquetas.
Aristas jerárquicas sólidas; conexiones laterales punteadas con etiqueta.
**Filtro por etiqueta o por texto:** las unidades que coinciden se resaltan y el resto se atenúa (no se ocultan, para no perder contexto). Además se puede resaltar por **vacantes**, **sede**, **tipo de contrato**, **jornada** o **cargo** (pedido del autor).

**Personalizar el diagrama (pedido del autor; preferencias del árbol, no datos de la organización):**
- Dirección: vertical (arriba→abajo) u horizontal (izquierda→derecha); densidad: normal o compacta (menos separación y tarjetas de una línea, para árboles gigantes).
- Tarjeta: qué datos muestra (tipo, jefe, foto del jefe, dotación, vacantes, etiquetas, ruta por tipo, puestos) y estilo de líneas (rectas en ángulo o curvas).
- **Vistas guardadas:** una combinación de dirección, densidad, tarjeta, "Colorear por", filtros de resaltado y ramas plegadas se guarda con nombre por árbol (raíz o subárbol guardado) y se aplica con un clic. Viajan con la base (tabla `vistas`: `arbol_id` NULL = árbol completo, `nombre`, `config` JSON validado al leer + comunes). Las exportaciones de la Fase 4 ofrecen elegir una vista guardada.
- **"Colorear por" con escala (pedido del autor, 2026-11-01):** además de las marcas y la leyenda, antigüedad del titular en el puesto (desde `asignaciones.desde`; las vacantes, aparte) y personas a cargo, con la leyenda de rangos a la vista y sin depender solo del color (el valor también se lee en la tarjeta).

**Selección múltiple (pedido del autor):** `Ctrl`/`Shift`+clic o recuadro con arrastre; mover las seleccionadas bajo otro superior en un lote (validando ciclos), plegarlas, etiquetarlas o eliminarlas (un solo "Deshacer"). **Duplicar rama:** copia una unidad con sus descendientes, etiquetas y puestos (sin asignaciones: las copias nacen vacantes), con nombre "<nombre> (copia)".

**Organigrama a una fecha (pedido del autor):** selector de fecha en la barra del lienzo; con una fecha elegida, jefes, dotación, vacantes y puestos se calculan con las asignaciones vigentes ese día (`desde <= fecha` y (`hasta` NULL o `hasta > fecha`)) y se ocultan las unidades y puestos eliminados antes y los creados después que no tengan asignaciones (ni descendientes) visibles a esa fecha, para que una organización ingresada hoy con fechas pasadas se vea completa. Es de solo lectura (banda "Viendo al <fecha>" con "Volver a hoy"). Límite declarado: los cambios de superior de una unidad no se registran, así que la forma del árbol es la actual.

### Revisión de datos (pedido del autor)
Vista "Revisión" (entrada del menú) con listas accionables, cada fila abre la unidad, puesto o persona: unidades sin jefatura, puestos vacantes (con días desde la última titular), reemplazos vigentes, personas sin puesto vigente, correos repetidos, nombres de persona parecidos (misma normalización que los mantenedores), unidades sin puestos ni hijos, valores de mantenedor sin uso. Un contador en el menú muestra el total de avisos. Todo se calcula en memoria con funciones puras sobre el estado del store.

### Panel de unidad
Pestañas: Resumen (datos, jefe, etiquetas, indicadores) · Procesos (con SIPOC, atributos y actividades) · Personas.

### Proceso
Formulario con datos generales, atributos (frecuencia, criticidad, estado, documento), bloque SIPOC (cuatro columnas) y lista de actividades. Cada actividad tiene una mini-matriz RACI: se agregan personas y se elige su rol.

### Ficha de trabajador
Formulario modal; cargo, tipo de contrato, sede y jornada se eligen de sus mantenedores (se puede agregar un valor nuevo desde la misma lista; si ya existe uno igual sin importar mayúsculas ni tildes, se sugiere ese en vez de duplicarlo); muestra la ruta Gerencia › Área › Subárea derivada, su jefe (el de su unidad), las actividades en que participa con su rol RACI y las unidades que encabeza.

### Directorio
Tabla de personas y vacantes con búsqueda y filtros por unidad (incluye su rama), cargo, tipo de contrato, sede, jornada, etiqueta de la unidad y estado. Columnas ordenables. Clic abre la ficha. Botón "Exportar esta lista a Excel" (respeta filtros).

### Indicadores
Calculados al vuelo con funciones puras sobre los datos (sin tablas extra):

| Indicador | Definición |
|---|---|
| Dotación directa | puestos de la unidad con titular vigente (§5; un reemplazo no suma) |
| Dotación total | dotación directa de la unidad + toda su rama |
| Vacantes (directas / rama) | puestos sin titular vigente |
| Personas a cargo del jefe | titulares vigentes de la unidad (menos el propio jefe) + jefes de sus subunidades directas |
| Procesos / actividades | conteos directos y de rama |
| Cobertura RACI | % de actividades con al menos un R y exactamente un A |
| Costo (directo / rama), con costos activos | suma de `puestos.costo_mensual`, con las vacantes aparte y el aviso de puestos sin costo (§5) |

Vista Indicadores: tarjetas con totales de la organización, tabla por unidad ordenable, y listas "unidades sin jefatura", "procesos sin actividades", "actividades sin responsable". Clic en cualquier fila lleva a la unidad en el árbol.

### Escenarios
- **Guardar como escenario:** copia la base actual con `VACUUM INTO` a `escenarios/<nombre>.db` (archivo interno sin cifrar: no sale del equipo), con nuevo `db_id`, `escenario_nombre` y `escenario_origen_id`. Para compartir un escenario se exporta como cualquier base (`.boldo` cifrado).
- **Abrir escenario:** cambia la base activa; la barra superior muestra la insignia del escenario y "Volver a la base principal".
- **Comparar:** elige dos bases (p. ej. principal vs escenario) y muestra el resultado de `comparar` (Rust, §9) en solo lectura: unidades nuevas, eliminadas, movidas (cambio de `parent_id`), cambios de jefatura, personas reasignadas, y diferencia de indicadores (dotación, vacantes) por unidad. Exportable a Excel. Modo "lado a lado" (pedido del autor): los dos árboles en paralelo con encuadre sincronizado y las diferencias resaltadas.
- **Costo de la reorganización (pedido del autor, 2026-11-01):** con costos activos, la comparación agrega la diferencia de costo por unidad y en total, y avisa si alguna de las dos bases tiene puestos sin costo, porque entonces la diferencia es parcial.
- **Notas por cambio (pedido del autor, 2026-11-01):** en un escenario se puede explicar el porqué de un cambio en una unidad o un puesto (tabla `escenario_notas`: `entidad`, `entidad_id`, `texto` + comunes, solo con contenido en escenarios). Salen junto al cambio en la comparación y en su Excel.
- Pasar un escenario a la base principal = importar con "Reemplazar todo" o "Revisar y decidir" (sección 9), sin flujo nuevo.

## 9. Exportar e importar `.boldo`

**Formato propio y cifrado.** Cada PC es un ambiente aislado y el archivo viaja por correo o pendrive con datos personales, así que va cifrado y solo se abre con un código que se entrega aparte.
- Contenido: copia SQLite completa generada con `VACUUM INTO` (incluye `meta`, logo y esquema), cifrada con **XChaCha20-Poly1305**; la clave se deriva del código con **Argon2id** (memoria 64 MiB, 3 pasadas, 1 hilo) y una sal aleatoria por archivo.
- Cabecera en claro, solo lo necesario para descifrar: identificador `BOLDO`, versión del formato, parámetros de Argon2id, sal y nonce. Nada más va en claro (ni el nombre de la organización ni las versiones: esos datos están dentro del contenido cifrado, en `meta`).
- Todo el cifrado y descifrado ocurre en Rust (crates `argon2` y `chacha20poly1305` de RustCrypto), nunca en el frontend.

**Exportar:** diálogo "Guardar como" → `Organizacion_AAAA-MM-DD_rN.boldo`. La app genera un **código único para ese archivo**: 20 caracteres del alfabeto Crockford base32, sin caracteres confusos (sin O/0 ni I/1/L), en grupos de 4 (`K7QM-2XRP-9DWN-H4TB-V3CJ`, unos 100 bits). Se muestra **una sola vez** con "Copiar código" y la recomendación de enviar el archivo y el código **por canales distintos**. El código no se guarda en ningún lado: si se pierde, ese archivo no se puede abrir y hay que exportar de nuevo (otro archivo, otro código).

**Alcance de la exportación.** Al exportar se elige qué llevar: **toda la base**, o **uno o más árboles o ramas** (lista de unidades con casillas; marcar una unidad incluye toda su rama; una base puede tener varios árboles independientes, uno por raíz).
- **Historial (decisión del autor, 2026-11-01):** el historial de los puestos de la rama viaja siempre con el archivo, sin casilla. Quienes ya no están en la rama viajan solo con nombre y correo, sin teléfono, notas, foto ni mantenedores: la fusión (modo B) no debe tomar esos campos vacíos como diferencia. Una persona sin asignación vigente en un archivo parcial es de este tipo.
- Una exportación parcial lleva: las unidades elegidas con sus descendientes, las personas y vacantes de esas unidades, los valores de mantenedor que esas personas usan, las etiquetas de esas unidades, las conexiones laterales con **ambos** extremos incluidos y (Fase 3) los procesos, actividades y roles RACI de esas unidades.
- Lo que quedaría apuntando fuera de la selección se corta en la copia y se resume antes de guardar ("2 conexiones y 1 jefatura no se incluyen"): conexiones con un extremo fuera, `jefe_id` de una persona que no va (la jefatura queda vacía en la copia) y roles RACI de personas que no van.
- Se arma en Rust: `VACUUM INTO` a un temporal, se borran de ese temporal las filas fuera del alcance en una transacción, se cifra y se borra el temporal. `meta` de la copia agrega `alcance` (`completo` | `parcial`), los ids de las raíces exportadas y el `db_id` de origen.

**Importar:** se pide el código; Rust descifra a un archivo temporal dentro de `datos/`. Si el archivo es **parcial**, "Reemplazar todo" queda deshabilitado con la explicación (borraría el resto de la base) y, si la unidad superior de una rama exportada no existe en la base de destino, se pregunta dónde colocarla: dentro de una unidad elegida o como árbol independiente. Si el código no corresponde o el archivo fue alterado, el descifrado falla y se muestra "El código no es correcto o el archivo está dañado", sin tocar la base local. Con el contenido descifrado se abre una segunda conexión de solo lectura, se valida el esquema (sección 6) y se elige el modo; el temporal se borra al terminar o al cancelar. **Antes de aplicar cualquier modo se guarda un respaldo** en `respaldos/` con fecha (se conservan los últimos 20).

### Modo A — Reemplazar todo
La base local se sustituye por el archivo importado (tras el respaldo).

### Modo B — Agregar lo nuevo
Lo que no existe entra y lo que existe se queda como está; lo que no entra se informa. Sin decisiones por registro.

### Modo C — Revisar y decidir
Disponible con archivos completos y parciales. Comparación por `id` en todas las tablas de negocio, en Rust: `src-tauri/src/intercambio/comparar.rs` recorre las dos bases en orden de `id` sin cargarlas, porque un archivo puede traer cientos de miles de filas, y no escribe nada. Es lo que reutiliza Escenarios → Comparar, con sus dos conexiones. Las decisiones también viven en Rust (`revision.rs`), junto al identificador del trabajo: a la interfaz solo llega la página que se ve, y lo aplicado sale de ahí, no de lo que la interfaz envíe al final.

«Mío» es la base local. `updated_at` y `deleted_at` vienen de un archivo no confiable: solo sirven para preseleccionar. Una fecha futura o que no es una fecha se marca, nunca cuenta como la más reciente, y no borra ni revive nada sin que alguien lo decida.

| Caso | Detección | Por defecto | Opciones | ¿Bloquea «Aplicar»? |
|---|---|---|---|---|
| Idéntico | mismos campos (sin contar las marcas de tiempo; NULL y vacío son iguales), o eliminado en los dos lados | ignorar (oculto) | — | no |
| Solo aquí | `id` solo en la base local | se queda: nunca se borra por no venir | — | no |
| Nuevo | `id` solo en el archivo, vivo | agregar | desmarcar | no |
| Eliminado solo en el archivo | `id` solo en el archivo, eliminado | no entra, salvo un valor de mantenedor que una fila viva usa | — | no |
| Se une | valor de mantenedor o etiqueta con otro `id` y el mismo nombre normalizado | se usa el de aquí, y no cuenta como diferencia en lo que lo usa | — | no |
| Diferente | mismo `id`, campos distintos | campo a campo; preselecciona el `updated_at` más reciente y confiable | «mío»/«archivo» por registro o campo; «aceptar todos los más recientes», «todo lo mío», «todo lo del archivo» | no |
| Borrado vs editado | un lado `deleted_at`, el otro `updated_at` posterior, o una fecha no confiable | mantener (revive con los datos del archivo si el borrado es local); con fecha no confiable, no cambia nada | borrar / mantener | no |
| Borrado sin conflicto | un lado borrado, el otro sin cambios posteriores | aplicar el borrado (si el borrado es local, sigue borrado) | revertir | no |
| Duplicado de persona | persona nueva y persona local con el mismo correo normalizado | — | unir (se conserva la ficha local, con sus datos o los del archivo, y se reasignan `asignaciones` y `actividad_roles`) / editar el correo de la del archivo | **sí** |
| Otra regla única | p. ej. dos titulares vigentes en un puesto, dos Aprobadores en una actividad, dos vistas con el mismo nombre en un árbol, un valor renombrado al nombre de otro | — | elegir cuál conservar. Si gana la del archivo, la local se da de baja; una asignación se cierra en vez de borrarse | **sí** |
| Misma etiqueta en la misma unidad, misma rama guardada | otra fila con otro `id` para lo mismo | se usa la de aquí | — | no |
| Mezcla no válida | los campos elegidos no cumplen una regla de la fila (`hasta >= desde`, `origen <> destino`) | — | conservar lo mío, o elegir otros campos | **sí** |
| Referencia rota | tras aplicar, una fila viva (también una que solo está aquí) apunta a algo inexistente o eliminado. Apuntar a un valor de mantenedor desactivado es válido. Las que ya estaban rotas antes de aplicar no cuentan | marcar | reasignar a… / dejar vacío si la columna lo permite / descartar el registro; o resolver todas: vacío lo que se pueda, fuera lo demás | **sí** |
| Ciclo | la jerarquía resultante forma un círculo | marcar | reasignar su superior / dejarla sin superior | **sí** |

Primero se ve un resumen por tipo de caso con contador; el detalle se abre si se quiere, paginado de a 50 y sin mostrar nunca un id. `foto_png` y `config` se comparan sin mostrar su contenido, y un texto se corta a 1.000 caracteres.

En un archivo parcial, lo que la exportación corta no es una diferencia: su raíz vuelve a colgar de su superior o queda donde está, una jefatura vacía porque su puesto no viajó no borra la local, y lo que no viajó no se borra.

**Antes de aplicar:** las reglas de referencias, ciclos e índices únicos se revisan con la misma pasada que aplica, deshecha al final (`verificar`), sobre la selección real; corre sola al decidir. Si una regla única choca solo por el orden de escritura (una cadena de renombres) se reintenta; dos filas que se cambian un valor entre sí quedan como bloqueo.

**Al aplicar:** respaldo previo y una única transacción; si algo no calza, no se escribe nada. Solo vale para el identificador de trabajo y la versión de las decisiones que se verificó. Cada caso guarda una huella de la fila local al comparar: si una cambió desde entonces, se avisa sin aplicar y se ofrece comparar de nuevo, y lo decidido sobre lo que no cambió se conserva.

Las decisiones se pierden al cancelar. Salir de la revisión con decisiones avisa antes; si se sale navegando, la navegación no se retiene y un diálogo global pregunta si se vuelve o se descarta. Mientras haya decisiones, cerrar la app pregunta, como con un trabajo en curso.

Limitación aceptada: sin una base común de referencia, «Diferente» no distingue quién cambió qué; por eso se muestra siempre y se preselecciona el más reciente.

## 10. Carga masiva desde Excel/CSV

- **Plantilla descargable** `Plantilla_BoldoAtlas.xlsx` con hojas `Unidades`, `Trabajadores` y `Puestos`, encabezados fijos, validación de listas (tipo) y 3 filas de ejemplo. Una hoja `Instrucciones` explica cada columna.
- **Unidades:** columnas `tipo, nombre, unidad_superior, jefe_correo, descripcion, etiquetas`. La unidad superior se escribe como ruta con `›` o `/` (ej. `Gerencia de Operaciones / Logística`); las rutas inexistentes se crean en orden. `jefe_correo` marca como jefatura (`jefe_puesto_id`) el puesto de esa persona en la unidad; si no tiene uno ahí, la vista previa da un error de fila.
- **Trabajadores:** una fila por persona, con columnas `nombre, correo, telefono, tipo_contrato, sede, jornada, notas`. Tipo de contrato, sede y jornada se escriben por nombre; los que no existan en su mantenedor aparecen en la vista previa como "valores nuevos" y se crean solo al confirmar. Si el correo ya existe en la base → se **actualiza** esa persona; si no → se crea. Sin correo siempre se crea, y la vista previa lo avisa si ya hay alguien con ese nombre.
- **Puestos:** una fila por puesto (§5 "Puestos y asignaciones"), con columnas `unidad, cargo, descripcion, titular, reemplazo, desde`. `unidad` se escribe como ruta y `cargo` por nombre, igual que los mantenedores. `titular` y `reemplazo` son el correo de la persona o su nombre si es único en el archivo; un puesto sin titular es una vacante. Las asignaciones nuevas empiezan en `desde` (hoy si va vacío). Si el puesto ya tiene otro titular, se cierra la asignación anterior, nunca se borra, y la vista previa lo muestra.
- Se aceptan `.xlsx` y `.csv` (UTF-8, separador `,` o `;` detectado). En CSV se carga una hoja por archivo y se elige cuál es.
- **Vista previa obligatoria:** resumen (unidades a crear, personas a crear/actualizar, puestos a crear, vacantes y titulares que cambian) y tabla de errores por fila con hoja, fila, columna y mensaje (p. ej. "tipo 'gerncia' no válido", "unidad 'X' no existe y no tiene ruta completa", "correo repetido en el archivo"). Con errores no se puede aplicar; se puede descargar el archivo de errores para corregir.
- Al aplicar: respaldo automático, una sola transacción, `data_revision` +1.
- Validación en función pura `src/features/carga/validar.ts`.
- **Archivos de otros sistemas (pedido del autor, 2026-11-01):** la carga reconoce por sus encabezados los Excel que exportan sistemas de RR.HH. como Buk y Talana, y propone cómo asignar sus columnas a las de `Trabajadores`; se puede corregir a mano y sigue pasando por la misma vista previa. Es de una sola vía y sin API. Antes de implementarlo hay que conseguir archivos reales: sus formatos no están verificados.

## 11. Capturas, PDF, Excel y visor

Todas las exportaciones comparten un **selector de alcance**: toda la organización / una gerencia / una rama (unidad + descendientes). Tras guardar se ofrece "Abrir carpeta". Respetan la fecha elegida en "Organigrama a una fecha" y el escenario abierto, y lo dicen en el archivo. Los registros eliminados no salen. 

**Aceptación obligatoria (pedido del autor, 2026-11-01).** Salvo el `.boldo`, los archivos exportados no van cifrados. Antes de generar un Excel, un PDF, una captura o un visor HTML, un diálogo avisa que la información quedará sin cifrar y que es responsabilidad de quien genera el archivo, y hay que aceptarlo para continuar. Se pide en cada exportación, sin opción de no volver a preguntar. Sin aceptar no se genera nada.

### Capturas (SVG/PNG)
**Renderizador propio de SVG** (`src/features/export/treeSvg.ts`): a partir de las posiciones de elkjs dibuja tarjetas (nombre, jefe, dotación, etiquetas), aristas y conexiones con la paleta de exportación (siempre fondo claro), más logo, título y fecha. Se usa para SVG, PNG y PDF, así todo se ve igual y el PDF queda vectorial. (No se usa `html-to-image`: genera `foreignObject`, que pdfmake no renderiza.)
- **SVG:** directo.
- **PNG:** el mismo SVG rasterizado vía `canvas` a 2x/3x/4x.

### PDF (pdfmake)
Opciones: alcance + secciones a incluir (diagrama, indicadores, procesos con SIPOC, actividades con RACI, personas).
1. Portada: logo, nombre de la organización (y escenario si aplica), título, fecha de generación, versión app, versión esquema, revisión.
2. Índice.
3. Resumen de indicadores del alcance.
4. Diagrama del alcance (página apaisada si conviene).
5. Una sección por unidad: nombre destacado, ruta Gerencia › Área › Subárea, jefe, indicadores de la unidad, diagrama de su rama, procesos (atributos + SIPOC en tabla de 4 columnas), actividades con su RACI, y personas.
6. Pie en cada página: logo pequeño, página N de M, versiones.

**Organigramas grandes (pedido del autor, 2026-11-01):** tamaño de hoja (carta, oficio, A4, A3 y A2) y orientación; el diagrama se puede ajustar a una página o repartir en varias, con marcas de continuación que indican en qué página sigue cada rama. Imprimir solo una rama ya lo cubre el selector de alcance. El mismo diagrama se puede exportar a **PPTX** (una diapositiva por rama), en una entrega posterior.

**Manual de organización y funciones (pedido del autor, 2026-11-01):** una plantilla de este PDF con todas las secciones activas y, en cada unidad, sus puestos con su `descripcion`, titular y vacantes. No agrega datos nuevos: ordena en un documento formal lo que ya está en la base.

### Excel (ExcelJS)
Hay dos formas de exportar los registros (pedido del autor, 2026-11-01):
- **Exportación completa**, desde el menú: las hojas de la tabla de abajo.
- **"Exportar esta lista a Excel"**, en cada lista de la app (Directorio, Revisión, Mantenedores, personas de una unidad, y Procesos, Indicadores e Historial cuando existan): exporta lo que se ve, con sus filtros, orden y columnas, más la hoja Información con los filtros aplicados.

Opciones de la exportación completa: alcance + qué hojas incluir + qué columnas de cada hoja (casillas, todas marcadas por defecto salvo notas y costos; la selección se recuerda por PC).

| Hoja | Columnas disponibles |
|---|---|
| Información | organización, escenario, fecha de generación, versión app, versión esquema, revisión, `db_id`, alcance elegido (siempre incluida) |
| Unidades | tipo, nombre, descripción, unidad superior, ruta completa, jefe, correo del jefe, etiquetas, dotación directa, dotación total, vacantes, nº procesos |
| Puestos | unidad, ruta completa, cargo, descripción, leyenda, titular, reemplazo vigente, vacante (sí/no), días vacante, costo mensual (con costos activos) |
| Asignaciones | persona, correo, cargo, unidad, tipo (titular/reemplazo), desde, hasta, motivo |
| Conexiones | origen, destino, etiqueta |
| Procesos | unidad, ruta, nombre, descripción, frecuencia, criticidad, estado, documento, proveedores, entradas, salidas, clientes, nº actividades |
| Actividades | unidad, proceso, nombre, descripción, responsables (R), aprobador (A), consultados (C), informados (I) |
| Matriz RACI | filas = actividades (agrupadas por proceso), columnas = personas involucradas, celdas = R/A/C/I |
| Trabajadores | nombre, correo, teléfono, tipo de contrato, sede, jornada, cargos vigentes, unidades vigentes, rutas completas, jefes, notas (una fila por persona; si tiene varios puestos vigentes, separados por ` · `) |
| Mantenedores | catálogo (cargo, tipo de contrato, sede, jornada, tipo de unidad, etiqueta), nombre, usos |
| Indicadores | una fila por unidad con todos los indicadores de la sección 8 |

Las hojas de procesos, actividades e indicadores se ofrecen cuando esas funciones existan. Las fotos no se exportan.

Formato: encabezado con color de marca y fijo, autofiltro, ancho de columna ajustado, logo en la hoja Información. Las fechas y los números van como tales, para poder filtrarlos y sumarlos. **El texto siempre se escribe como texto, nunca como fórmula**: un nombre que empieza con `=`, `+`, `-` o `@` no se ejecuta al abrir el archivo. Los IDs internos no se exportan salvo que se marque la columna opcional "ID". Nombre: `Organizacion_AAAA-MM-DD_rN.xlsx`.

### Visor HTML (pedido del autor, 2026-11-01)
Para compartir el organigrama con quien no tiene la app, sin servidor: un solo archivo `.html` que se abre en cualquier navegador, con zoom, plegar ramas y búsqueda.
- **Qué lleva:** alcance + vista guardada + campos elegidos. Por defecto: estructura, cargo y nombre del titular. Correo y teléfono se marcan a mano; notas, fotos y costos no se pueden incluir.
- **Es una foto:** muestra su fecha de generación y no se actualiza. Hay que volver a exportarlo.
- **Autónomo y seguro:** sin recursos externos ni conexiones (CSP que lo impide), y con los datos escapados, para que un nombre con `</script>` no ejecute nada al abrirlo.
- **Accesible:** se recorre con teclado y las ramas también se pueden leer como lista.
- Se dibuja con el mismo `treeSvg.ts` de las capturas, así se ve igual que el PDF.

## 12. Modo portable e instalador

- Rust, al iniciar: si existe `portable.flag` junto al `.exe` → datos en `<carpeta del exe>/datos/`; si no → carpeta de datos de la app en el perfil de Windows. El comando `rutas_app` devuelve las rutas de la BD, `respaldos/` y `escenarios/`.
- Release genera:
  - `BoldoAtlas_windows_x64_portable.zip` → `BoldoAtlas.exe` + `portable.flag` + `datos/` vacía.
  - `BoldoAtlas_windows_x64_setup.exe` (instalador NSIS).
  - (Nombres sin versión a propósito; ver sección 14.)
- Requisito: WebView2 (incluido en Windows 11 y casi todo Windows 10).
- **Respaldos automáticos (pedido del autor):** al abrir la app y, mientras sigue abierta o en la bandeja, cada 15 minutos se revisa; si el último respaldo tiene más de 24 h (configurable: nunca, al abrir, cada 24 h, cada 7 días), se crea `respaldos/boldo-AAAAMMDD-HHMM.db` con `VACUUM INTO`, sin bloquear el uso; se conservan los últimos N (por defecto 10). En Configuración › Respaldos: lista con fecha, tamaño y revisión de datos; "Respaldar ahora", "Abrir carpeta" y "Restaurar" (confirma, respalda la base actual antes y reinicia la app sobre el respaldo elegido). Funciona igual en portable (carpeta `datos/respaldos/`) e instalado.
- **Aviso conocido:** un `.exe` sin firmar descargado de internet también dispara SmartScreen en modo portable (no solo el instalador). Mitigación v1: instrucciones en el README ("Más información → Ejecutar de todas formas"). Mejora futura: firma gratuita para proyectos open source vía SignPath Foundation.

### Actualizar
- **Manual (siempre posible):** descargar el zip nuevo y reemplazar `BoldoAtlas.exe`; `datos/` no se toca. Al abrir, si el esquema cambió, la app respalda y migra (§6). Se explica en la Ayuda y en el README.
- **Consulta periódica (pedido del autor):** en Configuración › Actualizaciones: "Buscar automáticamente" con frecuencia nunca | solo al abrir | cada hora | cada 6 horas | cada día | cada semana. Toda frecuencia salvo "nunca" busca además al abrir, porque lo encontrado no se guarda. Por defecto: **cada día**, igual en la versión instalada y en la portable (la portable es la principal para el autor y tiene todas las funciones de actualización). La consulta solo lee archivos públicos con pedidos GET: la lista de versiones de GitHub y, si hay una nueva, su `latest.json` y su `novedades.json` (ver "Cómo funciona la consulta"); no envía datos de la organización ni identificadores. Si hay versión nueva: aviso discreto en Inicio, en la barra superior y en el icono de la bandeja; nunca se descarga ni instala sin confirmación.
- **Dónde se busca a mano:** botón "Buscar actualizaciones" en Acerca de, en el menú de la app, en la paleta Ctrl+K y en el menú del icono de la bandeja.
- **Ventana de actualización con el estilo de la app:** muestra la versión actual y la nueva y **las novedades de todas las versiones intermedias** (si se saltó una o más, se listan todas, agrupadas por versión: novedades, correcciones). Distingue el tipo de instalación: instalado ("Se descargará el instalador, se instalará y BoldoAtlas se reiniciará") o portable ("Se reemplazará BoldoAtlas en esta carpeta; tus datos en `datos/` no se tocan"); en Linux `.deb`/`.rpm` (gestionado por el sistema) ofrece descargar el paquete nuevo en vez de instalarlo. Progreso de descarga con opción de cancelar.
- **Después de actualizar:** al primer arranque de la versión nueva, diálogo "Novedades de la versión X" con lo nuevo desde la última versión que se usó en este PC (también varias versiones); se puede volver a ver desde Acerca de. Las novedades viajan dentro de la app (`novedades.json`, generado en el build por `scripts/novedades.mjs` desde las notas de los releases de GitHub, que son las «Notas de la versión» de los PR; ver §14), así se ven sin conexión.
- **Limpieza:** se borran los archivos temporales de la actualización (instalador o paquete descargado, `BoldoAtlas.old.exe`, caché del actualizador) al terminar o en el siguiente arranque, para no acumular espacio.
- **Icono en la bandeja del sistema** (instalado y portable, mientras la app está abierta): menú contextual con Abrir BoldoAtlas, Inicio, Buscar persona, Configuración, Ayuda, "Actualizar a vX" (solo si hay versión nueva) o "Buscar actualizaciones", Respaldar ahora, Abrir carpeta de datos y Salir. Qué hace cerrar la ventana está en §7 "Al cerrar la ventana".
- **La portable no deja rastro fuera de su carpeta:** todo lo que escribe (datos, respaldos, temporales de la actualización y la carpeta de datos del WebView: caché, almacenamiento local, preferencias) va dentro de `datos/`; nada en `%APPDATA%`, `%LOCALAPPDATA%` ni en el temporal del sistema. Así se puede llevar en un pendrive y actualizarse en el mismo lugar.
- **Cómo funciona la consulta (implementado en Task 16b, `src-tauri/src/actualizar.rs`):** pide la lista pública de releases a la API de GitHub (`GET /repos/MscottB/BoldoAtlas/releases`) y elige por SemVer la versión más nueva que trae `latest.json` (no `releases/latest`: da 404 mientras todo sea pre-release, y la API no ordena por SemVer). Canal automático: una versión final solo recibe finales; una pre-release o un build de desarrollo, también pre-releases. Si es más nueva, lee además su `latest.json` y su `novedades.json` (todo GET públicos, sin datos ni identificadores) y muestra la versión y sus notas y ofrece "Descargar e instalar".
  - Usa `tauri-plugin-updater` con un manifiesto `latest.json` que publica el workflow de release, **firmado** con una clave del autor (`tauri signer`; la clave privada vive solo como secreto `TAURI_SIGNING_PRIVATE_KEY` en GitHub y la pública va en `tauri.conf.json`). Se rechaza cualquier descarga con firma inválida.
  - Instalado: Windows corre el instalador NSIS nuevo; macOS reemplaza el `.app` (actualizador de Tauri); Linux AppImage se reemplaza a sí mismo; `.deb`/`.rpm` solo ofrecen descargar el paquete. Portable: Windows descarga el zip firmado (objetivo propio `windows-x86_64-portable` en `latest.json`), renombra el `.exe` en uso a `BoldoAtlas.old.exe`, escribe el nuevo en su lugar y se reinicia; el `.old` se borra en el siguiente arranque; Linux portable = el AppImage junto a `portable.flag` (mismo reemplazo); macOS portable = `BoldoAtlas.app` junto a `portable.flag` (reemplaza el `.app`). Si algo falla, se restaura lo anterior y se informa el error. Los temporales de la portable van en `datos/actualizacion/`.
  - Sin conexión o sin versión nueva: un mensaje claro ("Ya tienes la última versión" / "No se pudo consultar: revisa tu conexión").

## 13. Marca, tema y "Acerca de"

- Archivos fuente: `assets/brand/logo-horizontal.webp`, `assets/brand/icono.webp`.
- Iconos de la app: generados con `tauri icon` desde un PNG cuadrado 1024×1024. El icono entregado tiene fondo blanco; se pedirá una versión con fondo transparente o se recortará el fondo.
- Logo por defecto en exportaciones: el de BoldoAtlas; el usuario puede reemplazarlo por el de su organización en Configuración. "Acerca de" siempre muestra el de BoldoAtlas.
- Paleta por defecto tomada del logo: azul marino `#1E2A38` y cobre `#C8743F` (acento). Valores aproximados; se ajustan al definir los tokens.
- Tema: claro / oscuro / sistema + selector de color de acento (variables CSS de Tailwind v4).
- **Acerca de:** logo, versión de la app mostrada como **"Versión 1.2.0 · 28102026"** (y debajo, en texto pequeño y copiable, la versión completa con commit; botón "Copiar información" para reportar errores), versión de esquema, `db_id`, revisión de datos, fecha de creación de la base, licencia AGPL-3.0 con enlace al texto, enlace al repositorio (`https://github.com/MscottB/BoldoAtlas`) y **"Creado por"** con nombre y contacto del autor (constante única en `src/app/about.ts`; el texto exacto lo entrega el autor antes de implementar esta pantalla).

## 14. Distribución y repositorio

- GitHub, licencia **AGPL-3.0** (`LICENSE` en la raíz; aviso de licencia en "Acerca de").
- Repositorio: `https://github.com/MscottB/BoldoAtlas`.
- `README.md` (qué es, capturas, enlace al sitio y a la descarga, cómo compilar) y `CONTRIBUTING.md` con CLA para contribuciones externas (permite al autor licenciar comercialmente en el futuro).
- **Flujo de versiones:** se trabaja en `main` con Conventional Commits; publicar = crear la etiqueta `vX.Y.Z` y empujarla (`git tag v1.2.0 && git push origin v1.2.0`).

### CI/CD (GitHub Actions: Windows, Linux y macOS)
Optimizaciones comunes a todos los workflows: `concurrency` con `cancel-in-progress` (un push nuevo cancela el anterior en la misma rama), caché de npm (`actions/setup-node` con `cache: npm`) y de Rust (`Swatinem/rust-cache`), filtros por ruta, y `permissions` mínimos por workflow.

| Workflow | Disparo | Runner | Pasos |
|---|---|---|---|
| `ci.yml` | push a `main` y PR, salvo cambios solo en `site/`, `docs/` o `*.md` | **ubuntu-latest** para el frontend (más rápido y barato); **windows-latest** solo si cambió `src-tauri/` | Frontend: `npm ci` → lint → `vue-tsc` → Vitest. Rust: `cargo fmt --check` → `cargo clippy -D warnings`. No compila instalador. |
| `release.yml` | push de etiqueta `v*` | windows-latest | Mismos checks → `scripts/version.mjs` → `tauri build --bundles nsis` → arma zip portable (`.exe` + `portable.flag` + `datos/`) → calcula `SHA256SUMS.txt` → crea el Release (`softprops/action-gh-release`, para controlar los nombres de archivo) con notas autogeneradas desde los commits y los 3 archivos adjuntos. Las etiquetas con `-` (ej. `v1.3.0-beta.1`) se publican como *pre-release*. |
| `pages.yml` | push a `main` con cambios en `site/`, o Release publicado | ubuntu-latest | `npm ci` en `site/` → `vitepress build` → despliegue a GitHub Pages. |

**Windows, Linux y macOS, cada uno con instalador y portable (pedido del autor).** `release.yml` pasa a una matriz (`windows-latest`, `ubuntu-22.04`, `macos-latest` con binario universal x64+arm64); los checks corren una sola vez en un job previo y los builds de cada sistema dependen de él. Optimizaciones adicionales para no descargar lo mismo en cada ejecución:
- caché de Rust por sistema (`Swatinem/rust-cache` con `shared-key` por SO, compartida entre `build-prueba` y `release`), caché de npm, caché de las herramientas que Tauri descarga al empaquetar (NSIS/WiX en `%LOCALAPPDATA%\tauri`, `linuxdeploy`/AppImage en `~/.cache/tauri`) y caché de los paquetes apt de WebKitGTK en Linux;
- `build-prueba` en los PR compila solo Windows (el más usado por el autor); Linux y macOS se compilan a pedido (`workflow_dispatch` o etiqueta `build-todas` en el PR) y siempre en el release;
- `ci-rust` corre `clippy` y los tests en los tres sistemas solo si cambió `src-tauri/`;
- se cancela lo anterior de la misma rama y los artefactos de prueba duran 14 días.

Nombres de los archivos del Release **sin número de versión**, para que el enlace "última versión" del sitio nunca cambie:
- `BoldoAtlas_windows_x64_portable.zip`, `BoldoAtlas_windows_x64_setup.exe`
- `BoldoAtlas_linux_x64_portable.zip` (AppImage + `portable.flag` + `datos/`), `BoldoAtlas_linux_x64.AppImage`, `BoldoAtlas_linux_x64.deb`, `BoldoAtlas_linux_x64.rpm`
- `BoldoAtlas_macos_universal_portable.zip` (`BoldoAtlas.app` + `portable.flag` + `datos/`), `BoldoAtlas_macos_universal.dmg`, `BoldoAtlas_macos_universal.app.tar.gz` (el `.app` que descarga el actualizador de macOS)
- `latest.json` (manifiesto del actualizador: un objetivo por plataforma, cada paquete firmado en CI con `tauri signer sign --app-version`; ver `scripts/manifiesto.mjs`), `novedades.json` (notas por versión, desde las notas de los releases: `scripts/novedades.mjs`) y `SHA256SUMS.txt`, que cubre todos los anteriores, `latest.json` y `novedades.json` incluidos

Enlace estable: `https://github.com/MscottB/BoldoAtlas/releases/latest/download/<archivo>`.

### Sitio de presentación (`site/`, VitePress → GitHub Pages)
URL: `https://mscottb.github.io/BoldoAtlas/`. En español, con modo claro/oscuro, búsqueda local integrada y colores/logo de la marca.

- **Inicio (presentación):** logo, frase de valor, botones "Descargar portable" e "Instalador", capturas de pantalla, funciones principales en tarjetas (árbol, fichas, procesos SIPOC/RACI, indicadores, escenarios, exportar PDF/Excel/PNG, fusión entre equipos, 100 % local y sin conexiones), "por qué local", licencia AGPL-3.0.
- **Descargas:** los dos archivos con su enlace estable, número de la última versión (consultado a la API pública de GitHub desde el navegador; si falla, se muestra solo "última versión"), requisitos (Windows 10/11 con WebView2), cómo pasar el aviso de SmartScreen, cómo verificar `SHA256SUMS.txt`, enlace a versiones anteriores.
- **Manual de usuario:** una página por tema — primeros pasos, árbol y unidades, fichas y vacantes, procesos (SIPOC) y actividades (RACI), indicadores, directorio y etiquetas, carga masiva (con la plantilla descargable), escenarios, exportar/importar y fusión, PDF/Excel/capturas, configuración y temas, modo portable y respaldos, preguntas frecuentes. Con capturas reales.
- **Acerca de:** autor, licencia, enlace al repositorio y cómo contribuir.

Las capturas del sitio se toman a mano de la base de ejemplo en v1 (automatizarlas queda para después).

## 15. Pruebas

- **Vitest (obligatorio):**
  - `comparar.rs` y `revision.rs`: cada caso de la tabla de la sección 9, incluidos ciclos, duplicados, reglas únicas y referencias rotas.
  - Indicadores: dotación directa/total, vacantes, personas a cargo, cobertura RACI sobre un árbol de ejemplo.
  - `validar.ts` de carga masiva: rutas nuevas/existentes, correos repetidos, valores inválidos, CSV con `;`.
  - Derivación de ruta Gerencia › Área › Subárea y validación de ciclos al mover.
  - Restricciones de BD (migración aplicada en SQLite en memoria): vacante sin cargo, dos Aprobadores, correo duplicado → rechazados.
  - `treeSvg.ts` (snapshot de un árbol pequeño) y armado de filas de Excel según columnas elegidas.
  - `formatearVersion`: los cuatro casos de la tabla de la sección 6, fecha `DDMMAAAA` con día/mes de un dígito (`05032026`) y cambio de día entre UTC y `America/Santiago`.
- **CI/CD:** primera etiqueta de prueba `v0.1.0-beta.1` debe producir un *pre-release* con los 3 archivos, y el zip portable debe abrir en una PC limpia guardando datos en `datos/`.
- **Prueba temprana de rendimiento:** primer paso técnico — lienzo con 2.000 unidades falsas; si no es fluido, evaluar Cytoscape.js antes de seguir.
- **Manual:** exportar → importar en otra carpeta portable en ambos modos; carga masiva con la plantilla; escenario → comparar; PDF y Excel de una organización de ejemplo; tema claro/oscuro y navegación solo con teclado.

## 16. Riesgos

- Vue Flow con miles de nodos: mitigado por la prueba temprana.
- pdfmake con cientos de unidades puede tardar: mostrar progreso; si no alcanza, mover generación a Rust.
- Fusión sin base común: posibles decisiones manuales repetidas en fusiones frecuentes.
- Código de un `.boldo` perdido: el archivo no se puede abrir (no hay recuperación, por diseño). Mitigación: el aviso al exportar y la posibilidad de exportar de nuevo cuando se quiera.
- Carpeta de datos sin permiso de escritura (p. ej. el `.exe` abierto desde dentro del zip): se detecta al iniciar y se muestra cómo resolverlo.
- Alcance v1 creció (SIPOC/RACI, carga masiva, escenarios): el plan de implementación debe entregarse por fases usables (núcleo árbol+fichas → procesos → exportaciones → sync/escenarios) para tener algo funcionando pronto.
