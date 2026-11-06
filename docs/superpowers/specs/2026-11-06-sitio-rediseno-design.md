# Rediseño del sitio web: diseño

**Estado:** aprobado por el autor en la conversación del 2026-11-06, a la espera de su revisión de este documento.

## Por qué

El sitio (`site/`, VitePress) se ve como una sola landing con todo junto: la portada trae el por qué, las funciones, lo nuevo, la confianza, las preguntas y la descarga, y el menú mezcla anclas de esa portada con páginas sueltas. El manual comparte menú y aspecto con el producto.

## Lo que pidió el autor

- Ordenar mejor el menú y la estructura, y presentar las funciones con un enfoque de producto («más marketing»).
- Separar el manual del producto. Se decidió hacerlo dentro del mismo VitePress, que ya es una herramienta de documentación, en vez de usar otra herramienta (enfoque A).
- Público: todos por igual (recursos humanos, gerencia y pymes, TI que evalúa).
- La web debe lograr cuatro cosas: que la entiendan, que la prueben, que confíen y que encuentren ayuda.
- Rediseño completo del aspecto, con la identidad de hoy.
- Elegido en maquetas: el menú A («Producto ▾») y la portada 2 (texto y app lado a lado).

## Reglas que siguen igual

- Todo lo que se afirma es cierto hoy en el código.
- Sin «Próximamente», «por ahora», fases, funciones futuras ni números de versión. Nada de lo que le falta al producto. Nada que explique cómo está armada la página.
- Seguridad: «te ayuda a cumplir», nunca «cumple».
- Español e inglés con el mismo contenido. `site/novedades.json` acumula y nunca quita.
- Sin cookies, analítica ni rastreo.
- Las capturas son reales de la app; sin fotos de archivo ni ilustraciones inventadas.
- Accesibilidad: contraste AA, teclado, foco visible, textos alternativos y «reducir movimiento».

## Mapa del sitio

Las direcciones de hoy se mantienen. Las anclas viejas de la portada (`#por-que`, `#funciones`, `#confianza`, `#preguntas`, `#lo-nuevo`) siguen funcionando y llevan a su lugar nuevo.

| Página | Dirección | Contenido |
|---|---|---|
| Inicio | `/`, `/en/` | Portada 2: mensaje, garantías («Gratis», «Sin cuentas», «Windows · Linux · macOS») y captura a la derecha. Debajo, cuatro beneficios de una línea; tres funciones destacadas con captura; «Lo nuevo» con las 3 últimas novedades; franja de garantías; llamada a descargar. |
| Funciones | `/funciones`, `/en/funciones` (nueva) | Un bloque por función con captura, dos o tres puntos y enlace al manual: árbol y zonas; conexiones; varias organizaciones; puestos, fichas y vacantes; ver a una fecha; Revisión; directorio y búsqueda; exportar e importar; respaldos y portable; idiomas y sistemas. |
| Seguridad y privacidad | `/seguridad`, `/en/seguridad` (nueva) | Dónde quedan los datos; la única conexión automática y cómo apagarla; cifrado de los `.boldo`; los `.db` externos; verificar la descarga y abrir un programa sin firma; reportar un problema; «te ayuda a cumplir». En lenguaje simple, a partir de `SECURITY.md` y del bloque «Confianza» de hoy. |
| Comparar | `/comparar` | El mismo contenido, con el diseño nuevo. |
| Novedades | `/novedades` | El mismo contenido, con el diseño nuevo. |
| Descargas | `/descargas` | El mismo contenido, con el diseño nuevo. |
| Acerca de | `/acerca` | El contenido de hoy más las preguntas frecuentes, que salen de la portada. |
| Manual | `/manual/…` | El mismo contenido de `ayuda/`, sin cambios, con su propia cabecera. |

## Menú

- **Producto:** BoldoAtlas · «Producto ▾» (Funciones · Seguridad y privacidad · Comparar · Novedades) · Manual · Acerca de · ES/EN · GitHub · **[Descargar]**, este último destacado en cobre.
- **Manual:** «BoldoAtlas · Manual» · buscador · «Volver al sitio» · ES/EN, más el menú lateral de temas. No muestra los enlaces de producto.
- Sale la entrada «Por qué» del menú.
- En pantallas angostas el menú se pliega.

## Aspecto

- **Colores:** azul noche `#1e2a38` y cobre `#c8743f`, más un fondo claro y cálido `#f6f3ef` en las páginas de producto. Tema oscuro equivalente, con el mismo botón de hoy.
- **Tipografía:** la de hoy; títulos de 40 a 56 px en Inicio y cuerpo de 17 px en producto.
- **Piezas comunes de producto:**
  1. **Portada:** mensaje, garantías, botón Descargar y captura inclinada.
  2. **Bloque de función:** captura grande y texto, alternando lado.
  3. **Franja de garantías:** tres o cuatro íconos de trazo con una frase.
  4. **Llamada a descargar:** botón destacado y «ver el manual».
- **Movimiento:** solo transiciones al pasar el puntero, nada si el sistema pide reducir movimiento.
- **Celular:** una columna; la captura de la portada va debajo del texto.

## Construcción

- **Herramienta:** el mismo VitePress, sin dependencias nuevas.
- **Páginas de producto:** archivos `.md` con `layout: page` que usan las piezas `Portada.vue`, `BloqueFuncion.vue`, `Garantias.vue` y `LlamadaDescarga.vue`, en `site/.vitepress/theme/`.
- **Textos:** salen de los componentes a un archivo por página y por idioma, en `site/textos/`.
- **`Presentacion.vue`:** hoy tiene 1.324 líneas. Se reparte entre las piezas y lo que sobra se borra.
- **Menú:** el desplegable de VitePress para «Producto ▾» y un estilo propio para el botón Descargar.
- **Cabecera del manual:** cambia según la ruta, en el diseño de la página. El buscador queda acotado al manual.
- **Anclas viejas:** un pequeño script en el cliente lleva cada ancla vieja a su página nueva.
- **README:** la primera parte enlaza a las páginas nuevas.

## Comprobación

- Las pruebas de `site/scripts/` que ya existen.
- Pruebas nuevas sobre `site/textos/`:
  - es y en con las mismas claves;
  - nada de «Próximamente», «por ahora», versiones, «cumple» ni frases sobre cómo está armada la página;
  - cada enlace al manual apunta a un tema y un ancla existentes;
  - cada captura existe.
- `npm run build` del sitio.
- Cada página mirada en el navegador, en tema claro y oscuro y en ancho de celular, con un chequeo de accesibilidad.
- Capturas de cada página mostradas al autor antes de fusionar.

## Publicación

- Es un cambio solo del sitio y de documentación: al fusionar se publica la web y no se genera una versión nueva de la app.
- El título del PR empieza con `docs:`.

## Fuera de alcance

- Un diseño nuevo para el contenido del manual o para la Ayuda de la app.
- Un dominio propio.
- Formularios, analítica o boletines.
- Contenido que no exista hoy, como testimonios, clientes o precios.
