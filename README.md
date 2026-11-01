<p align="center">
  <img src="assets/brand/icono.png" alt="BoldoAtlas" width="112">
</p>

<h1 align="center">BoldoAtlas</h1>

<p align="center">
  <strong>Org charts and people records — a local, portable desktop app for Windows, Linux and macOS.</strong><br>
  No server, no accounts, no internet required. Your data stays on your computer.
</p>

<p align="center">
  <a href="README.es.md">Español</a> ·
  <a href="https://mscottb.github.io/BoldoAtlas/">Website</a> ·
  <a href="https://github.com/MscottB/BoldoAtlas/releases/latest">Download</a>
</p>

<p align="center">
  <img alt="Platform: Windows, Linux and macOS" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-1e2a38">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-c8743f">
  <img alt="Built with Tauri and Vue" src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20Vue%203-1e2a38">
  <img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha-c8743f">
</p>

---

## What it is

BoldoAtlas lets you build the organizational chart of a company — management levels, areas and sub-areas, connected hierarchically or laterally — and keep, on the same tree, the record of every person who works there.

It is designed for **large organizations**: very big trees, several independent trees in the same database, and any branch can be opened as a tree of its own without copying it.

## Features

- 100 % local SQLite database, portable mode (runs from a USB drive), automatic backups before migrations
- Version shown in *About*, generated from git (SemVer + build date)
- Tree canvas: create, rename, drag to reorganize, collapse branches, lateral connections, highlight by tag
- Tree manager: several independent trees and saved sub-trees (open any branch as its own tree)
- People records and vacancies, with managed lists for job title, contract type, site and shift
- Directory with filters, `Ctrl+K` search, light/dark theme with accent color
- English and Spanish interface, built-in Help

## Download

Get it from **[Releases](https://github.com/MscottB/BoldoAtlas/releases)** (it is an alpha version: a test release). Each system has a **portable** version, the main one: a zip you extract into any folder (or onto a USB drive) that keeps everything in `datos/`, next to the program, and writes nothing outside that folder (except on macOS: the window preferences, see below). And an **installer**, which keeps the data in your user folder.

| System | Portable | Installer | Installed data |
|---|---|---|---|
| Windows 10 or 11 (x64) | `BoldoAtlas_windows_x64_portable.zip` → `BoldoAtlas.exe` | `BoldoAtlas_windows_x64_setup.exe` | `%APPDATA%\io.github.mscottb.boldoatlas` |
| Linux (x64) | `BoldoAtlas_linux_x64_portable.zip` → `BoldoAtlas.AppImage` | `BoldoAtlas_linux_x64.deb`, `BoldoAtlas_linux_x64.rpm` or `BoldoAtlas_linux_x64.AppImage` | `~/.local/share/io.github.mscottb.boldoatlas` |
| macOS 11 or newer (Intel and Apple Silicon) | `BoldoAtlas_macos_universal_portable.zip` → `BoldoAtlas.app` | `BoldoAtlas_macos_universal.dmg` | `~/Library/Application Support/io.github.mscottb.boldoatlas` |

`SHA256SUMS.txt` holds the checksums of every file: `Get-FileHash <file> -Algorithm SHA256` on Windows, `sha256sum -c SHA256SUMS.txt --ignore-missing` on Linux and `shasum -a 256 <file>` on macOS.

Requirements: on Windows, WebView2 (included in Windows 11 and almost every Windows 10); on Linux, a 2022 or newer distribution (Ubuntu 22.04, Debian 12, Fedora 36…) and, for the AppImage, FUSE 2 (`sudo apt install libfuse2`; on Ubuntu 24.04, `libfuse2t64`).

In portable mode, extract the zip first: running it from inside the zip cannot save data. On macOS, the system keeps the window preferences (theme, zoom, tabs) and its web caches in your `~/Library` folder (`WebKit`, `Caches`); data and backups do stay in `datos/`.

On Windows, open the installer from File Explorer (double-click it in Downloads), not from inside another app. Apps packaged as MSIX, such as Claude Desktop, keep what they open in a private area: the app wouldn't start when setup finishes, the shortcuts would have no icon and it wouldn't appear in Installed apps. The installer reopens itself outside that app, or asks you to move it to Downloads if it can't.

If it's already installed that way (its shortcuts point to `...\Packages\<app>\LocalCache\Local\BoldoAtlas`): close BoldoAtlas, open that folder in File Explorer, double-click `uninstall.exe` **without ticking delete data**, and install again by double-clicking the installer. Your data is in `%APPDATA%` and is not touched. An old uninstall entry stays in that app's private area, with no effect. These steps were tested with a test copy, not with a real install.

To start with the system on Windows, the installed version has a checkbox on the installer's last page and in **Settings › Start with the system**; it opens minimized and is removed when you uninstall. It isn't offered in the portable, because it would write outside its folder, nor on Linux and macOS. On Windows 11, new tray icons stay inside the **^** arrow next to the clock; to keep BoldoAtlas in sight, drag it onto the taskbar.

Opening BoldoAtlas when it's already open brings its window to the front. Installed and portable copies, and portables in different folders, can stay open at the same time.

### Updating

BoldoAtlas checks for new versions when opening and every day (portable and installed; change how often in Settings) and shows a notice on Home and in the top bar; you can also use **Check for updates** in About, in the app menu or with Ctrl+K. The update window shows the notes of every version you skipped and never installs without confirmation. Every package is signed and rejected if the signature doesn't match.

- **Windows portable:** replaces `BoldoAtlas.exe` inside its folder (the previous one stays as `BoldoAtlas.old.exe` until the next start) and restarts; `datos/` is not touched and nothing is written outside the folder. One trace stays outside, written by Windows rather than BoldoAtlas: the registry (`HKCU\Control Panel\NotifyIconSettings`) records the path of every program that shows a tray icon.
- **Linux and macOS portable:** replaces the AppImage or the `.app` in its folder; temporary files go in `datos/`.
- **Installed:** Windows runs the new installer, macOS replaces the `.app` and the AppImage replaces itself.
- **`.deb` and `.rpm`:** the system updates them; BoldoAtlas only offers to download the new package.

You can always update by hand: download the new zip and replace the program; `datos/` is not touched. Release notes are written in Spanish (also shown that way with the English interface).

### Opening an unsigned program

BoldoAtlas is not code-signed yet, so the first time the system warns you:

- **Windows (SmartScreen):** if "Windows protected your PC" appears, click **More info → Run anyway**.
- **macOS (Gatekeeper):** right-click `BoldoAtlas.app` → **Open** → **Open**. If it says the app "is damaged" or offers no way to open it (macOS 15 or newer), run `xattr -dr com.apple.quarantine <folder>` in Terminal on the extracted portable folder or on `/Applications/BoldoAtlas.app`, or use **System Settings › Privacy & Security › Open Anyway**. For the portable, remove the quarantine before opening it: otherwise macOS runs it from a read-only copy and BoldoAtlas warns that it cannot save.
- **Linux (AppImage):** make it executable with `chmod +x BoldoAtlas_linux_x64.AppImage` (or in the file manager: Properties › Allow executing). The portable one already is if you extract the zip with `unzip` or the file manager.

## Privacy

Everything is stored on your computer and BoldoAtlas has no accounts. Its only automatic connection is the check for new versions (daily by default; change it or turn it off in **Settings › Updates**): it reads the public list of GitHub releases and the new version's `latest.json` and `novedades.json`, sends no organization data or identifiers, and never installs without asking.

## Build from source

Requires Node 24+ and stable Rust.

```bash
npm ci
npm run app            # run in development (picks a free port; closing the window or Ctrl+C stops everything)
npm run test           # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
npm run release        # release for the current system (installer and portable) in release/<version>/
```

`npm run release` is the same command GitHub Actions runs on each system, so a local build is exactly what would be published. On Linux it first needs the WebKitGTK libraries ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)); on macOS it builds the universal binary, so it needs `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

### Versions and releases

Every PR merged into `main` is a version. While in alpha, merging creates the next tag (`v0.1.0-alpha.N+1`) and publishes the prerelease with the **Notas de la versión** section of every PR merged since the previous release (or its title). Docs-only or CI-only merges don't publish; they ship with the next release. The labels `version:parche`, `version:menor` and `version:mayor` publish a regular X.Y.Z instead. Each PR states its future version in a comment, and its test portable (the `build-prueba` artifact) carries that version plus the PR number, e.g. `0.1.0-alpha.3+pr4`. PRs build the Windows portable; Linux and macOS ones are requested with the `build-todas` label on the PR or with **Run workflow** on `build-prueba`. Every release publishes all three systems. You can still publish by hand by pushing a tag: `git tag v1.2.0 && git push origin v1.2.0`.

Design document: [docs/superpowers/specs](docs/superpowers/specs/2026-10-28-boldo-atlas-design.md).

## License

[AGPL-3.0](LICENSE) · Created by **Michael Jim Scott Bravo**.
