# Keyboard shortcuts

BoldoAtlas's own shortcuts:

| Key                         | What it does                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl` + `K`                | Opens the command palette: search units, people, vacant positions and actions (works even while typing in a field)                                                     |
| `N`                         | New child unit of the selected unit                                                                                                                                    |
| `F`                         | Search on the canvas                                                                                                                                                   |
| `Del`                       | Deletes the selection (you have 8 seconds to undo); with several units selected, deletes them all at once                                                              |
| `Esc`                       | Closes the open panel or dialog; with several units selected, clears the selection                                                                                     |
| `Ctrl` + `0`                | Fits the whole tree in the window                                                                                                                                      |
| `←` `→` `↑` `↓`             | Move around the tree: `↑` goes to the parent, `↓` to the first child (opens the branch if folded), `←` `→` to siblings. With a horizontal tree they follow the drawing |
| `Shift` + `←` `→` `↑` `↓`   | Add to the selection the unit the arrow would go to (multiple selection)                                                                                               |
| `Ctrl` + `D`                | Duplicates the branch of the selected unit; the copy goes right after the original                                                                                     |
| `Ctrl` + `C` / `Ctrl` + `V` | With a position focused in the tree: copies or pastes its style (legend)                                                                                               |

`N`, `F`, `Del`, `Ctrl` + `D` and the arrow keys (also with `Shift`) only act on the tree, when you are not typing in a text field and no dialog is open. While viewing the chart at a past date, `N`, `Del` and `Ctrl` + `D` do nothing (read-only) and there is no multiple selection. `Ctrl` + `D` only duplicates when exactly one unit is selected. With `Del`, a unit that has content asks for confirmation before it is deleted; several selected units always ask for it.
