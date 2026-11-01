# Fichas de personas

::: info En resumen
La ficha guarda los datos de una persona: contacto, contrato, sede, jornada, foto y notas. Se guarda sola, campo por campo.
:::

La ficha es el formulario de una persona: sus datos de contacto, contrato, sede, jornada, foto y notas. Se abre desde el **Directorio**, desde **Revisión**, desde la paleta de comandos (`Ctrl+K`, buscando a la persona) o desde el diálogo de un puesto, pulsando el nombre de quien lo ocupa. Al cerrarla, el foco vuelve a donde estabas; si ese lugar ya no existe, al botón **Buscar** de la barra superior.

El cargo y la unidad no se editan en la ficha: son del **puesto** que la persona ocupa (como titular o como reemplazo). Una vacante es un puesto sin titular.

A la vista están el nombre, el correo, el teléfono, las unidades que encabeza y sus puestos. **Tipo de contrato**, **sede**, **jornada**, **notas** y **foto** están en **Más datos**: se abre solo si la persona ya tiene alguno de esos datos o hay un error ahí; si no, con un clic, y queda como lo dejes.

![Ficha de persona con nombre, correo, teléfono, puestos y el bloque Más datos abierto.](../img/es/fichas-ficha.webp "La ficha de una persona. 1: Más datos, con contrato, sede, jornada, notas y foto. 2: los puestos de la persona. 3: ver a la persona en el organigrama."){width=732 height=744}

## Listas de valores

**Tipo de contrato**, **Sede** y **Jornada** se eligen de listas, para que los datos queden ordenados y sin duplicados.

Para elegir o agregar un tipo de contrato:

1. Abre **Más datos** y pulsa el campo **Tipo de contrato**.
2. Escribe en el cuadro de búsqueda para filtrar la lista.
3. Elige el valor; si no existe, pulsa **Agregar «texto» a la lista**.

- Escribe en el cuadro de búsqueda para filtrar la lista.
- Si el valor no existe, aparece **Agregar «texto» a la lista**: lo crea y lo deja elegido.
- Si ya existe uno igual (sin importar mayúsculas ni tildes), no se ofrece agregarlo: elige el que aparece en la lista.
- Si un valor fue desactivado en la lista pero la ficha lo usa, se sigue mostrando con la marca **(inactivo)**. **Sin valor** deja el campo vacío.

![Lista de tipos de contrato con el texto Temporal escrito y la opción Agregar «Temporal» a la lista.](../img/es/fichas-valores.webp "Al escribir un valor que no existe, la lista ofrece agregarlo."){width=342 height=166}

## Guardado

No hay botón Guardar: cada campo se guarda al salir de él, siempre que ese campo sea válido. Si uno no es válido, el motivo aparece bajo el campo y ese campo no se guarda hasta corregirlo; los demás sí se guardan. Una ficha nueva se crea cuando tiene nombre, que es obligatorio; hasta entonces se muestra que falta.

::: warning Importante
Si cierras la ficha con cambios sin guardar (un campo inválido o una ficha nueva sin crear), aparece **Hay cambios sin guardar**: **Seguir editando** vuelve a la ficha y **Descartar** la cierra y pierde esos cambios.
:::

- El **correo** debe tener forma de dirección (por ejemplo, ana@empresa.cl) y no puede repetirse entre personas.
- La **foto** es opcional: PNG, JPG o WebP de hasta 1 MB.

## Jefatura

**Unidades que encabeza** lista las unidades de las que es jefe: ocupa el puesto de jefatura como titular o, si ese puesto no tiene titular, como reemplazo.

## Puestos

En **Puestos** se ven los puestos vigentes de la persona (cargo, unidad, si es titular o reemplazo y desde cuándo) y, en **Historial**, los que ya terminaron. Pulsa uno para abrir el puesto. **Ver en el organigrama** cierra la ficha y muestra a la persona en el árbol (con varios puestos, eliges cuál).

## Eliminar

**Eliminar** cierra la ficha y muestra un aviso con **Deshacer** durante 8 segundos.

**Ver también:** [Puestos y reemplazos](puestos.md) · [Directorio](directorio.md) · [Configuración y mantenedores](mantenedores.md).
