# Cómo colaborar con BoldoAtlas

[English](CONTRIBUTING.md) · **Español**

Gracias por tu interés. Puedes escribir en español o en inglés.

## Reportar un error o proponer una idea

Abre un [issue](https://github.com/MscottB/BoldoAtlas/issues). En **Acerca de**, dentro de la app, el botón **Copiar información** deja listos la versión y los datos técnicos para pegarlos. No incluyas datos reales de personas ni de tu organización.

## Enviar código

1. Para cambios grandes, abre primero un issue y así evitamos trabajo que no se pueda fusionar.
2. Compila y prueba con los comandos de la sección de desarrollo del [README](README.es.md). Antes de abrir el PR, corre `npm run test` y `cargo test --manifest-path src-tauri/Cargo.toml`.
3. Abre el PR, completa la plantilla y marca la casilla de aceptación del CLA. Sin ella, el PR no se fusiona.

## Versiones y releases

Cada PR fusionado a `main` es una versión. Mientras dure la alpha, al fusionar se crea la etiqueta siguiente (`v0.1.0-alpha.N+1`) y se publica la prerelease con la sección **Notas de la versión** de cada PR fusionado desde el release anterior (si falta, su título). Los cambios que solo tocan documentación o CI no publican: salen en el siguiente release. Los labels `version:parche`, `version:menor` y `version:mayor` publican en cambio una versión X.Y.Z normal. Cada PR dice en un comentario con qué versión saldrá, y su portable de prueba (artefacto de `build-prueba`) lleva esa versión con el número del PR, p. ej. `0.1.0-alpha.3+pr4`. Los PR compilan la portable de Windows; las de Linux y macOS se piden con la etiqueta `build-todas` en el PR o con **Run workflow** en `build-prueba`. Cada release publica los tres sistemas. También se puede publicar a mano empujando una etiqueta: `git tag v1.2.0 && git push origin v1.2.0`.

## Acuerdo de licencia para colaboradores (CLA), versión 1

BoldoAtlas se publica bajo [AGPL-3.0](LICENSE). Este acuerdo permite además que su autor lo ofrezca bajo otras licencias, incluidas licencias comerciales o una versión de pago de código cerrado. Por eso te lo pedimos antes de aceptar tu aporte.

«Aporte» es todo lo que envías a este repositorio para que se incluya en BoldoAtlas: código, documentación, traducciones o imágenes. «Autor» es Michael Jim Scott Bravo.

Al marcar la casilla del PR, aceptas lo siguiente para ese aporte y para los que envíes después:

1. **Tus derechos.** Sigues siendo titular de tu aporte y puedes usarlo como quieras.
2. **Licencia de derechos de autor.** Le das al Autor, y a quienes el Autor autorice, una licencia mundial, perpetua, irrevocable, gratuita y no exclusiva para usar, copiar, modificar, distribuir y sublicenciar tu aporte, y para publicarlo bajo cualquier licencia, incluidas licencias comerciales y de código cerrado.
3. **Licencia de patentes.** Si tienes patentes que tu aporte infringiría por sí solo o combinado con BoldoAtlas, das la misma licencia sobre ellas, solo para ese aporte.
4. **Lo que aseguras.** El aporte es tuyo o tienes derecho a enviarlo en estos términos. Si tu empleador o un cliente pudiera tener derechos sobre él, cuentas con su permiso.
5. **Contenido de terceros.** Si incluye código o material de otros, lo indicas en el PR con su origen y licencia, y esa licencia debe ser compatible con estos términos.
6. **Inteligencia artificial.** Si una herramienta de IA generó una parte relevante, lo indicas en el PR. Igual respondes por lo que aseguras en los puntos 4 y 5.
7. **Sin obligaciones ni garantías.** El Autor no está obligado a fusionar tu aporte ni a pagar por él. Tú lo entregas «tal cual», sin garantías.

La versión pública que incluya tu aporte queda disponible bajo AGPL-3.0: este acuerdo no le quita ese derecho a nadie. Si esta versión y la versión en inglés difieren, prevalece esta.
