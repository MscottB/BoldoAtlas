---
title: Descargas
description: Descarga BoldoAtlas para Windows, Linux o macOS, en versión portable o con instalador.
---

# Descargas

Cada sistema tiene una versión **portable**, la recomendada, y un **instalador**. Los enlaces apuntan siempre a la última versión publicada. Por ahora todas las versiones son prelanzamientos (alfa).

<Descargas lang="es" />

## Requisitos

- **Windows:** Windows 10 u 11 de 64 bits con WebView2 (ya viene en Windows 11 y en casi todo Windows 10).
- **Linux:** una distribución de 2022 o más nueva (Ubuntu 22.04, Debian 12, Fedora 36…) de 64 bits. Para el AppImage hace falta FUSE 2: `sudo apt install libfuse2` (en Ubuntu 24.04, `libfuse2t64`).
- **macOS:** macOS 11 o más nuevo, en Intel o Apple Silicon (un solo binario universal).

En modo portable, **extrae el zip antes de ejecutar**: abrir el programa desde dentro del zip impide guardar los datos. En macOS, el sistema guarda las preferencias de la ventana (tema, escala, pestañas) y sus cachés web en tu carpeta `~/Library`; los datos y los respaldos sí quedan en `datos/`.

Con el instalador, los datos quedan en la carpeta de tu usuario: `%APPDATA%\io.github.mscottb.boldoatlas` en Windows, `~/.local/share/io.github.mscottb.boldoatlas` en Linux y `~/Library/Application Support/io.github.mscottb.boldoatlas` en macOS.

## Abrir un programa sin firma digital {#sin-firma}

BoldoAtlas aún no está firmado digitalmente, así que la primera vez el sistema avisa:

- **Windows (SmartScreen):** si aparece «Windows protegió su PC», haz clic en **Más información → Ejecutar de todas formas**.
- **macOS (Gatekeeper):** clic derecho sobre `BoldoAtlas.app` → **Abrir** → **Abrir**. Si dice que la app «está dañada» o no ofrece abrirla (macOS 15 o más nuevo), ejecuta en Terminal `xattr -dr com.apple.quarantine <carpeta>` sobre la carpeta extraída de la portable o sobre `/Applications/BoldoAtlas.app`, o usa **Configuración del Sistema › Privacidad y seguridad › Abrir igualmente**. En la portable, quita la cuarentena antes de abrirla: si no, macOS la ejecuta desde una copia de solo lectura y BoldoAtlas avisa que no puede guardar.
- **Linux (AppImage):** dale permiso de ejecución con `chmod +x BoldoAtlas_linux_x64.AppImage` (o en el gestor de archivos: Propiedades › Permitir ejecutar). El de la portable ya lo trae si extraes el zip con `unzip` o con el gestor de archivos.

## Verificar la descarga

`SHA256SUMS.txt` trae la suma de verificación de cada archivo. Descárgalo junto al programa y compara:

```powershell
# Windows (PowerShell)
Get-FileHash BoldoAtlas_windows_x64_portable.zip -Algorithm SHA256
```

```bash
# Linux (verifica los archivos que tengas en la carpeta)
sha256sum -c SHA256SUMS.txt --ignore-missing

# macOS
shasum -a 256 BoldoAtlas_macos_universal_portable.zip
```

En Windows y macOS, compara el resultado con la línea del mismo archivo en `SHA256SUMS.txt`.

## Cómo actualizar

La próxima versión de BoldoAtlas buscará actualizaciones por sí misma (está en camino). Mientras tanto, descarga la versión nueva desde esta página:

- **Portable:** cierra BoldoAtlas y reemplaza el programa (`BoldoAtlas.exe`, `.AppImage` o `.app`) por el nuevo. La carpeta `datos/`, con tu base y tus respaldos, se queda donde está. Si extraes el zip nuevo en otra carpeta, copia `datos/` ahí.
- **Instalador:** ejecuta el instalador nuevo. Tus datos están en la carpeta de tu usuario y no cambian.

Si una versión nueva necesita migrar la base, BoldoAtlas hace un respaldo automático antes.

## Versiones anteriores

Todas las versiones, con sus notas, están en [Releases](https://github.com/MscottB/BoldoAtlas/releases) en GitHub.
