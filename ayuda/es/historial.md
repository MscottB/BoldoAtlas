# Historial de cambios

::: info En resumen
**Historial** muestra cada cambio que hiciste, del más nuevo al más antiguo. Desde ahí puedes deshacer o rehacer un cambio suelto, o volver a un punto anterior.
:::

Abre **Historial** en el menú lateral, justo debajo de **Revisión**. Los cambios se agrupan por día. Cada uno dice la hora, qué hiciste («Renombraste Ventas a Norte») y cuántos elementos tocó. La lista se carga por partes a medida que bajas.

- La línea **Estás aquí** marca hasta dónde llega lo hecho.
- Lo deshecho se ve atenuado y marcado **Deshecha**, también un cambio antiguo que deshiciste solo.

## Ver un cambio

Pulsa un cambio para abrirlo. Verás cada elemento que tocó y, campo por campo, cómo estaba antes y cómo quedó después. Debajo hay tres botones:

- **Ir a**: abre la unidad o el puesto en el árbol, o la ficha de la persona. No aparece si eso ya no existe.
- **Deshacer esta acción**, o **Rehacer esta acción** si está deshecha.
- **Volver a este punto**.

## Deshacer o rehacer un cambio suelto

Pulsa **Deshacer esta acción** para deshacer solo ese cambio, aunque sea antiguo. Si un cambio posterior tocó lo mismo, no se puede deshacer uno sin el otro: un aviso nombra esos cambios y ofrece **Deshacer las N juntas**, que los deshace todos en un solo paso. **Cancelar** no cambia nada.

**Rehacer esta acción** funciona igual con un cambio deshecho, y si hace falta ofrece **Rehacer las N juntas**.

Algunos cambios no se pueden deshacer, y lo dicen debajo de su frase:

- un **borrado definitivo** de una persona;
- un cambio que tocó a una persona que después se borró definitivamente, porque ya no quedan sus datos.

## Volver a un punto

**Volver a este punto** deshace, en un solo paso, todos los cambios hechos después del que elegiste. Antes te dice cuántos son. Los cambios deshechos quedan en la lista y puedes rehacerlos desde aquí. Solo aparece en un cambio que está hecho.

`Ctrl` + `Z` y `Ctrl` + `Y` siguen deshaciendo y rehaciendo el último cambio, en cualquier vista. Más en [Atajos de teclado](atajos.md).

## Buscar y filtrar

- **Buscar por nombre** muestra los cambios que tocaron algo con ese nombre, por ejemplo «Ventas». No distingue mayúsculas ni tildes.
- **Desde** y **Hasta** limitan la lista a esos días.

En la ficha de una unidad, de un puesto o de una persona, **Ver historial** abre esta vista solo con los cambios de ese elemento. **Ver todo** quita ese filtro.

## Exportar a Excel

**Exportar esta lista a Excel**, arriba a la derecha, guarda todos los cambios que cumplen la búsqueda y los filtros: la fecha y hora, la frase, si está hecho o deshecho y cuántos elementos tocó. Antes de guardar hay que aceptar un aviso, porque el archivo no va cifrado; el detalle está en [Exportar a Excel](directorio.md#exportar-a-excel).

## Cuánto se guarda

Los cambios se guardan el plazo que elijas en **Configuración › Historial de cambios** (1 año si no lo cambias). Lo más antiguo se borra al abrir la organización. Los respaldos llevan el historial; los archivos `.boldo` no.

Si miras el organigrama a una fecha, o ves otra organización al lado, el historial se puede mirar y abrir, pero no aparecen los botones.

**Ver también:** [Atajos de teclado](atajos.md) · [Fichas de personas](fichas.md) · [Respaldos](respaldos.md).
