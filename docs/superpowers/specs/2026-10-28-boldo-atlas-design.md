# BoldoAtlas — Diseño v1

Fecha: 2026-10-28 · Estado: borrador para revisión · Licencia del proyecto: AGPL-3.0

## 1. Objetivo

App de escritorio local para construir y revisar un organigrama grande de una organización:
unidades (gerencias, áreas, subáreas) conectadas jerárquicamente o lateralmente, con sus
procesos, actividades y las fichas de cada trabajador. Debe pesar poco, verse moderna, funcionar
sin servidor y poder intercambiar datos entre PCs mediante archivos.

**Éxito en v1:**
- Una persona arma el árbol completo y registra procesos, actividades y trabajadores.
- Exporta un archivo `.boldo`; otra persona lo importa (reemplazando o fusionando con revisión).
- Genera un PDF presentable, capturas PNG/SVG y un Excel con la información que elija.
- Se distribuye como versión portable (zip) e instalador desde GitHub Releases.

## 2. Alcance

**Incluido en v1:** todo lo descrito en las secciones 3–13.

**Fuera de v1 (explícito):**
- Sincronización en vivo / multiusuario simultáneo / servidor.
- Usuarios, contraseñas y permisos dentro de la app.
- Funciones "premium" del modelo open core (solo se elige la licencia ahora).
- Actualizador automático.
- Envío por correo desde la app (se guarda el archivo y se ofrece "Abrir carpeta").
- Importar desde Excel.
- Builds de macOS/Linux (el workflow queda preparado; v1 publica Windows).

## 3. Stack

| Capa | Elección |
|---|---|
| Shell de escritorio | Tauri 2 (backend Rust, mínimo código propio) |
| Frontend | Vue 3 + TypeScript (`strict`) + Vite |
| Estado | Pinia |
| UI | Tailwind CSS v4 + shadcn-vue (Reka UI) |
| Diagrama | Vue Flow + elkjs (layout automático) |
| BD | SQLite vía `tauri-plugin-sql` (migraciones del plugin) |
| Archivos/diálogos | `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener` |
| PDF | pdfmake (fuente Inter embebida) |
| Excel | ExcelJS (MIT; estilos, filtros, imágenes) |
| Tests | Vitest |
| Calidad | ESLint + Prettier, `vue-tsc` en CI |

Go se descartó: Tauri usa Rust; con Go habría que cambiar a Wails. El código Rust se limita a
detectar el modo portable y resolver rutas (sección 10).

## 4. Buenas prácticas de código

- **Organización por funcionalidad:** `src/features/{arbol,unidades,procesos,trabajadores,sync,export,config}`; cada una con sus componentes, store y tipos.
- **Capa de datos única:** solo `src/db/` habla con SQLite (repositorios por tabla). Componentes y stores nunca escriben SQL.
- **Lógica pura separada de la UI:** diff/fusión, derivación de rutas, armado de SVG/PDF/Excel son funciones puras testeables, sin acceso a BD ni DOM cuando es posible.
- **Consultas parametrizadas siempre** (nunca concatenar texto en SQL).
- **Escrituras en transacción** cuando tocan más de una fila; errores mostrados al usuario con mensaje claro, nunca tragados.
- **Tipos compartidos** en `src/db/types.ts`, derivados del esquema.
- Commits con Conventional Commits; versiones con semver.

## 5. Modelo de datos

### Principios
- Normalizado (3FN): cada dato vive en un solo lugar. Gerencia y área de un trabajador **no** se guardan; se derivan de la jerarquía.
- `PRAGMA foreign_keys = ON` y `journal_mode = WAL` al abrir.
- Claves foráneas declaradas `DEFERRABLE INITIALLY DEFERRED` (la fusión inserta en cualquier orden dentro de una transacción).
- `NOT NULL` y `CHECK` donde corresponde; índice en cada clave foránea.
- Nombres de tablas y columnas en español, `snake_case`, tablas en plural.
- Todas las tablas de negocio tienen:
  - `id TEXT PRIMARY KEY` — UUID v7 generado en el frontend (nunca autoincremental).
  - `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` — ISO-8601 UTC.
  - `deleted_at TEXT NULL` — borrado lógico; nunca `DELETE` en tablas de negocio. Las vistas y consultas normales filtran `deleted_at IS NULL`.

### `meta` (clave/valor)
| clave | contenido |
|---|---|
| `db_id` | UUID de esta base (se crea una vez) |
| `org_nombre` | nombre de la organización |
| `db_creada` | fecha de creación de la base |
| `data_revision` | entero; +1 en cada transacción de escritura |
| `app_version_ultima` | versión de la app que escribió por última vez |
| `logo_png` | logo de la organización en base64 (viaja con la base) |

La versión de esquema la lleva la tabla de migraciones de `tauri-plugin-sql`.

### `unidades`
| columna | tipo | reglas |
|---|---|---|
| `tipo` | TEXT | NOT NULL, CHECK in ('gerencia','area','subarea','otra') |
| `nombre` | TEXT | NOT NULL, CHECK largo > 0 |
| `descripcion` | TEXT | NULL |
| `parent_id` | TEXT | NULL → `unidades.id`; NULL = raíz (permite árboles sueltos) |
| `orden` | INTEGER | NOT NULL DEFAULT 0 |

Profundidad libre. La ausencia de ciclos se valida en la capa de datos antes de guardar (SQLite no puede expresarlo con CHECK).

### `conexiones` (relaciones laterales)
`origen_id` NOT NULL → `unidades.id`, `destino_id` NOT NULL → `unidades.id`, `etiqueta` TEXT NULL.
CHECK `origen_id <> destino_id`.

### `procesos`
`unidad_id` NOT NULL → `unidades.id`, `nombre` NOT NULL, `descripcion` NULL, `orden` INTEGER NOT NULL DEFAULT 0.

### `actividades`
`proceso_id` NOT NULL → `procesos.id`, `nombre` NOT NULL, `descripcion` NULL, `responsable_id` NULL → `trabajadores.id`, `orden` INTEGER NOT NULL DEFAULT 0.

### `trabajadores`
`nombre` NOT NULL, `correo` NULL, `telefono` NULL, `cargo` NULL, `unidad_id` NOT NULL → `unidades.id`, `foto_png` NULL (base64), `notas` NULL.
Índice único parcial: `lower(trim(correo))` donde `correo IS NOT NULL AND deleted_at IS NULL`.

### Preferencias por PC (no van en la BD, no viajan)
Tema (claro/oscuro/sistema), color de acento y última carpeta usada, en `localStorage` del webview. Si la lectura falla se usan valores por defecto.

## 6. Versiones

- **App:** semver, única fuente `package.json`; `tauri.conf.json` la toma de ahí.
- **Esquema BD:** número de migración. Al abrir una base con esquema menor → respaldo automático y migración. Al importar un archivo con esquema **mayor** → se rechaza con "Actualiza BoldoAtlas para abrir este archivo".
- **Datos:** `data_revision` + `db_id` + `db_creada` identifican de qué base y momento viene un archivo, PDF o Excel.

## 7. Interfaz

- **Lienzo** (principal): Vue Flow con el árbol completo, zoom, mover, minimapa, búsqueda (unidad o trabajador; centra el nodo), colapsar/expandir ramas. Nodo = tarjeta con tipo, nombre y conteo de personas. Aristas jerárquicas sólidas; conexiones laterales punteadas con etiqueta.
- **Panel lateral de unidad:** datos de la unidad; pestañas Procesos (con actividades) y Personas. Crear/editar/borrar desde ahí.
- **Ficha de trabajador:** formulario modal; muestra la ruta Gerencia › Área › Subárea derivada.
- **Configuración:** nombre de la organización, logo, tema, color de acento.
- **Importar/Exportar:** secciones 8 y 9.
- **Acerca de:** logo de BoldoAtlas, versión de la app, versión de esquema, `db_id`, revisión de datos, fecha de creación de la base, licencia AGPL-3.0 con enlace al texto, enlace al repositorio en GitHub y **"Creado por"** con nombre y contacto del autor (constante única en `src/app/about.ts`; el texto exacto lo entrega el autor antes de implementar esta pantalla).

Rendimiento objetivo: fluido con 2.000 unidades y 10.000 trabajadores (los trabajadores no son nodos del diagrama; se ven en el panel). Vue Flow con `onlyRenderVisibleElements`.

## 8. Exportar e importar `.boldo`

**Formato:** copia SQLite completa generada con `VACUUM INTO` (incluye `meta`, logo y esquema).

**Exportar:** diálogo "Guardar como" → `Organizacion_AAAA-MM-DD_rN.boldo`.

**Importar:** se abre el archivo como segunda conexión de solo lectura, se valida el esquema (sección 6) y se elige el modo. **Antes de aplicar cualquiera de los dos modos se guarda un respaldo** en `respaldos/` con fecha (se conservan los últimos 20).

### Modo A — Reemplazar todo
La base local se sustituye por el archivo importado (tras el respaldo).

### Modo B — Fusionar con revisión
Comparación por `id` en todas las tablas de negocio. Lógica pura en `src/features/sync/diff.ts`.

| Caso | Detección | Por defecto | Opciones | ¿Bloquea "Aplicar"? |
|---|---|---|---|---|
| Idéntico | mismos campos | ignorar (oculto) | — | no |
| Nuevo | `id` solo en importado | agregar | desmarcar | no |
| Diferente | mismo `id`, campos distintos | campo a campo; preselecciona el `updated_at` más reciente | "mío"/"importado" por registro o campo; "aceptar todos los más recientes" | no |
| Borrado vs editado | un lado `deleted_at`, el otro `updated_at` posterior | mantener | borrar / mantener | no |
| Borrado sin conflicto | un lado borrado, el otro sin cambios posteriores | aplicar borrado | revertir | no |
| Duplicado | trabajadores con distinto `id` y mismo correo normalizado | — | unir (se conserva uno y se reasignan `responsable_id`) / editar correo de uno | **sí** (lo exige el índice único) |
| Referencia rota | tras la fusión, una FK apunta a algo inexistente o borrado | marcar | reasignar a… / dejar como raíz (solo unidades) / descartar | **sí** |
| Ciclo | la jerarquía resultante forma un círculo | marcar | elegir qué `parent_id` cambiar | **sí** |

Los casos se agrupan por tipo con contador. Todo se aplica en una única transacción; si falla, no se escribe nada.

Limitación aceptada: sin una base común de referencia, "Diferente" no distingue quién cambió qué; por eso se muestra siempre y se preselecciona el más reciente.

## 9. Capturas, PDF y Excel

Todas las exportaciones comparten un **selector de alcance**: toda la organización / una gerencia / una rama (unidad + descendientes). Tras guardar se ofrece "Abrir carpeta".

### Capturas (SVG/PNG)
**Renderizador propio de SVG** (`src/features/export/treeSvg.ts`): a partir de las posiciones de elkjs dibuja rectángulos, textos y aristas con la paleta de exportación (siempre fondo claro), más logo, título y fecha. Se usa para SVG, PNG y PDF, así todo se ve igual y el PDF queda vectorial. (No se usa `html-to-image`: genera `foreignObject`, que pdfmake no renderiza.)
- **SVG:** directo.
- **PNG:** el mismo SVG rasterizado vía `canvas` a 2x/3x/4x.

### PDF (pdfmake)
Opciones: alcance + secciones a incluir (diagrama, procesos, actividades, personas).
1. Portada: logo, nombre de la organización, título, fecha de generación, versión app, versión esquema, revisión.
2. Índice.
3. Diagrama del alcance (página apaisada si conviene).
4. Una sección por unidad: nombre destacado, ruta Gerencia › Área › Subárea, diagrama de su rama, tablas de procesos, actividades (con responsable) y personas.
5. Pie en cada página: logo pequeño, página N de M, versiones.

### Excel (ExcelJS)
Opciones: alcance + qué hojas incluir + qué columnas de cada hoja (casillas, todas marcadas por defecto; la selección se recuerda por PC).

| Hoja | Columnas disponibles |
|---|---|
| Información | organización, fecha de generación, versión app, versión esquema, revisión, `db_id`, alcance elegido (siempre incluida) |
| Unidades | tipo, nombre, descripción, unidad superior, ruta completa, nº de personas, nº de procesos |
| Conexiones | origen, destino, etiqueta |
| Procesos | unidad, ruta, nombre, descripción, nº de actividades |
| Actividades | unidad, proceso, nombre, descripción, responsable, correo del responsable |
| Trabajadores | nombre, correo, teléfono, cargo, gerencia, área, subárea, ruta completa, notas |

Formato: encabezado con color de marca y fijo, autofiltro, ancho de columna ajustado, logo en la hoja Información. Los IDs internos no se exportan salvo que se marque la columna opcional "ID". Nombre: `Organizacion_AAAA-MM-DD_rN.xlsx`.

## 10. Modo portable e instalador

- Rust, al iniciar: si existe `portable.flag` junto al `.exe` → datos en `<carpeta del exe>/datos/`; si no → carpeta de datos de la app en el perfil de Windows. El comando `rutas_app` devuelve la ruta de la BD y de `respaldos/`.
- Release genera:
  - `BoldoAtlas_x.y.z_portable.zip` → `BoldoAtlas.exe` + `portable.flag` + `datos/` vacía.
  - Instalador NSIS.
- Requisito: WebView2 (incluido en Windows 11 y casi todo Windows 10).
- **Aviso conocido:** un `.exe` sin firmar descargado de internet también dispara SmartScreen en modo portable (no solo el instalador). Mitigación v1: instrucciones en el README ("Más información → Ejecutar de todas formas"). Mejora futura: firma gratuita para proyectos open source vía SignPath Foundation.

## 11. Marca y tema

- Archivos fuente: `assets/brand/logo-horizontal.webp`, `assets/brand/icono.webp`.
- Iconos de la app: generados con `tauri icon` desde un PNG cuadrado 1024×1024. El icono entregado tiene fondo blanco; se pedirá una versión con fondo transparente o se recortará el fondo.
- Logo por defecto en exportaciones: el de BoldoAtlas; el usuario puede reemplazarlo por el de su organización en Configuración. El "Acerca de" siempre muestra el de BoldoAtlas.
- Paleta por defecto tomada del logo: azul marino `#1E2A38` y cobre `#C8743F` (acento). Valores aproximados; se ajustan al definir los tokens.
- Tema: claro / oscuro / sistema + selector de color de acento (variables CSS de Tailwind v4).

## 12. Distribución y repositorio

- GitHub, licencia **AGPL-3.0** (`LICENSE` en la raíz; aviso de licencia en "Acerca de").
- `README.md` (qué es, descarga, aviso SmartScreen, cómo compilar) y `CONTRIBUTING.md` con CLA para contribuciones externas (permite al autor licenciar comercialmente en el futuro).
- GitHub Actions:
  - En cada push/PR: lint, `vue-tsc`, Vitest.
  - En tag `vX.Y.Z`: `tauri-action` compila Windows, arma el zip portable y crea un borrador de Release con ambos archivos.

## 13. Pruebas

- **Vitest (obligatorio):** `diff.ts` (cada caso de la tabla de la sección 8, incluidos ciclos, duplicados y referencias rotas), derivación de ruta Gerencia › Área › Subárea, validación de ciclos al guardar, `treeSvg.ts` (snapshot de un árbol pequeño), armado de filas del Excel según columnas elegidas.
- **Prueba temprana de rendimiento:** primer paso de implementación — lienzo con 2.000 unidades falsas; si no es fluido, evaluar Cytoscape.js antes de seguir.
- **Manual:** exportar → importar en otra carpeta portable en ambos modos; generar PDF y Excel de una organización de ejemplo; tema claro/oscuro.

## 14. Riesgos

- Vue Flow con miles de nodos: mitigado por la prueba temprana.
- pdfmake con cientos de unidades puede tardar: mostrar progreso; si no alcanza, mover generación a Rust.
- Fusión sin base común: posibles decisiones manuales repetidas en fusiones frecuentes.
- `tauri-plugin-sql` con rutas absolutas fuera de la carpeta de la app (modo portable): verificar en el primer paso; alternativa, `rusqlite` con comandos propios.
