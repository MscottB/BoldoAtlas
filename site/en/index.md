---
layout: home
title: BoldoAtlas
hero:
  name: BoldoAtlas
  text: Giant org charts, on your computer
  tagline: "Build your organization's org chart and a record for each person. No server, no accounts, and no need for internet: your data stays with you."
  image:
    src: /icono.png
    alt: BoldoAtlas logo
  actions:
    - theme: brand
      text: Download portable
      link: /en/descargas#portable
    - theme: alt
      text: Installer
      link: /en/descargas#instaladores
    - theme: alt
      text: Manual
      link: /en/manual/inicio
features:
  - icon: 🌳
    title: Very large trees
    details: Divisions, areas and sub-areas connected to each other, with branches you can fold and saved views. Several trees in one database, and any branch opens as a tree of its own.
  - icon: 👥
    title: Positions, people and vacancies
    details: Each position knows who holds it and who covers it. Vacancies show on the card, and the person's record keeps contact, contract, site and shift.
  - icon: 🕰️
    title: The org chart on any date
    details: See how the organization looked on a past day, read-only, and jump between the days that had changes.
  - icon: 🔎
    title: Directory and search
    details: A table with filters and the columns you want, and a Ctrl+K command palette to reach any unit or person.
  - icon: 💾
    title: 100% local and portable
    details: A SQLite database on your computer, automatic backups and a portable mode that runs from a USB drive. It does not need internet to work.
  - icon: 🌐
    title: Windows, Linux and macOS
    details: Spanish and English interface, light and dark theme, and a built-in manual that is also on this site.
---

## What it looks like

<div class="capturas">
<Captura archivo="arbol-claro.png" :ancho="1280" :alto="766" alt="The tree of a sample organization in light theme, with the sidebar and the toolbar">The tree, in light theme. The screenshots show the Spanish interface.</Captura>
<Captura archivo="arbol-oscuro.png" :ancho="1280" :alto="766" alt="The same tree in dark theme">The same tree, in dark theme.</Captura>
</div>

<div class="capturas">
<Captura archivo="tarjeta.png" :ancho="767" :alto="539" alt="A division card with its head, the team's faces, the headcount and a vacancy">A unit's card: its head, the team's faces, the headcount and the vacancies.</Captura>
<Captura archivo="calendario.png" :ancho="1280" :alto="766" alt="The org chart as of 1 July 2023 with the change calendar open">The org chart on a past date, with the days that had changes highlighted.</Captura>
</div>

<div class="capturas">
<Captura archivo="directorio.png" :ancho="1280" :alto="800" alt="The directory: a table with people, job title, division, area and email">The directory, with search and filters.</Captura>
<Captura archivo="idioma-en.png" :ancho="1280" :alto="766" alt="The app menu with the language switch, in English">The language changes instantly, from the app menu.</Captura>
</div>

## Coming soon

Processes (SIPOC) and activities (RACI matrix), indicators, scenarios, export to PDF, Excel and images, bulk load from Excel, and encrypted `.boldo` files to share all or part of the organization. Until they exist, their buttons don't appear in the app.

## Why local

An org chart holds the names, emails and job titles of real people. BoldoAtlas keeps everything on your computer and does not need internet to work: no accounts to create, nothing to subscribe to, and nothing lost if a service goes down. To take it to another computer, the portable version fits on a USB drive. Later it will be able to check for updates, and that will be optional.

## License

BoldoAtlas is free software under [AGPL-3.0](https://github.com/MscottB/BoldoAtlas/blob/main/LICENSE). The code is on [GitHub](https://github.com/MscottB/BoldoAtlas).
