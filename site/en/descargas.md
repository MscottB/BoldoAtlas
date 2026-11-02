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

With the installer, data lives in your user folder: `%APPDATA%\io.github.mscottb.boldoatlas` on Windows, `~/.local/share/io.github.mscottb.boldoatlas` on Linux and `~/Library/Application Support/io.github.mscottb.boldoatlas` on macOS. On Windows, open the installer from File Explorer (double-click it in Downloads), not from inside another app: opened from a packaged app, the installation ends up incomplete.

## Opening an unsigned program {#sin-firma}

BoldoAtlas is not code-signed, so the first time the system warns you:

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

On Windows and macOS, compare the result with the line for the same file in `SHA256SUMS.txt`. Each release also lists its components (SBOM, in CycloneDX format).

## How to update

BoldoAtlas checks for new versions when it opens and every day (change how often or turn it off in **Settings › Updates**) and shows you what's new. It never installs anything without your confirmation, and it rejects a package if its signature doesn't match. If you prefer to do it by hand, download the new version from this page:

- **Portable:** quit BoldoAtlas with **Quit** (in the tray it is still open) and replace the program (`BoldoAtlas.exe`, `.AppImage` or `.app`) with the new one. The `datos/` folder, with your database and backups, stays where it is. If you extract the new zip into another folder, copy `datos/` there.
- **Installer:** run the new installer. Your data is in your user folder and doesn't change.

If a new version needs to migrate the database, BoldoAtlas makes an automatic backup first.

## Previous versions

Every version, with its notes, is on [Releases](https://github.com/MscottB/BoldoAtlas/releases) on GitHub.
