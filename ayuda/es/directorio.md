# Directorio

::: info En resumen
El Directorio es una tabla con todas las personas y puestos de la organización: sirve para buscar, filtrar, ordenar y abrir la ficha de cada uno.
:::

El Directorio es una tabla con todos los puestos y todas las personas de la organización. Sirve para buscar, filtrar y comparar sin recorrer el árbol. Con **Árbol**, arriba, muestra lo mismo como un esquema de quién depende de quién (ver «Lista o árbol»).

## Qué muestra cada fila

- **Un puesto**: con el nombre de su titular vigente o **Vacante** si no tiene. Si el puesto tiene un reemplazo vigente, aparece en la columna **Reemplazo** (se activa en **Columnas**).
- **Una persona sin puesto vigente**: con «Sin puesto» en la columna Cargo.

Una persona con dos puestos aparece en dos filas. Quien solo es reemplazo aparece en la fila del puesto que reemplaza.

Hay una columna por cada tipo de unidad que usas (por ejemplo Gerencia, Área, Subárea): muestra la unidad más cercana de ese tipo hacia arriba, incluida la propia unidad del puesto. A la vista están **Persona**, **Cargo**, **Gerencia**, **Área** y **Correo** (si no usas Gerencia ni Área, el primer tipo en uso). El botón **Columnas** muestra u oculta las demás: **Reemplazo**, los otros tipos de unidad, **Tipo de contrato**, **Sede** y **Jornada**. Lo que elijas se recuerda en este computador, para cada organización.

![El Directorio con el cuadro de búsqueda, el filtro de unidad, los botones Filtros y Columnas y las primeras filas de la tabla.](../img/es/directorio-tabla.webp "El Directorio. 1: búsqueda. 2: filtro por unidad. 3: Filtros. 4: Columnas. 5: ícono para ver a la persona en el organigrama."){width=884 height=290}

## Buscar y filtrar

Para encontrar a una persona:

1. Escribe parte de su nombre, cargo o correo en el cuadro de búsqueda.
2. Pulsa su fila para abrir su ficha.
3. Si quieres verla en el organigrama, pulsa el ícono de ubicar que está junto a su nombre.

- El cuadro de búsqueda busca en el nombre de la persona y del reemplazo, el cargo y el correo del titular, sin distinguir mayúsculas ni tildes («munoz» encuentra «Muñoz»).
- **Unidad** incluye toda su rama. **Ver en el directorio**, en la pestaña Personas del panel de una unidad, abre el directorio con solo ese filtro. El botón **Filtros** reúne los demás y muestra cuántos están activos; **Quitar estos filtros**, dentro de él, vacía solo esos. **Cargo**, **tipo de contrato**, **sede** y **jornada** filtran por valor exacto (también los desactivados); contrato, sede y jornada son los del titular, así que una vacante no los cumple. **Etiqueta** usa las etiquetas de la unidad del puesto. **Estado** separa ocupados, vacantes y personas sin puesto.
- **Limpiar todo**, junto a los filtros, los quita todos (también el texto y la unidad). Los filtros y el orden se recuerdan en este computador, para cada organización.

![Panel Filtros con Cargo, Tipo de contrato, Sede, Jornada, Etiqueta y Estado.](../img/es/directorio-filtros.webp "El panel Filtros: cada lista deja ver solo lo que coincide."){width=316 height=520}

::: tip Consejo
`Ctrl` + clic sobre una persona abre su ficha en una pestaña nueva, y así no pierdes los filtros de esta.
:::

## Ordenar y abrir

Pulsa el encabezado de **Persona**, **Cargo** o de la primera columna de unidad a la vista (ordena por la ruta completa) para ordenar; pulsa otra vez para invertir. Las celdas vacías siempre quedan al final.

Pulsa una fila (o Tab hasta el nombre y Enter) para abrir la ficha de la persona; en una vacante se abre el puesto. El ícono de ubicar, junto al nombre, muestra ese puesto en el organigrama (`Ctrl` + clic: en una pestaña nueva); al pasar el mouse o llegar a él con Tab dice a quién muestra («Ver a … en el organigrama»). En una persona sin puesto vigente queda deshabilitado.

## Lista o árbol

**Lista** y **Árbol**, junto al título, cambian cómo se ve el Directorio; la elección se recuerda en este computador, para cada organización. El **árbol** muestra quién depende de quién: parte de la raíz de la organización (o de cada raíz, si hay varias) o, con **Unidad** elegida, de esa unidad.

- Cada unidad muestra su nombre, su tipo, su jefatura (foto o iniciales, nombre y cargo) y cuántas personas tiene su rama (los titulares, la misma cifra de la tarjeta). Debajo van sus demás personas, con foto y cargo (los reemplazos, marcados), sus puestos sin nadie como **Vacante** y luego sus subunidades. Una persona con dos puestos aparece dos veces, una en cada puesto; las personas sin puesto vigente no aparecen en el árbol (si los filtros solo dejan personas así, el árbol lo dice). Junto al título, el árbol cuenta sus personas y vacantes.
- Al abrirlo se ve el primer nivel bajo la raíz. Pulsa una unidad (o su flecha) para abrirla o cerrarla. Los botones con números, a la derecha de los filtros, dejan ver las unidades hasta ese nivel, como en el lienzo: hay uno por cada nivel que tiene la organización; si son muchos, **−** y **+** bajan o suben de a uno. El del nivel que se ve queda marcado, también si abres o cierras unidades a mano. **Todo** abre todas las unidades.
- La búsqueda y los filtros dejan los mismos puestos que la lista, con la cadena de unidades hasta ellos ya abierta, y resaltan el texto encontrado.
- Pulsa una persona, o el nombre de una jefatura, para abrir su ficha, y una vacante para abrir su puesto, como en la lista; `Ctrl` + clic o clic central sobre una persona la abre en una pestaña nueva. El ícono de ubicar, al final de la fila, la muestra en el organigrama.
- Con el teclado, `↑` y `↓` recorren las filas, `→` abre una unidad o entra en ella, `←` la cierra o sube a su superior, `Inicio` y `Fin` van a la primera y a la última. `Enter` hace lo mismo que pulsar la fila, `Mayús+Enter` abre la ficha de la jefatura de la unidad y `Tab` lleva al ícono de ubicar de la fila.

**Ver también:** [Fichas de personas](fichas.md) · [Pestañas de trabajo](pestanas.md).
