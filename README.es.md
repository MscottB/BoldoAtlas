<p align="center">
  <img src="assets/brand/icono.png" alt="BoldoAtlas" width="112">
</p>

<h1 align="center">BoldoAtlas</h1>

<p align="center">
  <strong>Organigramas y fichas de personas: una app de escritorio local y portable para Windows, Linux y macOS.</strong><br>
  Sin servidor, sin cuentas y sin internet. Tus datos se quedan en tu computador.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://mscottb.github.io/BoldoAtlas/">Sitio web</a> ·
  <a href="https://github.com/MscottB/BoldoAtlas/releases/latest">Descargar</a>
</p>

<p align="center">
  <img alt="Plataforma: Windows, Linux y macOS" src="https://img.shields.io/badge/plataforma-Windows%20%7C%20Linux%20%7C%20macOS-1e2a38">
  <img alt="Licencia: AGPL-3.0" src="https://img.shields.io/badge/licencia-AGPL--3.0-c8743f">
  <img alt="Hecho con Tauri y Vue" src="https://img.shields.io/badge/hecho%20con-Tauri%202%20%2B%20Vue%203-1e2a38">
  <img alt="Estado: alfa" src="https://img.shields.io/badge/estado-alfa-c8743f">
</p>

---

## Qué es

BoldoAtlas permite armar el organigrama de una organización —gerencias, áreas y subáreas, conectadas jerárquica o lateralmente— y mantener, sobre el mismo árbol, la ficha de cada persona que trabaja ahí.

Está pensado para **organizaciones grandes**: árboles muy extensos, varios árboles independientes en la misma base, y cualquier rama se puede abrir como un árbol propio sin copiarla.

## Funciones

- Base de datos SQLite 100 % local, modo portable (funciona desde un pendrive), respaldos automáticos antes de migrar
- Versión visible en *Acerca de*, generada desde git (SemVer + fecha de compilación)
- Lienzo del árbol: crear, renombrar, arrastrar para reorganizar, plegar ramas, conexiones laterales, resaltar por etiqueta
- Administrador de árboles: varios árboles independientes y subárboles guardados (abrir cualquier rama como su propio árbol)
- Fichas de personas y vacantes, con mantenedores de cargo, tipo de contrato, sede y jornada
- Directorio con filtros, búsqueda con `Ctrl+K`, tema claro/oscuro con color de acento
- Interfaz en español e inglés, con Ayuda integrada

## Descarga

Disponible en **[Releases](https://github.com/MscottB/BoldoAtlas/releases)** (es una versión alfa: de prueba). Cada sistema tiene una versión **portable**, la principal: un zip que se extrae en cualquier carpeta (o en un pendrive) y guarda todo en `datos/`, junto al programa, sin escribir fuera de esa carpeta (salvo en macOS: las preferencias de la ventana, ver más abajo). Y un **instalador**, que guarda los datos en la carpeta de tu usuario.

| Sistema | Portable | Instalador | Datos del instalado |
|---|---|---|---|
| Windows 10 u 11 (x64) | `BoldoAtlas_windows_x64_portable.zip` → `BoldoAtlas.exe` | `BoldoAtlas_windows_x64_setup.exe` | `%APPDATA%\io.github.mscottb.boldoatlas` |
| Linux (x64) | `BoldoAtlas_linux_x64_portable.zip` → `BoldoAtlas.AppImage` | `BoldoAtlas_linux_x64.deb`, `BoldoAtlas_linux_x64.rpm` o `BoldoAtlas_linux_x64.AppImage` | `~/.local/share/io.github.mscottb.boldoatlas` |
| macOS 11 o más nuevo (Intel y Apple Silicon) | `BoldoAtlas_macos_universal_portable.zip` → `BoldoAtlas.app` | `BoldoAtlas_macos_universal.dmg` | `~/Library/Application Support/io.github.mscottb.boldoatlas` |

`SHA256SUMS.txt` trae las sumas de todos los archivos para verificar la descarga: `Get-FileHash <archivo> -Algorithm SHA256` en Windows, `sha256sum -c SHA256SUMS.txt --ignore-missing` en Linux y `shasum -a 256 <archivo>` en macOS.

Requisitos: en Windows, WebView2 (ya viene en Windows 11 y en casi todo Windows 10); en Linux, una distribución de 2022 o más nueva (Ubuntu 22.04, Debian 12, Fedora 36…) y, para el AppImage, FUSE 2 (`sudo apt install libfuse2`; en Ubuntu 24.04, `libfuse2t64`).

En modo portable, extrae el zip antes de ejecutar: abrirlo desde dentro del zip impide guardar los datos. En macOS, las preferencias de la ventana (tema, escala, pestañas) y sus cachés web las guarda el sistema en tu carpeta `~/Library` (`WebKit`, `Caches`); los datos y los respaldos sí quedan en `datos/`.

### Actualizar

BoldoAtlas busca versiones nuevas cada día (en la portable y en el instalado) y avisa en la barra superior; también con **Buscar actualizaciones** en Acerca de, en el menú de la app o con Ctrl+K. La ventana de actualización muestra las notas de todas las versiones que te saltaste y nunca instala sin confirmar. Cada paquete va firmado y se rechaza si la firma no calza.

- **Portable de Windows:** reemplaza `BoldoAtlas.exe` dentro de su carpeta (el anterior queda como `BoldoAtlas.old.exe` hasta el siguiente arranque) y se reinicia; `datos/` no se toca y nada se escribe fuera de la carpeta. Un solo rastro queda fuera, y no lo escribe BoldoAtlas: Windows anota en el registro (`HKCU\Control Panel\NotifyIconSettings`) la ruta de todo programa que muestra un icono en la bandeja.
- **Portable de Linux y macOS:** reemplaza el AppImage o el `.app` en su carpeta; los temporales van en `datos/`.
- **Instalado:** Windows corre el instalador nuevo, macOS reemplaza el `.app` y el AppImage se reemplaza a sí mismo.
- **`.deb` y `.rpm`:** los actualiza el sistema; BoldoAtlas solo ofrece descargar el paquete nuevo.

A mano siempre se puede: descarga el zip nuevo y reemplaza el programa; `datos/` no se toca. Las notas de versión se escriben en español (también se muestran así con la interfaz en inglés).

### Abrir un programa sin firma digital

BoldoAtlas aún no está firmado digitalmente, así que la primera vez el sistema avisa:

- **Windows (SmartScreen):** si aparece "Windows protegió su PC", haz clic en **Más información → Ejecutar de todas formas**.
- **macOS (Gatekeeper):** clic derecho sobre `BoldoAtlas.app` → **Abrir** → **Abrir**. Si dice que la app "está dañada" o no ofrece abrirla (macOS 15 o más nuevo), ejecuta en Terminal `xattr -dr com.apple.quarantine <carpeta>` sobre la carpeta extraída de la portable o sobre `/Applications/BoldoAtlas.app`, o usa **Configuración del Sistema › Privacidad y seguridad › Abrir igualmente**. En la portable, quita la cuarentena antes de abrirla: si no, macOS la ejecuta desde una copia de solo lectura y BoldoAtlas avisa que no puede guardar.
- **Linux (AppImage):** dale permiso de ejecución con `chmod +x BoldoAtlas_linux_x64.AppImage` (o en el gestor de archivos: Propiedades › Permitir ejecutar). El de la portable ya lo trae si extraes el zip con `unzip` o con el gestor de archivos.

## Privacidad

Todo se guarda en tu computador y BoldoAtlas no usa cuentas. Su única conexión automática es la búsqueda de versiones nuevas (cada día por defecto; se cambia o se apaga en **Configuración › Actualizaciones**): lee la lista pública de releases de GitHub y el `latest.json` y `novedades.json` de la versión nueva, sin enviar datos de tu organización ni identificadores, y nunca instala sin preguntar.

## Compilar

Requiere Node 24+ y Rust estable.

```bash
npm ci
npm run app            # app en modo desarrollo (elige un puerto libre; al cerrar la ventana o con Ctrl+C se detiene todo)
npm run test           # tests del frontend
cargo test --manifest-path src-tauri/Cargo.toml   # tests de Rust
npm run release        # release del sistema actual (instalador y portable) en release/<versión>/
```

`npm run release` es el mismo comando que usa GitHub Actions en cada sistema, así que lo que genera en local es lo que se publicaría. En Linux necesita antes las bibliotecas de WebKitGTK ([requisitos de Tauri](https://v2.tauri.app/start/prerequisites/#linux)); en macOS arma el binario universal, así que pide `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

### Versiones y releases

Cada PR fusionado a `main` es una versión. Mientras dure la alpha, al fusionar se crea la etiqueta siguiente (`v0.1.0-alpha.N+1`) y se publica la prerelease con la sección **Notas de la versión** de cada PR fusionado desde el release anterior (si falta, su título). Los cambios que solo tocan documentación o CI no publican: salen en el siguiente release. Los labels `version:parche`, `version:menor` y `version:mayor` publican en cambio una versión X.Y.Z normal. Cada PR dice en un comentario con qué versión saldrá, y su portable de prueba (artefacto de `build-prueba`) lleva esa versión con el número del PR, p. ej. `0.1.0-alpha.3+pr4`. Los PR compilan la portable de Windows; las de Linux y macOS se piden con la etiqueta `build-todas` en el PR o con **Run workflow** en `build-prueba`. Cada release publica los tres sistemas. También se puede publicar a mano empujando una etiqueta: `git tag v1.2.0 && git push origin v1.2.0`.

Documento de diseño: [docs/superpowers/specs](docs/superpowers/specs/2026-10-28-boldo-atlas-design.md).

## Licencia

[AGPL-3.0](LICENSE) · Creado por **Michael Jim Scott Bravo**.
