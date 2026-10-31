---
title: Downloads
description: Download BoldoAtlas for Windows, Linux or macOS, as a portable version or with an installer.
---

# Downloads

Each system has a **portable** version, the recommended one, and an **installer**. The links point to the latest published version; if a file is not in it, the link goes to that version's page.

<Descargas lang="en" />

## Requirements

- **Windows:** 64-bit Windows 10 or 11 with WebView2 (included in Windows 11 and almost every Windows 10).
- **Linux:** a 64-bit distribution from 2022 or newer (Ubuntu 22.04, Debian 12, Fedora 36…). The AppImage needs FUSE 2: `sudo apt install libfuse2` (on Ubuntu 24.04, `libfuse2t64`).
- **macOS:** macOS 11 or newer, on Intel or Apple Silicon (a single universal binary).

In portable mode, **extract the zip before running**: running the program from inside the zip cannot save data. On macOS, the system keeps the window preferences (theme, zoom, tabs) and its web caches in your `~/Library` folder; data and backups do stay in `datos/`.

With the installer, data lives in your user folder: `%APPDATA%\io.github.mscottb.boldoatlas` on Windows, `~/.local/share/io.github.mscottb.boldoatlas` on Linux and `~/Library/Application Support/io.github.mscottb.boldoatlas` on macOS.

## Opening an unsigned program {#sin-firma}

BoldoAtlas is not code-signed yet, so the first time the system warns you:

- **Windows (SmartScreen):** if "Windows protected your PC" appears, click **More info → Run anyway**.
- **macOS (Gatekeeper):** right-click `BoldoAtlas.app` → **Open** → **Open**. If it says the app "is damaged" or offers no way to open it (macOS 15 or newer), run `xattr -dr com.apple.quarantine <folder>` in Terminal on the extracted portable folder or on `/Applications/BoldoAtlas.app`, or use **System Settings › Privacy & Security › Open Anyway**. For the portable, remove the quarantine before opening it: otherwise macOS runs it from a read-only copy and BoldoAtlas warns that it cannot save.
- **Linux (AppImage):** make it executable with `chmod +x BoldoAtlas_linux_x64.AppImage` (or in the file manager: Properties › Allow executing). The portable one already is if you extract the zip with `unzip` or the file manager.

## Verify the download

`SHA256SUMS.txt` holds the checksum of every file. Download it next to the program and compare:

```powershell
# Windows (PowerShell)
Get-FileHash BoldoAtlas_windows_x64_portable.zip -Algorithm SHA256
```

```bash
# Linux (checks the files you have in the folder)
sha256sum -c SHA256SUMS.txt --ignore-missing

# macOS
shasum -a 256 BoldoAtlas_macos_universal_portable.zip
```

On Windows and macOS, compare the result with the line for the same file in `SHA256SUMS.txt`.

## How to update

The next version of BoldoAtlas will check for updates by itself (it's on the way). Until then, download the new version from this page:

- **Portable:** close BoldoAtlas and replace the program (`BoldoAtlas.exe`, `.AppImage` or `.app`) with the new one. The `datos/` folder, with your database and backups, stays where it is. If you extract the new zip into another folder, copy `datos/` there.
- **Installer:** run the new installer. Your data is in your user folder and doesn't change.

If a new version needs to migrate the database, BoldoAtlas makes an automatic backup first.

## Previous versions

Every version, with its notes, is on [Releases](https://github.com/MscottB/BoldoAtlas/releases) on GitHub.
