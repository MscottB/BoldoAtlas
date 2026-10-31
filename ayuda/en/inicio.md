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

## The app menu and returning to Home

The logo button on the left of the top bar opens the **app menu**:

- **Home** returns to the welcome screen at any time, also with data loaded.
- **New empty organization…** and **Explore the example…** replace the current data. They ask for confirmation first and make an **automatic backup** (if the backup fails, nothing is replaced); the backup stays in the **Settings › Backups** list so you can restore it.
- **Open .boldo file** (Phase 5) and **Import Excel** (Phase 4) are disabled for now.
- **Backups** and **Settings** open those sections; **Project data** shows where your data lives.

The same actions are in the command palette (`Ctrl+K`). **Settings**, **Help** and **About** close with their **Close** button, with `Esc`, or with a second click on their side-menu entry, and you return to the previous view (or to the tree if there is none). The sidebar folds, and is pinned open again, with the button under the **BoldoAtlas** logo. When folded, it opens over the content when you rest the mouse on it for a moment (or reach it with `Tab`) and folds again when you leave or press `Esc`; turn this off in **Settings › Appearance › Open the sidebar on mouse hover**. In a narrow window (under 1100 px) the sidebar folds by itself. A unit's panel closes with the **×** in its header.

## Which project is open

The window title and the top bar show the organization name with the **Main** badge (there is a single database for now). Clicking them opens **Project data**: the mode (portable or installed), the path of the database file, its size and last modification, with **Copy path** and **Open folder**.

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
