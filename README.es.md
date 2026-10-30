<p align="center">
  <img src="assets/brand/icono.png" alt="BoldoAtlas" width="112">
</p>

<h1 align="center">BoldoAtlas</h1>

<p align="center">
  <strong>Organigramas, procesos y fichas de personas: una app de escritorio local y portable para Windows.</strong><br>
  Sin servidor, sin cuentas y sin internet. Tus datos se quedan en tu computador.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://mscottb.github.io/BoldoAtlas/">Sitio web</a> ·
  <a href="https://github.com/MscottB/BoldoAtlas/releases/latest">Descargar</a>
</p>

<p align="center">
  <img alt="Plataforma: Windows" src="https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011-1e2a38">
  <img alt="Licencia: AGPL-3.0" src="https://img.shields.io/badge/licencia-AGPL--3.0-c8743f">
  <img alt="Hecho con Tauri y Vue" src="https://img.shields.io/badge/hecho%20con-Tauri%202%20%2B%20Vue%203-1e2a38">
  <img alt="Estado: en desarrollo" src="https://img.shields.io/badge/estado-en%20desarrollo-c8743f">
</p>

---

## Qué es

BoldoAtlas permite armar el organigrama de una organización —gerencias, áreas y subáreas, conectadas jerárquica o lateralmente— y mantener, sobre el mismo árbol, sus procesos, actividades y la ficha de cada persona que trabaja ahí.

Está pensado para **organizaciones grandes**: árboles muy extensos, varios árboles independientes en la misma base, y cualquier rama se puede abrir como un árbol propio sin copiarla.

## Funciones

| | Función |
|---|---|
| ✅ | Base de datos SQLite 100 % local, modo portable (funciona desde un pendrive), respaldos automáticos antes de migrar |
| ✅ | Versión visible en *Acerca de*, generada desde git (SemVer + fecha de compilación) |
| 🚧 | Lienzo del árbol: crear, renombrar, arrastrar para reorganizar, plegar ramas, conexiones laterales, resaltar por etiqueta |
| 🚧 | Administrador de árboles: varios árboles independientes y subárboles guardados (abrir cualquier rama como su propio árbol) |
| 🚧 | Fichas de personas y vacantes, con mantenedores de cargo, tipo de contrato, sede y jornada |
| 🚧 | Directorio con filtros, búsqueda con `Ctrl+K`, tema claro/oscuro con color de acento |
| 🚧 | Interfaz en español e inglés, con Ayuda integrada |
| 🗓️ | Procesos (SIPOC), actividades (matriz RACI) e indicadores |
| 🗓️ | Exportación a PDF, Excel, PNG/SVG y carga masiva desde Excel/CSV |
| 🗓️ | Archivos `.boldo` cifrados con un código por archivo para compartir toda o parte de la organización, con fusión revisada |

✅ disponible · 🚧 en desarrollo · 🗓️ planificado

## Descarga

Disponible en **[Releases](https://github.com/MscottB/BoldoAtlas/releases/latest)** (la primera versión pública llega pronto):

| Archivo | Para qué |
|---|---|
| `BoldoAtlas_windows_x64_portable.zip` | Extraer en cualquier carpeta y ejecutar `BoldoAtlas.exe`. Los datos quedan en `datos/` junto al programa. |
| `BoldoAtlas_windows_x64_setup.exe` | Instalador. Los datos quedan en `%APPDATA%\io.github.mscottb.boldoatlas`. |
| `SHA256SUMS.txt` | Sumas para verificar la descarga: `Get-FileHash <archivo> -Algorithm SHA256`. |

Requisitos: Windows 10 u 11 con WebView2 (ya viene en Windows 11 y en casi todo Windows 10).

> **Windows SmartScreen:** el programa aún no está firmado digitalmente, así que la primera vez Windows puede mostrar "Windows protegió su PC". Haz clic en **Más información → Ejecutar de todas formas**. En modo portable, extrae el zip antes de ejecutar: abrirlo desde dentro del zip impide guardar los datos.

## Privacidad

Todo se guarda en tu computador. BoldoAtlas no se conecta a internet ni usa cuentas. Los archivos que compartas con otras personas (`.boldo`) irán cifrados y solo se abrirán con el código generado para cada archivo.

## Compilar

Requiere Node 24+ y Rust estable.

```bash
npm ci
npm run app            # app en modo desarrollo (elige un puerto libre)
npm run test           # tests del frontend
cargo test --manifest-path src-tauri/Cargo.toml   # tests de Rust
npm run release        # release completo de Windows en release/<versión>/
```

`npm run release` es el mismo comando que usa GitHub Actions, así que lo que genera en local es lo que se publicaría. Para publicar una versión, empuja una etiqueta: `git tag v1.2.0 && git push origin v1.2.0`.

## Hoja de ruta

1. ✅ Fundaciones: base de datos, modo portable, versiones, CI/CD
2. 🚧 Núcleo: lienzo del árbol, administrador de árboles, fichas, mantenedores, directorio, idiomas, Ayuda
3. 🗓️ Procesos (SIPOC), actividades (RACI) e indicadores
4. 🗓️ Exportaciones (PDF, Excel, imágenes) y carga masiva
5. 🗓️ Archivos `.boldo` cifrados, fusión y escenarios
6. 🗓️ Sitio web con manual de usuario

Documento de diseño: [docs/superpowers/specs](docs/superpowers/specs/2026-10-28-boldo-atlas-design.md).

## Licencia

[AGPL-3.0](LICENSE) · Creado por **Michael Jim Scott Bravo**.
