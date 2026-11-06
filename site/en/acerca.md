---
title: About
description: Author, license, repository, how to contribute and frequently asked questions about BoldoAtlas.
---

# About

BoldoAtlas is a local, portable desktop app for building large org charts and keeping a record of the people who work in them.

- **Created by:** Michael Jim Scott Bravo.
- **License:** [AGPL-3.0](https://github.com/MscottB/BoldoAtlas/blob/main/LICENSE).
- **Code:** [github.com/MscottB/BoldoAtlas](https://github.com/MscottB/BoldoAtlas).
- **Built with:** Tauri 2 and Vue 3.

## How to contribute

Found a bug or have an idea? Open an [issue](https://github.com/MscottB/BoldoAtlas/issues) on GitHub. In the app's **About** screen, the **Copy information** button prepares the version and technical details to paste into your report.

To send code, see the [contributing guide](https://github.com/MscottB/BoldoAtlas/blob/main/CONTRIBUTING.md), which includes the license agreement (CLA).

## Privacy

Everything is stored on your computer. BoldoAtlas does not need internet to work and has no accounts. What the app protects, its single automatic connection and how to report a problem are in [Security and privacy](/en/seguridad).

## Frequently asked questions {#preguntas}

### How much does it cost?

Nothing. BoldoAtlas is free software under the AGPL-3.0 license: no plans and no subscriptions.

### Where does my data live?

On your computer, in one SQLite database per organization: in the `datos/` folder next to the program if you use the portable version, or in your user folder if you install it; a file you open from another folder stays where it is. BoldoAtlas doesn't need the internet to work and sends your data nowhere.

### How do I merge the work of two copies?

One person exports a `.boldo` file and the other imports it with Review and decide: it compares both sides and you choose what stays. [Review and decide →](/en/manual/exportar-importar#review-and-decide)

### Which systems does it run on?

Windows 10 and 11 (x64), Linux x64 and macOS 11 or newer, on Intel and Apple Silicon. The first time, your system may ask you to confirm that you want to open it. [How to open it →](/en/descargas#sin-firma)

### How do I update it?

BoldoAtlas checks for new versions when it opens and every day (you can change how often or turn it off) and lets you know; it never downloads or installs anything without your confirmation. The portable version replaces the program inside its folder and `datos/` is not touched. If the new version changes the database, it makes a backup first. [How to update →](/en/descargas#how-to-update)

### Does it work for large organizations?

Yes, it is built for them. It was tested with 2,000 units, 3,000 positions and 10,000 people: branches fold away, the directory draws only the rows in view and photos load when they appear. With more than 300 cards in view, the canvas simplifies them when you zoom out so it keeps moving smoothly.

### Is it a final version?

No: it is a test version. If something fails, tell us on GitHub. [Report a problem →](https://github.com/MscottB/BoldoAtlas/issues)
