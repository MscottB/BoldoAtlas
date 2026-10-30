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

## Selecting, creating and renaming

- **Click** a card to select it. Click the background to clear the selection.
- The selected card shows **+**: it creates a sub-unit with the type that follows its parent's in the list of types (the last one repeats) ready for you to type its name.
- With the card selected, **Positions (n)** lists the unit's positions and lets you create a new one (see "Positions and replacements").
- **Double-click** the name, or press `F2` with the name focused, to edit it. `Enter` saves and `Esc` cancels.
- **+ New unit**, in the canvas bar, creates a sub-unit of the selected card; if none is selected, of the root of the focused view, or a new root of the first type in the list.

## Moving a unit

Drag a card and drop it on another: BoldoAtlas asks "Move X into Y?" before changing its parent. A unit can't be moved inside its own branch: a warning appears and nothing changes. If you drop the card on empty space, it goes back to its place.

## Highlighting

In the canvas bar you can highlight by tag, by text (part of the name, ignoring accents and case) or both at once. Units that don't match are dimmed, not hidden.

## Moving around the canvas

Drag the background to pan and use the mouse wheel or the **−** and **+** buttons to zoom out or in. **Fit view** (`Ctrl` + `0`) fits the whole tree in the window. The minimap in the corner shows where you are.

## Opening a branch as a tree

On the selected card, the **Open as tree** button shows only that unit and everything under it. It isn't a copy: what you change there changes in the full tree. At the top you see the origin path (press any step to open that level), **Up one level** and **View in the full tree**, which goes back to the whole tree with that unit expanded into view, selected and centered.
