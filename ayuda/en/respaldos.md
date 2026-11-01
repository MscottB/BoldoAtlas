# Backups

::: info In short
BoldoAtlas copies your data by itself, in case something goes wrong. Here you see where the backups are kept, how to make one by hand and how to restore it.
:::

BoldoAtlas keeps copies of your data in the **respaldos** (backups) folder, inside the data folder:

- **Portable:** `datos/respaldos/`, next to the program.
- **Installed:** `respaldos` inside your user data folder; on Windows, `%APPDATA%\io.github.mscottb.boldoatlas\respaldos\` (for Linux and macOS, see **Getting started › Portable and installed mode**).

Each backup is a file `boldo-YYYYMMDD-HHMM.db` with the date and time it was made. If two are made in the same minute, the second one ends in `-2`.

## Automatic backup

When the app opens and while it stays open, also in the tray, if the last backup is more than 24 hours old a new one is made in the background: you can keep working meanwhile. In **Settings › Backups › View and restore backups** you choose how often: **Never**, **Every time** it opens (only when opening), **Every 24 hours** (the default) or **Every 7 days**. The choice applies to this computer only.

The **10 most recent backups** are kept; making a new one deletes the oldest. Other files in the folder are not touched. If an automatic backup fails, a notice appears.

## Backup list

In **Settings › Backups** you see the date of the **last backup** next to **Back up now**. The list, the frequency and **Open folder** are under **View and restore backups**, which opens with a click and stays as you leave it; if you come from **Backups** in the app menu, it is already open. There you see each backup with its **date**, **size** and **data revision**: a number that goes up with every saved change and tells you which one is newer. A damaged file is marked **Unreadable** and cannot be restored.

- **Back up now** makes a backup right away.
- **Open folder** opens the backups folder in File Explorer, for example to copy them to a USB drive.

![Settings, Backups section: last backup, Back up now, Open folder and the backup list with its Restore button.](../img/en/respaldos-lista.webp "Settings › Backups (sample list). 1: Back up now. 2: Open folder. 3: Restore."){width=760 height=440}

::: tip Tip
To take a copy elsewhere, press **Open folder** and copy the `.db` file you want, for example to a USB drive.
:::

## Before replacing your data

When you choose **New empty organization** or **Explore the example** with data loaded, or when you apply a [`.boldo` file](exportar-importar.md), BoldoAtlas first makes a backup marked **Before replacing**. Like the one made before restoring, it is never deleted automatically: if you change your mind, restore it from this list. If the backup fails, nothing is replaced.

## Restore

::: warning Important
Restoring replaces your current data with the backup's and restarts the app.
:::

1. Under **View and restore backups**, press **Restore** on the row of the backup you want to recover.
2. Confirm with **Restore and restart**.

Before replacing anything, BoldoAtlas backs up your current data: it appears in the list marked **Before restore** and is never deleted automatically. If you picked the wrong backup, restore that one. Then your data is replaced with the backup and the app restarts.

- A backup made with an older version of BoldoAtlas is updated when restored. One made with a **newer** version cannot be restored until you update BoldoAtlas.
- If another BoldoAtlas window is open with the same data, close it first.
- If anything fails, your current data stays as it was.

**See also:** [Getting started](inicio.md) · [Updates](actualizaciones.md).
