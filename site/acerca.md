---
title: Acerca de
description: Autor, licencia, repositorio, cómo colaborar y preguntas frecuentes sobre BoldoAtlas.
---

# Acerca de

BoldoAtlas es una app de escritorio local y portable para armar organigramas grandes y llevar la ficha de las personas que trabajan en ellos.

- **Creado por:** Michael Jim Scott Bravo.
- **Licencia:** [AGPL-3.0](https://github.com/MscottB/BoldoAtlas/blob/main/LICENSE).
- **Código:** [github.com/MscottB/BoldoAtlas](https://github.com/MscottB/BoldoAtlas).
- **Hecha con:** Tauri 2 y Vue 3.

## Cómo colaborar

¿Encontraste un error o tienes una idea? Abre un [issue](https://github.com/MscottB/BoldoAtlas/issues) en GitHub. En **Acerca de**, dentro de la app, el botón **Copiar información** deja listos la versión y los datos técnicos para pegarlos en el reporte.

Para enviar código, revisa la [guía para colaborar](https://github.com/MscottB/BoldoAtlas/blob/main/CONTRIBUTING.es.md), que incluye el acuerdo de licencia (CLA).

## Privacidad

Todo se guarda en tu computador. BoldoAtlas no necesita internet para funcionar y no tiene cuentas. Qué protege la app, su única conexión automática y cómo reportar un problema están en [Seguridad y privacidad](/seguridad).

## Preguntas frecuentes {#preguntas}

### ¿Cuánto cuesta?

Nada. BoldoAtlas es software libre bajo la licencia AGPL-3.0: no hay planes ni suscripciones.

### ¿Dónde quedan mis datos?

En tu computador, en una base SQLite por organización: en la carpeta `datos/`, junto al programa, si usas la portable, o en la carpeta de tu usuario si lo instalas; un archivo que abras desde otra carpeta se queda donde está. BoldoAtlas no necesita internet para funcionar y no envía tus datos a ninguna parte.

### ¿Cómo se junta el trabajo de dos copias?

Una persona exporta un archivo `.boldo` y la otra lo importa con Revisar y decidir: compara los dos lados y elige qué se queda. [Revisar y decidir →](/manual/exportar-importar#revisar-y-decidir)

### ¿En qué sistemas funciona?

Windows 10 y 11 (x64), Linux x64 y macOS 11 o más nuevo, en Intel y Apple Silicon. La primera vez, tu sistema puede pedir que confirmes que quieres abrirlo. [Cómo abrirlo →](/descargas#sin-firma)

### ¿Cómo se actualiza?

BoldoAtlas busca versiones nuevas al abrirse y cada día (puedes cambiar la frecuencia o apagarlo) y te avisa; nunca descarga ni instala nada sin que lo confirmes. En la portable reemplaza el programa dentro de su carpeta y `datos/` no se toca. Si la versión nueva cambia la base, antes hace un respaldo. [Cómo actualizar →](/descargas#como-actualizar)

### ¿Sirve para organizaciones grandes?

Sí, está pensada para eso. Se probó con 2.000 unidades, 3.000 puestos y 10.000 personas: las ramas se pliegan, el directorio dibuja solo las filas a la vista y las fotos se cargan cuando aparecen. Con más de 300 tarjetas a la vista, el lienzo las simplifica al alejarte para seguir moviéndose con fluidez.

### ¿Es una versión final?

No: es una versión de prueba. Si algo falla, cuéntalo en GitHub. [Avisar de un problema →](https://github.com/MscottB/BoldoAtlas/issues)
