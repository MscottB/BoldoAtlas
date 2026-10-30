# Backups

BoldoAtlas keeps copies of your data in the **respaldos** (backups) folder, inside the data folder:

- **Portable:** `datos\respaldos\`, next to `BoldoAtlas.exe`.
- **Installed:** `%APPDATA%\io.github.mscottb.boldoatlas\respaldos\`.

Each backup is a file `boldo-YYYYMMDD-HHMM.db` with the date and time it was made. If two are made in the same minute, the second one ends in `-2`.

## Automatic backup

When the app opens, if the last backup is more than 24 hours old, a new one is made in the background: you can keep working meanwhile. In **Settings › Backups** you choose how often: **Never**, **Every time** it opens, **Every 24 hours** (the default) or **Every 7 days**. The choice applies to this computer only.

The **10 most recent backups** are kept; making a new one deletes the oldest. Other files in the folder are not touched. If an automatic backup fails, a notice appears.

## Backup list

In **Settings › Backups** you see each backup with its **date**, **size** and **data revision**: a number that goes up with every saved change and tells you which one is newer. A damaged file is marked **Unreadable** and cannot be restored.

- **Back up now** makes a backup right away.
- **Open folder** opens the backups folder in File Explorer, for example to copy them to a USB drive.

## Restore

1. Press **Restore** on the row of the backup you want to recover.
2. Confirm with **Restore and restart**.

Before replacing anything, BoldoAtlas backs up your current data: it appears in the list marked **Before restore** and is never deleted automatically. If you picked the wrong backup, restore that one. Then your data is replaced with the backup and the app restarts.

- A backup made with an older version of BoldoAtlas is updated when restored. One made with a **newer** version cannot be restored until you update BoldoAtlas.
- If another BoldoAtlas window is open with the same data, close it first.
- If anything fails, your current data stays as it was.
