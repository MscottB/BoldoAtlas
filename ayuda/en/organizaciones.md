# Organizations

::: info In short
You can keep several organizations in BoldoAtlas and move between them with their tabs. Each keeps its data, photos, backups and preferences apart: nothing from one reaches another.
:::

An organization is a database file with its org chart, its people and its lists. It lets you keep different clients, the companies in a group or a test copy next to the real one, without mixing them.

## Create, open a file or explore the example

On **Home**, under **Create or open another organization**, these are always in view:

- **Create organization:** asks for the organization name and the name of its root unit, and opens it in a new tab, on the tree.
- **Open file…:** choose a BoldoAtlas `.db` file that is in another folder or on a USB drive. Before opening it, BoldoAtlas checks that it is a valid organization. It stays in your list and you work on it where it is (see [External files](organizaciones.md#external-files)).
- **Explore the example:** creates a sample organization, in the interface language, and opens it. If the example is already in your list, it opens that one instead of creating another.

None of the three touches the organization you had open: it stays in your list as it was. **New empty organization…** and **Explore the example…**, in the app menu, do the same. To bring in a `.boldo` file as a separate organization, see [Export and import](exportar-importar.md).

## Open and switch

- **Home › Recently opened** shows up to 8 organizations, the one you opened last first, with its logo or initial in a box of its color, the **Open** mark on the one you have open and how long ago you opened it. It appears when there is more than one. One click opens it.
- **Open another organization…**, in the app menu, and **Open another organization: …**, in the command palette (`Ctrl+K`), offer the others in **Recently opened**.

When you open an organization, BoldoAtlas goes to one of its tabs or, if it has none, opens a new one on its tree. While it switches you see **Opening the organization…** instead of the view. If a person's record has changes you have not applied, it asks first, and if work is in progress, such as an export or a backup you asked for, it does not switch and asks you to wait until it finishes. If it is the automatic backup, it waits for it with **Opening the organization…** in view.

When the open tabs belong to more than one organization, each tab shows its organization's color dot and its name before the title, for example "Demo Company · Tree". Going to a tab of another organization opens it. Only the active tab's organization is loaded, and across all of them you can have up to 12 tabs open. The top bar shows the name and color of the open organization.

::: tip Tip
To compare two organizations, keep a tab of each one and move between them with `Ctrl` + `Tab`.
:::

## What is kept apart

Each organization has its own file, with its photos and its logo, and its own backups. Its view preferences are its own too: the state of the tree, the Directory's filters and columns, how people show in a unit's panel and the minimap. The theme, the language, the accent color, the interface size, how often backups and updates run, the sidebar and what happens on closing apply to all your organizations.

| What | Where, inside the data folder |
|---|---|
| The organization you already had, or the first one you create | `boldo.db`, with its backups in `respaldos/` |
| An organization created, imported or restored later | `organizaciones/<id>/organizacion.db`, with its backups in `organizaciones/<id>/respaldos/` |
| An external file | Where it is; its backups, in `organizaciones/<id>/respaldos/` |
| Copies saved when deleting | `organizaciones-eliminadas/` |

The data folder is the one in [Where your data lives](inicio.md#where-your-data-lives). **Project data** shows the path of the open organization's file, and its **Open folder** opens the folder where it is.

The automatic backup is made for the open organization. With the **Every time** frequency, only the first time you open each organization in the session counts: going back to its tab does not back up again. When you open BoldoAtlas, the last organization you used opens.

## External files

A file opened with **Open file…** stays where it is and BoldoAtlas writes to it. While it is open, helper files appear next to it, such as `-wal`, `-shm` and `.bloqueo`: keep them with the file.

- **Network folder:** BoldoAtlas does not work on it directly, because another computer could damage the file. It asks whether to copy it to this computer and, with **Copy and open**, opens the copy.
- **Portable:** if the file is outside the BoldoAtlas portable folder, it warns that it will not go with the folder when you take it to another computer.
- **Over 512 MiB:** it asks first, because it may take a while to open and use more memory; **Open anyway** goes ahead.
- **A copy of another one in your list:** it opens as a separate organization, and a notice says so.
- **If it is no longer there** (an unplugged USB drive): **Recently opened** says "Its file can't be found." and offers **Find file** and **Remove from list**. If the file you choose has other data, it asks whether to use it instead.
- **With an unfinished transaction** (a `-journal` file next to it): a new file does not open; keep the two together. If it is an organization on your list and you look for it with **Find file**, it asks before recovering it, because that changes the file.

::: warning Important
Opening someone else's file carries the same risks as importing one: open it only if you trust whoever sent it.
:::

## Remove and delete

**Remove from list** deletes nothing: the file stays where it is and you can add it again by opening it. Its tabs will say it is gone. The open organization cannot be removed: switch to another first.

**Delete organization** deletes its file and its backups from the disk. It is in the **⋮** menu of each **Recently opened** entry and in **Settings › Organizations**:

1. Press **Delete organization**, on Home, or **Delete**, in Settings.
2. Read what is deleted and how much space it frees. **Save a copy first** comes checked: it leaves a copy of the database, without the backups, in **Copies of deleted organizations**. For an external file it only appears if you check **Also delete the file**.
3. Type the organization's name to confirm and press **Delete**.

Its tabs close. If it was the open one, BoldoAtlas first switches to another and goes back to Home; if none is left, it starts with an empty one. For an external file, by default it only leaves the list and its backups are deleted: the file is not touched. To delete it too, check **Also delete the file**, which shows its path.

::: warning Important
Deleting cannot be undone. Without **Save a copy first**, what is deleted cannot be recovered.
:::

**Settings › Organizations** shows all of them, with their path and the space their database and backups take. There you change each one's color, remove it from the list or delete it. In **Copies of deleted organizations**, each copy offers **Restore as a new organization** and **Delete**.

## If an organization does not open

The tab shows "This organization could not be opened", the reason and a detail you can copy when asking for help. The other tabs are not touched, and the file is not changed.

| Reason | What to do |
|---|---|
| The file cannot be found | Connect the drive where it is, or press **Find file** |
| Another copy of BoldoAtlas has it open | Close it and press **Try again** |
| Another program is using the file | Close it and press **Try again** |
| It was saved with a newer version of BoldoAtlas | Press **Check for updates** and update |
| The file is damaged or is not a BoldoAtlas file | It does not open |

**Close tab** closes it. If the one that does not open is the last one you used, when you open BoldoAtlas another organization opens instead and a notice says so.

**See also:** [Getting started](inicio.md) · [Work tabs](pestanas.md) · [Backups](respaldos.md) · [Export and import](exportar-importar.md).
