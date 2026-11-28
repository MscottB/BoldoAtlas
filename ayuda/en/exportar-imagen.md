# Export as an image

::: info In short
Save the org chart as a **PNG**, **JPG** or **SVG** image to use in a presentation, a document or an email. You choose which part, how much detail and the format, and you see a preview before saving.
:::

## Where it opens

There are three ways, and all of them open the same window:

- **Import/Export**, in the sidebar: the **Org chart image** card.
- The **Export as image** button in the tree toolbar. If a branch is focused, the window starts with that branch.
- Right-click on a unit: **Export this branch as an image**.

## Level of detail

- **Structure**: only the units, with no personal data. It is the one to use when sharing outside. It is selected the first time; after that, the window remembers the one you used.
- **Presentation**: each unit with its head, in large type. For a slide.
- **As on screen**: what the canvas shows with your Customize settings, with the color legend if you have one on. Positions appear if **Show positions** is on.

If you are viewing the org chart on a past date, the image shows that day, and the date goes in its header and in the file name.

## Which part and which branches open

Under **Which part** you choose the whole organization or one unit with everything under it. The branches come out as you see them on screen; if you open the window from **Import/Export**, which has no tree on screen, they come out as the tree does when it first opens. Check **Open every branch in the scope** to get them all expanded.

::: warning Many cards
If the image has more than 1,000 cards, the window says so with the number: it may take a while and come out very large. For a large organization, choose a branch or leave the branches as they are on screen.
:::

## Formats and copy

- **PNG**: choose the **Background** (**White** or **Transparent**) and the **Size**, from 1x to 4x. If the size you ask for is too large, it is lowered automatically and a notice says what it came down to.
- **JPG**: always with a white background; you choose the size.
- **SVG**: a vector drawing, which can be enlarged without losing quality and opened in an editor.
- **HTML viewer**: a file that opens in the browser, with search and branches that fold. See [Export as an HTML viewer](exportar-visor.md).
- If the organization is so wide that it does not fit in an image even at 1x, as a PNG, JPG or when copied it would be smaller than on screen and unreadable: the window warns you. Choose a branch or save it as SVG.

**Save…** lets you choose where the file goes; when it finishes, **Open folder** shows it. **Copy image** puts a PNG on the clipboard, to paste straight into a presentation or an email. BoldoAtlas remembers the level, format, background and size you used.

## PDF

Choose **PDF** to get the org chart on sheets, ready to print or send. It is a multi-page document, with the organization and the date at the top and "Page N of M" at the bottom. Under **Paper** you choose **Letter**, **Oficio**, **A4**, **A3** or **A2**, and under **Orientation**, **Landscape** or **Portrait**. The preview shows the first page and says how many pages there will be; **by branches**, if the org chart does not fit on the first page, the pages are counted when you save.

Under **Split** you choose how the drawing is cut:

- **On one page**: the whole org chart on a single sheet, at whatever scale fits.
- **By branches**: each big branch goes on its own page. Where the drawing is cut, the card says **Continues on page N**, and the page for that branch says **Continued from page M**. If the children of a unit do not fit together, they go in parts: "continued, 1 of 3", "2 of 3"...
- **In a grid**: the org chart is cut into equal sheets, like a map. The first page is a **map** of the whole drawing, with each sheet marked. The sheets overlap by 1 cm and have **cut marks** at the corners, for taping them together. Each one says "Row R, column C".

::: warning By branches follows what you see on screen
**By branches** splits the branches as they are open on screen. A folded branch comes out with its **+N units** and is not split. To split everything, check **Open every branch in the scope**.
:::

If **As on screen** has a color legend, it goes on its own page, at the end.

### Warnings

- If the text would be **under 8 points**, the window warns you, because it would be hard to read. On one page, split by branches or in a grid; by branches, try a larger paper size; in a grid, try another level of detail.
- If the PDF would have **more than 200 pages**, the window warns you with the number: it may take a while.

### Cancel

While the pages are prepared and the PDF is made, the bottom of the window shows how far it is ("Page 3 of 12") and a **Cancel** button. Cancelling, or closing the window, stops everything and saves nothing. If the org chart changes while it is being prepared, the PDF is not saved: the window tells you, and you can save it again.

Like the image, the PDF is not encrypted, and with the **Structure** level it has no personal data.

## The image is not encrypted

Before saving or copying, a notice reminds you that the image is not encrypted: anyone who opens it will see what it contains. Press **I accept, continue** to go on. Whoever generates it is responsible for where it is saved and who it is shared with. With the **Structure** level, no personal data comes out.

**See also:** [Export and import](exportar-importar.md) · [Tree](arbol.md).
