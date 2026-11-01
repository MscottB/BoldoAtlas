# Security policy

[Versión en español](#política-de-seguridad)

BoldoAtlas stores personal data about workers on your own computer. This page says how to report a problem and what the app protects today.

## Supported versions

Only the most recent published version receives fixes. Updating is how you get them: there are no patches for older versions.

## Reporting a vulnerability

Please report it privately through GitHub: [open a private report](https://github.com/MscottB/BoldoAtlas/security/advisories/new). Do not open a public issue, and do not include real personal data in the report.

## What to expect

BoldoAtlas is maintained by one person, so there is no guaranteed response time. Your report will be read, you will be told whether it is confirmed, and a confirmed problem will be fixed in a new version. The advisory is published after the fix, and you will be credited if you want to be.

## What the app protects today

- **Your data stays on your computer.** There are no accounts and no servers of ours. The only automatic connection is the check for new versions: it reads the public list of GitHub releases and the new version's `latest.json` and `novedades.json`, and sends no organization data or identifiers. You can change or turn off that check in **Settings › Updates**.
- **Updates are signed.** The app installs a package only if its signature matches the public key built into the app and the signature covers the announced version. It never installs without asking, and it does not offer older versions.
- **The interface is restricted.** A content security policy allows only the app's own scripts and styles and blocks loading anything from the internet. The interface cannot send file paths for backups or data folders. Its database access is limited to reading and changing rows.
- **Text from outside is not trusted.** Release notes and help pages are shown with HTML turned off, and links open in your browser only if they are `http`, `https` or `mailto`.
- **`.boldo` files are encrypted** with XChaCha20-Poly1305 and a key derived from a one-time code (Argon2id) that is not saved anywhere. When importing, the content is not trusted even if the code is correct: it is opened read-only and checked against the expected schema before anything is applied.
- **Installed on Linux and macOS,** the data folder can be opened only by your user. On Windows, it is inside your user's `%APPDATA%`.
- **Each release** includes `SHA256SUMS.txt` and the list of its components (SBOM, in CycloneDX format). Known vulnerabilities in dependencies are checked every week.

## What the app does not protect today

- **The database and the backups are not encrypted.** Anyone who can open your user account, your disk or your USB drive can read them. Use disk encryption (BitLocker, FileVault, LUKS) and keep the folder out of shared locations.
- **The app has no login, users or permissions.** Everyone who can open it sees and changes everything, and it does not record who changed what.
- **The portable version keeps its data next to the program.** The protection of that data is the protection of the folder or USB drive you put it in.
- **It does not defend against malware or against someone with access to your user account.** Such a program could read or replace the files, including the program itself.
- **The programs are not signed with a Windows or Apple certificate,** so the system may warn when you open them. Check them against `SHA256SUMS.txt`, downloaded from the official releases page.
- **Automatic updates depend on GitHub and on the author's signing key.** The app cannot detect a release signed with a stolen key.

BoldoAtlas makes no claim about compliance with any law. Handling workers' personal data lawfully is the responsibility of whoever uses it.

---

# Política de seguridad

[English version](#security-policy)

BoldoAtlas guarda datos personales de trabajadores en tu propio computador. Esta página explica cómo reportar un problema y qué protege hoy la app.

## Versiones con arreglos

Solo la versión publicada más reciente recibe arreglos. Se reciben actualizando: no hay parches para versiones anteriores.

## Cómo reportar una vulnerabilidad

Repórtala en privado por GitHub: [abrir un reporte privado](https://github.com/MscottB/BoldoAtlas/security/advisories/new). No abras un issue público ni incluyas datos personales reales en el reporte.

## Qué esperar

A BoldoAtlas lo mantiene una sola persona, así que no hay un plazo de respuesta garantizado. Tu reporte se lee, se te dice si se confirma y, si se confirma, se arregla en una versión nueva. El aviso se publica después del arreglo y, si quieres, con tu nombre.

## Qué protege hoy la app

- **Tus datos se quedan en tu computador.** No hay cuentas ni servidores nuestros. La única conexión automática es la búsqueda de versiones nuevas: lee la lista pública de releases de GitHub y el `latest.json` y `novedades.json` de la versión nueva, y no envía datos de tu organización ni identificadores. Se cambia o se apaga en **Configuración › Actualizaciones**.
- **Las actualizaciones van firmadas.** La app instala un paquete solo si su firma coincide con la clave pública que trae dentro y si la firma cubre la versión anunciada. Nunca instala sin preguntar y no ofrece versiones más antiguas.
- **La interfaz está restringida.** Una política de seguridad de contenido permite solo los scripts y estilos de la propia app y bloquea cargar cualquier cosa desde internet. La interfaz no puede enviar rutas de archivos para los respaldos ni para las carpetas de datos. Con la base de datos solo puede leer y cambiar filas.
- **El texto de afuera no se da por seguro.** Las notas de versión y la ayuda se muestran con el HTML desactivado, y los enlaces se abren en tu navegador solo si son `http`, `https` o `mailto`.
- **Los archivos `.boldo` van cifrados** con XChaCha20-Poly1305 y una clave derivada de un código de un solo uso (Argon2id) que no se guarda en ninguna parte. Al importar, el contenido no se da por seguro aunque el código sea correcto: se abre de solo lectura y se compara con el esquema esperado antes de aplicar nada.
- **Instalada en Linux y macOS,** solo tu usuario puede abrir la carpeta de datos. En Windows, está dentro del `%APPDATA%` de tu usuario.
- **Cada versión publicada** trae `SHA256SUMS.txt` y la lista de sus componentes (SBOM, en formato CycloneDX). Las vulnerabilidades conocidas de las dependencias se revisan cada semana.

## Qué no protege hoy la app

- **La base de datos y los respaldos no están cifrados.** Quien pueda abrir tu cuenta de usuario, tu disco o tu pendrive puede leerlos. Usa cifrado de disco (BitLocker, FileVault, LUKS) y no dejes la carpeta en lugares compartidos.
- **La app no tiene inicio de sesión, usuarios ni permisos.** Quien pueda abrirla ve y cambia todo, y no queda registro de quién cambió qué.
- **La portable guarda sus datos junto al programa.** Esos datos están tan protegidos como la carpeta o el pendrive donde los pongas.
- **No defiende contra programas maliciosos ni contra quien tenga acceso a tu cuenta de usuario.** Ese programa podría leer o reemplazar los archivos, incluido el propio programa.
- **Los programas no van firmados con un certificado de Windows o de Apple,** así que el sistema puede avisar al abrirlos. Compruébalos con `SHA256SUMS.txt`, descargado de la página oficial de releases.
- **Las actualizaciones automáticas dependen de GitHub y de la clave de firma del autor.** La app no puede detectar una versión firmada con una clave robada.

BoldoAtlas no afirma cumplir ninguna ley. Tratar los datos personales de los trabajadores conforme a la ley es responsabilidad de quien la usa.
