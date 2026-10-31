# The tree

The tree is the main screen: it shows your organization as an org chart you can build and reorganize.

## The cards

Each unit is a card with:

- its type (for example, Gerencia or Área) and its name;
- the photo or initials and name of its manager (**Replacement: name** if its position only has a replacement), or **No manager** if it has none;
- the total headcount of its branch (the unit and everything under it);
- the branch's vacancies, if any;
- a colored dot for each tag (hover over it to see its name).

Unit types are your organization's own list: it starts with Gerencia, Área, Subárea and Otra, which you can rename, reorder, deactivate or add to (for example, Superintendency or Department). The order of the list doesn't restrict the structure: any type can report to any other.

Solid lines join each unit to its parent. Dotted lines are lateral connections between units, with their description.

## Collapsing and expanding branches

When the tree opens you see the roots and their first level; the rest is collapsed. The button at the bottom right of a card shows how many sub-units are hidden (for example `+3`): press it to expand them and again to collapse them.

The **Branches** button in the canvas toolbar expands or collapses everything at once:

- **Expand all** opens every branch.
- **Collapse all** leaves only the roots.
- **Collapse to level** 1 to 6 shows that many levels (1 = roots only) and collapses the rest.

In a unit's context menu, **Expand branch** opens the unit and everything under it, and **Collapse branch** folds it together with its sub-branches: when you open it again you see one level. In a branch opened as a tree, levels are counted from its root.

## Tidy diagram

The tree is drawn tidy: each parent sits centred over its sub-units (and its positions, if shown), sibling units keep their order and each level takes one row (or column, when horizontal). Several roots sit side by side. Lateral connections do not change the drawing: they are only drawn on top.

**Rearrange**, in the canvas toolbar, lays out the drawing again and fits it to the window.

## Context menu

Right-click a card or the canvas background to open a menu with what you can do there. With the keyboard, open it with `Shift` + `F10` or the Menu key, on the focused card or, if there is none, the selected one (if there is none either, the background menu). Move with the arrow keys, `Enter` picks and `Esc` closes it and returns focus to the card.

- **Unit**: Open panel, New sub-unit, Rename, View people (opens the panel on the Positions tab), Expand branch, Collapse branch, Select branch (the unit and what is visible of its branch), Duplicate branch, Open as tree, Save in Trees and Delete… (with the usual confirmation).
- **Position** (with **Show positions** on): Open position, Assign holder, Register replacement, Copy style, Paste style and Remove style.
- **Background**: New root unit, Expand all, Collapse all, Rearrange, Fit view and View….

While viewing the chart at a past date, actions that change something are disabled.

## Selecting, creating and renaming

- **Click** a card to select it. Click the background to clear the selection.
- The selected card shows **+**: it creates a sub-unit with the type that follows its parent's in the list of types (the last one repeats) ready for you to type its name.
- Selecting a card opens the **unit panel**, to the right of the canvas (see "Unit panel"): its positions and all its data are there.
- **Double-click** the name, or press `F2` with the card focused or selected, to edit it. `Enter` saves and `Esc` cancels.
- **+ New unit**, in the canvas bar, creates a sub-unit of the selected card; if none is selected, of the root of the focused view, or a new root of the first type in the list.

## Moving a unit

Drag a card and drop it on another: BoldoAtlas asks "Move X into Y?" before changing its parent. A unit can't be moved inside its own branch: a warning appears and nothing changes. If you drop the card on empty space, it goes back to its place.

## Selecting several units

- **Ctrl + click** (or **Cmd + click**) adds the unit to the selection or, if it was already there, removes it. **Shift + click** adds it.
- **Shift + drag** on the background draws a box: the units that fall completely inside are added (positions are not selected).
- With the keyboard, **Shift + arrow** adds the unit the arrow would go to (see "Keyboard shortcuts"); without Shift, the arrows go back to a single unit.
- `Esc` or a click on the background clear the selection. If you collapse a branch, the units it was hiding are no longer selected.

With two or more units selected the unit panel does not open: a bar appears over the canvas with the number of units and the actions that apply to all of them at once:

- **Move to…**: choose the new parent (or **No parent (root)**). The selected units and everything below them are not offered. If a selected unit is below another selected one, only the upper one moves and takes its branch with it. Everything changes in a single step.
- **Collapse**: collapses the branches of all of them.
- **Tag…**: adds an existing or a new tag to all of them (if the name already exists, that tag is used). Units that already have the tag are not repeated.
- **Delete…**: asks how many units will be deleted; the content of each (subunits and positions) moves to its parent. A root unit with content is not deleted: the notice afterwards says how many were skipped. The notice has a single **Undo** (8 seconds) that puts everything back. `Del` does the same as the button.
- The **X** clears the selection.

While viewing the chart at a past date there is no multiple selection.

## Duplicating a branch

The **Duplicate branch** button (at the bottom of the unit panel's Summary and on the selected card) and `Ctrl` + `D` copy the unit with everything under it:

- The copy goes right after the original, named "X (copy)" (only the top unit; the ones below keep their names), and ends up selected. A root can be duplicated too: the copy is another root.
- The type, description, mark, tags and positions (job title, description and legend) are copied. Each copy's head points to the copied position.
- Lateral connections whose two ends are both inside the branch are copied.
- Copied positions are born **vacant**: holders, replacements and history are not copied.
- It is a single change, with no **Undo** notice: if you don't want the copy, delete it.

## Highlighting

In the canvas bar you can highlight by tag, by text (part of the name, ignoring accents and case) or both at once. Units that don't match are dimmed, not hidden.

The **Highlight by…** button adds more criteria: **With vacancies**, **Site**, **Contract type**, **Shift** and **Job title**. A unit is highlighted when, in its own positions (not those of its branch), it has a vacancy, a current holder with that site, contract type or shift, or a position with that job title. If you choose several criteria, all must be met. Highlighting lasts while the app is open; saved views do include it.

## Moving around the canvas

Drag the background to pan and use the mouse wheel or the **−** and **+** buttons to zoom out or in. **Fit view** (`Ctrl` + `0`) fits the whole tree in the window. The minimap in the corner shows where you are.

## Opening a branch as a tree

On the selected card, the **Open as tree** button shows only that unit and everything under it. It isn't a copy: what you change there changes in the full tree. At the top you see the origin path (press any step to open that level), **Up one level** and **View in the full tree**, which goes back to the whole tree with that unit expanded into view, selected and centered.

## View

The **View** button, in the canvas bar, opens the options for how the tree is drawn. They are remembered on this computer.

- **Show positions** (off at first): under each visible unit there is one card per position, with the job title, the holder or **Vacant**, and **Replacement: name** when a replacement is current. Press a position card, or focus it and press `Enter`, to open its record. You can hide the job title or the person. With many units expanded, positions add cards: collapse the branches you don't need.
- **Show on the cards the parent of type**: tick the types (for example, Division or Area) whose nearest parent you want to read on each unit card. Only the types some unit uses are listed.
- **Color by**: **None**, the **mark** of a type, or **Position legend**. With the mark of a type, each unit takes the mark (a color and a code of up to 4 letters) of its nearest parent of that type, itself included; it shows as a colored stripe on the left and the code on the card. With **Position legend**, position cards take the color of their legend (turn on **Show positions**; see "Legends and position colors"). Only one criterion applies at a time.

With a color criterion active, a **legend** appears at the bottom left of the canvas with the color, code and name of the unit that defines each mark you can see. It can be hidden and shown again from its header.

In addition, the **View** button lets you choose:

- **Direction**: vertical (top to bottom) or horizontal (left to right).
- **Density**: **Normal** or **Compact**. The compact card is one line (name, headcount and vacancies) and reduces the spacing: use it for very large trees. On the selected compact card, the headcount and vacancies make room for the buttons.
- **Lines**: right-angle or curved.
- **Align by unit type**: each unit goes in the row (or column, when horizontal) of its type, in the order of the type list; for example, all Área units share one row even if they hang at different depths. Only the types of the units on screen take a row (a type with no visible unit, or whose units are in collapsed branches, leaves no empty row). If a unit's type would put it in its parent's row or above, it moves to the row right after its parent's, so lines always go down (or right): with a Gerencia inside another Gerencia, the rows of the following types start lower; with a Gerencia under an Área, only that branch moves down. Positions go in the row right after their unit.
- **Card details**: unit type, head, head's photo, headcount, vacancies and tags.

Each tree (the full one or a subtree saved in Trees) remembers on this computer the last configuration you used in it.

## Saved views

The **Views** button saves the current configuration (direction, density, lines, card details, color by, highlighting and collapsed branches) by name for the tree you are looking at. Type a name and press **Save current view**; a name cannot be repeated within the same tree. Press a view's name to apply it; the pencil renames it and the trash can deletes it (with **Undo** for 8 seconds). Views belong to the full tree or to a saved subtree: a branch that is not saved in Trees has no views of its own. They are stored in the database, so they travel with it.

## Viewing a past date

The date picker in the canvas toolbar shows the org chart as it was on a past day. Pick the date or type it in full (from 1 January 1900 up to today; nothing changes while you type the year, and when you leave the field anything left half-typed is discarded): the **Viewing as of … · read only** band appears at the top with a **Back to today** button; you can also clear the picker.

- **Managers**, **headcount**, **vacancies** and **positions** are calculated with the assignments in force that day: an assignment counts if it starts that day or earlier and has not ended (the day it ends no longer counts, and is the first day of the handover).
- Units and positions **deleted before** that date and those **created after** it are hidden, unless they have an assignment in force that day (a position) or a position or sub-unit that is shown (a unit): so an organization entered today with old assignments shows in full. Anything deleted after the date reappears.
- It is **read only**: you cannot drag, rename, create, duplicate, select several units, paste a style or change anything in the unit panel or the position card, which show that day's data (the position history is shown in full). The **person's card** opens normally: their data has no history. The directory and the data review still show today.
- **Declared limit:** changes of parent unit are not recorded, so the shape of the tree is today's. A unit that was moved stays where it is now, a deleted unit reappears under the last parent it had (or as a root if that parent did not exist that day), and the positions and the manager position are today's. Assignments entered late count from their start date.

## Unit panel

Selecting a card (with the mouse, or with `Enter` on its name) opens a panel on the right: the canvas shrinks, it is not covered. Focus moves into the panel. The **Close the panel** button (the X), `Esc` or a click on the canvas background close it; with the X or `Esc` focus returns to the card, and `Esc` first saves whatever you were typing. At the top you see the unit's full location, with the type of each step; each step can be pressed to select that unit.

The **Summary** tab holds:

- **Type**, **name** and **description**. They are saved when you finish typing (`Enter`, `Tab` or leaving the field).
- **Parent unit**: a unit search to move the unit elsewhere without dragging it (this is the keyboard way). It does not offer the unit itself or anything below it; **No parent (root)** makes it a root.
- **Mark**: a color and a code of up to 4 characters, shown when you pick "Color by" in **View**. **Remove mark** clears both.
- **Head**: choose which of the unit's positions is the head (or **No head**). Below you see who holds it: the holder or, if there is none, **Replacement: name**.
- The direct **headcount** (positions with a holder in the unit itself), the total (with the whole branch) and the branch **vacancies**.
- **Tags**: remove one with its X, add an existing one or pick **New tag…** to create it with a color. If the name already exists, that tag is used instead of duplicating it.
- **Lateral connections**: type a description (optional) and choose the unit to connect to; remove one with its X. They show on the canvas as dashed lines when both units are visible.
- **Save in Trees** (not shown on roots, which already are a tree), **Duplicate branch** and **Delete unit**.

The **Positions** tab lists the unit's direct positions: job title, holder or **Vacant**, **Replacement: name** and its legend color. Press one to open its record, or **New position** to create another (see "Positions and replacements"). The **Processes** tab arrives in Phase 3.

### Deleting a unit

A unit with no content is deleted right away. If it has subunits or positions, BoldoAtlas asks first and **moves its content to the parent** of the deleted unit. A root unit with content cannot be deleted: first move or delete what it contains. After deleting, a notice with **Undo** appears for 8 seconds, which puts the unit and everything it contained back in place.
