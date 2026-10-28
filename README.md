<p align="center">
  <img src="assets/brand/icono.png" alt="BoldoAtlas" width="112">
</p>

<h1 align="center">BoldoAtlas</h1>

<p align="center">
  <strong>Org charts, processes and people records — a local, portable desktop app for Windows.</strong><br>
  No server, no accounts, no internet required. Your data stays on your computer.
</p>

<p align="center">
  <a href="README.es.md">Español</a> ·
  <a href="https://mscottb.github.io/BoldoAtlas/">Website</a> ·
  <a href="https://github.com/MscottB/BoldoAtlas/releases/latest">Download</a>
</p>

<p align="center">
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-1e2a38">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-c8743f">
  <img alt="Built with Tauri and Vue" src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20Vue%203-1e2a38">
  <img alt="Status: in development" src="https://img.shields.io/badge/status-in%20development-c8743f">
</p>

---

## What it is

BoldoAtlas lets you build the organizational chart of a company — management levels, areas and sub-areas, connected hierarchically or laterally — and keep, on the same tree, its processes, activities and the record of every person who works there.

It is designed for **large organizations**: very big trees, several independent trees in the same database, and any branch can be opened as a tree of its own without copying it.

## Features

| | Feature |
|---|---|
| ✅ | 100 % local SQLite database, portable mode (runs from a USB drive), automatic backups before migrations |
| ✅ | Version shown in *About*, generated from git (SemVer + build date) |
| 🚧 | Tree canvas: create, rename, drag to reorganize, collapse branches, lateral connections, highlight by tag |
| 🚧 | Tree manager: several independent trees and saved sub-trees (open any branch as its own tree) |
| 🚧 | People records and vacancies, with managed lists for job title, contract type, site and shift |
| 🚧 | Directory with filters, `Ctrl+K` search, light/dark theme with accent color |
| 🚧 | English and Spanish interface, built-in Help |
| 🗓️ | Processes (SIPOC), activities (RACI matrix) and indicators |
| 🗓️ | PDF, Excel, PNG/SVG exports and bulk load from Excel/CSV |
| 🗓️ | Encrypted `.boldo` files with a per-file code to share all or part of the organization, with reviewed merge |

✅ available · 🚧 in development · 🗓️ planned

## Download

Get it from **[Releases](https://github.com/MscottB/BoldoAtlas/releases/latest)** (the first public release is coming soon):

| File | Use |
|---|---|
| `BoldoAtlas_windows_x64_portable.zip` | Extract anywhere and run `BoldoAtlas.exe`. Data lives in `datos/` next to the program. |
| `BoldoAtlas_windows_x64_setup.exe` | Installer. Data lives in `%APPDATA%\io.github.mscottb.boldoatlas`. |
| `SHA256SUMS.txt` | Checksums: `Get-FileHash <file> -Algorithm SHA256`. |

Requirements: Windows 10 or 11 with WebView2 (included in Windows 11 and almost every Windows 10).

> **Windows SmartScreen:** the program is not code-signed yet, so the first time Windows may show "Windows protected your PC". Click **More info → Run anyway**. In portable mode, extract the zip first — running it from inside the zip cannot save data.

## Privacy

Everything is stored on your computer. BoldoAtlas makes no network connections and has no accounts. Files you share with other people (`.boldo`) will be encrypted and open only with the code generated for each file.

## Build from source

Requires Node 24+ and stable Rust.

```bash
npm ci
npm run tauri dev      # run in development
npm run test           # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
npm run release        # full Windows release in release/<version>/
```

`npm run release` is the same command GitHub Actions uses, so a local build is exactly what would be published. To publish a version, push a tag: `git tag v1.2.0 && git push origin v1.2.0`.

## Roadmap

1. ✅ Foundations — database, portable mode, versioning, CI/CD
2. 🚧 Core — tree canvas, tree manager, people records, managed lists, directory, i18n, Help
3. 🗓️ Processes (SIPOC), activities (RACI) and indicators
4. 🗓️ Exports (PDF, Excel, images) and bulk load
5. 🗓️ Encrypted `.boldo` files, merge and scenarios
6. 🗓️ Website with user manual

Design document: [docs/superpowers/specs](docs/superpowers/specs/2026-10-28-boldo-atlas-design.md).

## License

[AGPL-3.0](LICENSE) · Created by **Michael Jim Scott Bravo**.
