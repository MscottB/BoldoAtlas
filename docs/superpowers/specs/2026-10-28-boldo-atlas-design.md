# BoldoAtlas — Diseño v1

Fecha: 2026-10-28 · Estado: borrador para revisión · Licencia del proyecto: AGPL-3.0

## 1. Objetivo

App de escritorio local para construir y revisar un organigrama grande de una organización:
unidades (gerencias, áreas, subáreas) conectadas jerárquicamente o lateralmente, con sus jefaturas,
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
- Cualquier integración con otras plataformas (RR.HH., SSO, Slack/Teams, enlaces web para compartir).
- Sincronización en vivo / multiusuario simultáneo / servidor.
- Usuarios, contraseñas y permisos dentro de la app.
- Funciones "premium" del modelo open core (solo se elige la licencia ahora).
- Historial de cambios (auditoría) y deshacer/rehacer general → candidatos a v2. (v1 sí tiene "Deshacer" al eliminar; ver sección 7.)
- Campos personalizados definidos por el usuario.
- Actualizador automático.
- Envío por correo desde la app (se guarda el archivo y se ofrece "Abrir carpeta").
- Idiomas distintos al español y al inglés.
- Builds de macOS/Linux (el workflow queda preparado; v1 publica Windows).

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

La versión de esquema la lleva `PRAGMA user_version`.

### `unidades`
| columna | tipo | reglas |
|---|---|---|
| `tipo` | TEXT | NOT NULL, CHECK in ('gerencia','area','subarea','otra') |
| `nombre` | TEXT | NOT NULL, CHECK largo > 0 |
| `descripcion` | TEXT | NULL |
| `parent_id` | TEXT | NULL → `unidades.id`; NULL = raíz (permite árboles sueltos) |
| `jefe_id` | TEXT | NULL → `trabajadores.id` (la jefatura de la unidad) |
| `orden` | INTEGER | NOT NULL DEFAULT 0 |

Profundidad libre. La ausencia de ciclos se valida en la capa de datos antes de guardar (SQLite no puede expresarlo con CHECK). El jefe puede pertenecer a la propia unidad o a la superior.

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
**Filtro por etiqueta o por texto:** las unidades que coinciden se resaltan y el resto se atenúa (no se ocultan, para no perder contexto).

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
| Dotación directa | trabajadores activos con `unidad_id` = la unidad |
| Dotación total | dotación directa de la unidad + toda su rama |
| Vacantes (directas / rama) | igual que dotación, con `estado = 'vacante'` |
| Personas a cargo del jefe | trabajadores activos de la unidad (menos el propio jefe) + jefes de sus subunidades directas |
| Procesos / actividades | conteos directos y de rama |
| Cobertura RACI | % de actividades con al menos un R y exactamente un A |

Vista Indicadores: tarjetas con totales de la organización, tabla por unidad ordenable, y listas "unidades sin jefatura", "procesos sin actividades", "actividades sin responsable". Clic en cualquier fila lleva a la unidad en el árbol.

### Escenarios
- **Guardar como escenario:** copia la base actual con `VACUUM INTO` a `escenarios/<nombre>.db` (archivo interno sin cifrar: no sale del equipo), con nuevo `db_id`, `escenario_nombre` y `escenario_origen_id`. Para compartir un escenario se exporta como cualquier base (`.boldo` cifrado).
- **Abrir escenario:** cambia la base activa; la barra superior muestra la insignia del escenario y "Volver a la base principal".
- **Comparar:** elige dos bases (p. ej. principal vs escenario) y muestra el resultado de `diff.ts` en solo lectura: unidades nuevas, eliminadas, movidas (cambio de `parent_id`), cambios de jefatura, personas reasignadas, y diferencia de indicadores (dotación, vacantes) por unidad. Exportable a Excel.
- Pasar un escenario a la base principal = importar con "Reemplazar todo" o "Fusionar" (sección 9), sin flujo nuevo.

## 9. Exportar e importar `.boldo`

**Formato propio y cifrado.** Cada PC es un ambiente aislado y el archivo viaja por correo o pendrive con datos personales, así que va cifrado y solo se abre con un código que se entrega aparte.
- Contenido: copia SQLite completa generada con `VACUUM INTO` (incluye `meta`, logo y esquema), cifrada con **XChaCha20-Poly1305**; la clave se deriva del código con **Argon2id** (memoria 64 MiB, 3 pasadas, 1 hilo) y una sal aleatoria por archivo.
- Cabecera en claro, solo lo necesario para descifrar: identificador `BOLDO`, versión del formato, parámetros de Argon2id, sal y nonce. Nada más va en claro (ni el nombre de la organización ni las versiones: esos datos están dentro del contenido cifrado, en `meta`).
- Todo el cifrado y descifrado ocurre en Rust (crates `argon2` y `chacha20poly1305` de RustCrypto), nunca en el frontend.

**Exportar:** diálogo "Guardar como" → `Organizacion_AAAA-MM-DD_rN.boldo`. La app genera un **código único para ese archivo**: 20 caracteres del alfabeto Crockford base32, sin caracteres confusos (sin O/0 ni I/1/L), en grupos de 4 (`K7QM-2XRP-9DWN-H4TB-V3CJ`, unos 100 bits). Se muestra **una sola vez** con "Copiar código" y la recomendación de enviar el archivo y el código **por canales distintos**. El código no se guarda en ningún lado: si se pierde, ese archivo no se puede abrir y hay que exportar de nuevo (otro archivo, otro código).

**Alcance de la exportación.** Al exportar se elige qué llevar: **toda la base**, o **uno o más árboles o ramas** (lista de unidades con casillas; marcar una unidad incluye toda su rama; una base puede tener varios árboles independientes, uno por raíz).
- Una exportación parcial lleva: las unidades elegidas con sus descendientes, las personas y vacantes de esas unidades, los valores de mantenedor que esas personas usan, las etiquetas de esas unidades, las conexiones laterales con **ambos** extremos incluidos y (Fase 3) los procesos, actividades y roles RACI de esas unidades.
- Lo que quedaría apuntando fuera de la selección se corta en la copia y se resume antes de guardar ("2 conexiones y 1 jefatura no se incluyen"): conexiones con un extremo fuera, `jefe_id` de una persona que no va (la jefatura queda vacía en la copia) y roles RACI de personas que no van.
- Se arma en Rust: `VACUUM INTO` a un temporal, se borran de ese temporal las filas fuera del alcance en una transacción, se cifra y se borra el temporal. `meta` de la copia agrega `alcance` (`completo` | `parcial`), los ids de las raíces exportadas y el `db_id` de origen.

**Importar:** se pide el código; Rust descifra a un archivo temporal dentro de `datos/`. Si el archivo es **parcial**, solo se ofrece "Fusionar" ("Reemplazar todo" queda deshabilitado con la explicación: borraría el resto de la base) y, si la unidad superior de una rama exportada no existe en la base de destino, se pregunta dónde colocarla: dentro de una unidad elegida o como árbol independiente; después sigue la revisión de fusión normal. Si el código no corresponde o el archivo fue alterado, el descifrado falla y se muestra "El código no es correcto o el archivo está dañado", sin tocar la base local. Con el contenido descifrado se abre una segunda conexión de solo lectura, se valida el esquema (sección 6) y se elige el modo; el temporal se borra al terminar o al cancelar. **Antes de aplicar cualquiera de los dos modos se guarda un respaldo** en `respaldos/` con fecha (se conservan los últimos 20).

### Modo A — Reemplazar todo
La base local se sustituye por el archivo importado (tras el respaldo).

### Modo B — Fusionar con revisión
Comparación por `id` en todas las tablas de negocio. Lógica pura en `src/features/sync/diff.ts` (la misma que usa Escenarios → Comparar).

| Caso | Detección | Por defecto | Opciones | ¿Bloquea "Aplicar"? |
|---|---|---|---|---|
| Idéntico | mismos campos | ignorar (oculto) | — | no |
| Nuevo | `id` solo en importado | agregar | desmarcar | no |
| Diferente | mismo `id`, campos distintos | campo a campo; preselecciona el `updated_at` más reciente | "mío"/"importado" por registro o campo; "aceptar todos los más recientes" | no |
| Borrado vs editado | un lado `deleted_at`, el otro `updated_at` posterior | mantener | borrar / mantener | no |
| Borrado sin conflicto | un lado borrado, el otro sin cambios posteriores | aplicar borrado | revertir | no |
| Duplicado de persona | trabajadores con distinto `id` y mismo correo normalizado | — | unir (se conserva uno y se reasignan `jefe_id` y `actividad_roles`) / editar correo de uno | **sí** |
| Otra regla única violada | p. ej. dos Aprobadores en una actividad, dos etiquetas con el mismo nombre | — | elegir cuál conservar | **sí** |
| Referencia rota | tras la fusión, una FK apunta a algo inexistente o borrado | marcar | reasignar a… / dejar vacío si la columna lo permite / descartar el registro | **sí** |
| Ciclo | la jerarquía resultante forma un círculo | marcar | elegir qué `parent_id` cambiar | **sí** |

Los casos se agrupan por tipo con contador. Todo se aplica en una única transacción; si falla, no se escribe nada.

Limitación aceptada: sin una base común de referencia, "Diferente" no distingue quién cambió qué; por eso se muestra siempre y se preselecciona el más reciente.

## 10. Carga masiva desde Excel/CSV

- **Plantilla descargable** `Plantilla_BoldoAtlas.xlsx` con hojas `Unidades` y `Trabajadores`, encabezados fijos, validación de listas (tipo, estado) y 3 filas de ejemplo. Una hoja `Instrucciones` explica cada columna.
- **Unidades:** columnas `tipo, nombre, unidad_superior, jefe_correo, descripcion, etiquetas`. La unidad superior se escribe como ruta con `›` o `/` (ej. `Gerencia de Operaciones / Logística`); las rutas inexistentes se crean en orden.
- **Trabajadores:** columnas `estado, nombre, correo, telefono, cargo, tipo_contrato, sede, jornada, unidad, notas`. Cargo, tipo de contrato, sede y jornada se escriben por nombre; los que no existan en su mantenedor aparecen en la vista previa como "valores nuevos" y se crean solo al confirmar. `unidad` se escribe como ruta. Si el correo ya existe en la base → se **actualiza** esa persona; si no → se crea.
- Se aceptan `.xlsx` y `.csv` (UTF-8, separador `,` o `;` detectado). En CSV se carga una hoja por archivo y se elige cuál es.
- **Vista previa obligatoria:** resumen (unidades a crear, personas a crear/actualizar) y tabla de errores por fila con hoja, fila, columna y mensaje (p. ej. "tipo 'gerncia' no válido", "unidad 'X' no existe y no tiene ruta completa", "correo repetido en el archivo"). Con errores no se puede aplicar; se puede descargar el archivo de errores para corregir.
- Al aplicar: respaldo automático, una sola transacción, `data_revision` +1.
- Validación en función pura `src/features/carga/validar.ts`.

## 11. Capturas, PDF y Excel

Todas las exportaciones comparten un **selector de alcance**: toda la organización / una gerencia / una rama (unidad + descendientes). Tras guardar se ofrece "Abrir carpeta".

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

### Excel (ExcelJS)
Opciones: alcance + qué hojas incluir + qué columnas de cada hoja (casillas, todas marcadas por defecto; la selección se recuerda por PC).

| Hoja | Columnas disponibles |
|---|---|
| Información | organización, escenario, fecha de generación, versión app, versión esquema, revisión, `db_id`, alcance elegido (siempre incluida) |
| Unidades | tipo, nombre, descripción, unidad superior, ruta completa, jefe, correo del jefe, etiquetas, dotación directa, dotación total, vacantes, nº procesos |
| Conexiones | origen, destino, etiqueta |
| Procesos | unidad, ruta, nombre, descripción, frecuencia, criticidad, estado, documento, proveedores, entradas, salidas, clientes, nº actividades |
| Actividades | unidad, proceso, nombre, descripción, responsables (R), aprobador (A), consultados (C), informados (I) |
| Matriz RACI | filas = actividades (agrupadas por proceso), columnas = personas involucradas, celdas = R/A/C/I |
| Trabajadores | estado, nombre, correo, teléfono, cargo, tipo de contrato, sede, jornada, gerencia, área, subárea, ruta completa, jefe, notas |
| Indicadores | una fila por unidad con todos los indicadores de la sección 8 |

Formato: encabezado con color de marca y fijo, autofiltro, ancho de columna ajustado, logo en la hoja Información. Los IDs internos no se exportan salvo que se marque la columna opcional "ID". Nombre: `Organizacion_AAAA-MM-DD_rN.xlsx`.

## 12. Modo portable e instalador

- Rust, al iniciar: si existe `portable.flag` junto al `.exe` → datos en `<carpeta del exe>/datos/`; si no → carpeta de datos de la app en el perfil de Windows. El comando `rutas_app` devuelve las rutas de la BD, `respaldos/` y `escenarios/`.
- Release genera:
  - `BoldoAtlas_windows_x64_portable.zip` → `BoldoAtlas.exe` + `portable.flag` + `datos/` vacía.
  - `BoldoAtlas_windows_x64_setup.exe` (instalador NSIS).
  - (Nombres sin versión a propósito; ver sección 14.)
- Requisito: WebView2 (incluido en Windows 11 y casi todo Windows 10).
- **Aviso conocido:** un `.exe` sin firmar descargado de internet también dispara SmartScreen en modo portable (no solo el instalador). Mitigación v1: instrucciones en el README ("Más información → Ejecutar de todas formas"). Mejora futura: firma gratuita para proyectos open source vía SignPath Foundation.

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

### CI/CD (GitHub Actions, solo Windows por ahora)
Optimizaciones comunes a todos los workflows: `concurrency` con `cancel-in-progress` (un push nuevo cancela el anterior en la misma rama), caché de npm (`actions/setup-node` con `cache: npm`) y de Rust (`Swatinem/rust-cache`), filtros por ruta, y `permissions` mínimos por workflow.

| Workflow | Disparo | Runner | Pasos |
|---|---|---|---|
| `ci.yml` | push a `main` y PR, salvo cambios solo en `site/`, `docs/` o `*.md` | **ubuntu-latest** para el frontend (más rápido y barato); **windows-latest** solo si cambió `src-tauri/` | Frontend: `npm ci` → lint → `vue-tsc` → Vitest. Rust: `cargo fmt --check` → `cargo clippy -D warnings`. No compila instalador. |
| `release.yml` | push de etiqueta `v*` | windows-latest | Mismos checks → `scripts/version.mjs` → `tauri build --bundles nsis` → arma zip portable (`.exe` + `portable.flag` + `datos/`) → calcula `SHA256SUMS.txt` → crea el Release (`softprops/action-gh-release`, para controlar los nombres de archivo) con notas autogeneradas desde los commits y los 3 archivos adjuntos. Las etiquetas con `-` (ej. `v1.3.0-beta.1`) se publican como *pre-release*. |
| `pages.yml` | push a `main` con cambios en `site/`, o Release publicado | ubuntu-latest | `npm ci` en `site/` → `vitepress build` → despliegue a GitHub Pages. |

Nombres de los archivos del Release **sin número de versión**, para que el enlace "última versión" del sitio nunca cambie:
- `BoldoAtlas_windows_x64_portable.zip`
- `BoldoAtlas_windows_x64_setup.exe`
- `SHA256SUMS.txt`

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
  - `diff.ts`: cada caso de la tabla de la sección 9, incluidos ciclos, duplicados, reglas únicas y referencias rotas.
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
