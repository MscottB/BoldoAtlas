# Getting started

## What BoldoAtlas is

BoldoAtlas is a Windows desktop app for building your organization's org chart: divisions, areas and sub-areas connected to each other, plus a record for each person who works in them. You can explore the result on the tree canvas or in the directory.

Processes, indicators and export arrive in later phases.

## First use

When you open a database with no units, BoldoAtlas shows the welcome screen with four paths:

- **Create an empty organization:** asks for the organization name and the name of its root unit (of the first active unit type) and takes you to the tree.
- **Load from Excel** (arrives in Phase 4) and **open a .boldo file** (Phase 5): shown disabled for now.
- **Explore an example:** creates a sample organization, in the interface language, to look around the app.

Afterwards you can adjust the name, logo, theme and language in **Settings**, and the lists of job titles, sites and the rest in **Settings › Open records**.

## Portable and installed mode

- **Portable:** extract `BoldoAtlas_windows_x64_portable.zip` into any folder (or onto a USB drive) and run `BoldoAtlas.exe`. It works because a `portable.flag` file sits next to the program. Extract the zip before running: opening it from inside the zip prevents data from being saved.
- **Installed:** install it with `BoldoAtlas_windows_x64_setup.exe` and the data goes to your Windows user's data folder.

_About_ (at the bottom of the menu) shows the mode it is running in and the exact data folder.

## Where your data lives

Everything is stored in a local SQLite database, `boldo.db`:

- In portable mode, in the `datos/` folder next to the program.
- In installed mode, in `%APPDATA%\io.github.mscottb.boldoatlas`.

Before upgrading the database structure, BoldoAtlas saves a copy in the `respaldos` subfolder. To move your data to another computer in portable mode, copy the whole folder.

Changes are saved automatically: there is no "Save" button. The indicator in the top bar reads "Saved" when everything is on disk.

## Privacy

Nothing leaves your computer. BoldoAtlas has no accounts, no server and never connects to the internet.
