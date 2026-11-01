# Exportar e importar

::: info En resumen
Para llevar tu organización, o solo una parte, a otro computador: **Exportar** la guarda en un archivo `.boldo` protegido con un código, e **Importar** abre ese archivo en el otro lado. Aquí ves cómo hacerlo sin pisar los datos que ya tienes.
:::

Ambas acciones están en **Importar/Exportar**, en la barra lateral, y en el menú de la app. Para abrir un archivo también puedes usar **Abrir un archivo .boldo** en la Bienvenida.

## Exportar

1. Pulsa **Exportar** y elige qué llevar: **Toda la base**, o **Uno o más árboles o ramas**. Si marcas una unidad, va toda su rama.
2. Pulsa **Continuar**. Verás qué lleva el archivo y qué queda fuera.
3. Pulsa **Guardar como…** y elige dónde guardarlo.
4. Copia el código con **Copiar código**.

![Exportar con la opción Uno o más árboles o ramas y la lista de unidades con una rama marcada.](../img/es/exportar-alcance.webp "Exportar: marcar una unidad incluye toda su rama."){width=768 height=414}

Una rama lleva sus unidades, sus puestos con quienes los ocupan o los ocuparon, los valores de mantenedor que usan, sus etiquetas, sus ramas y vistas guardadas, y sus procesos. Lo eliminado no va. Lo que apunta fuera de la rama se corta y se te avisa antes de guardar: las conexiones con una unidad que no va, una jefatura cuyo puesto no va y los roles de personas que no van.

::: warning Importante
El código se muestra una sola vez y no se guarda en ninguna parte. Si se pierde, el archivo no se puede abrir: hay que exportar de nuevo, y eso da otro archivo y otro código. El archivo lleva datos personales: envía el archivo y el código **por canales distintos**, por ejemplo el archivo por correo y el código por teléfono.
:::

## Importar

1. Pulsa **Importar** y luego **Elegir archivo…**.
2. Escribe el código y pulsa **Abrir**. No importan las mayúsculas ni los guiones.
3. Revisa lo que trae: cuánto hay en el archivo, cuánto es nuevo y cuánto ya existe. Hasta aquí no se cambió nada, y **Cancelar** no deja rastro.
4. Elige qué hacer y pulsa **Aplicar**.

![Importar: lo que trae el archivo en una tabla, las opciones Agregar lo nuevo y Reemplazar todo, y dónde colocar la rama.](../img/es/importar-revision.webp "Importar: revisas lo que trae antes de aplicar nada."){width=768 height=794}

Si el código no corresponde o el archivo se alteró, verás el mismo aviso: «El código no es correcto o el archivo está dañado». Tu base no se toca.

### Agregar lo nuevo

Lo que no existe en tu base entra tal cual. Lo que ya existe se queda como está, aunque en el archivo sea distinto: al final ves cuántos se omitieron y cuáles, en una lista que se abre con un clic.

| Si en el archivo viene… | Qué pasa |
|---|---|
| Un registro que ya tienes (el mismo, aunque se haya editado) | Se queda el tuyo |
| Un valor de mantenedor con el mismo nombre que uno tuyo | Se une al tuyo: no se duplica |
| Una persona con el mismo correo que una tuya | No se duplica: lo que venía con ella queda con la tuya |
| Algo que apunta a lo que eliminaste en tu base | Queda vacía esa referencia o, si es obligatoria, no entra. Se avisa |
| Algo que choca con una regla de tu base, como un segundo titular en un puesto | No entra. Se avisa |

Si importas una rama cuya unidad superior está en tu base, vuelve a quedar dentro de ella. Si no está, se te pregunta dónde colocarla: **dentro de una unidad** o **como árbol independiente**.

### Reemplazar todo

Tus datos actuales se cambian por los del archivo y la app se reinicia. Solo se puede con un archivo de **toda la base**: con una parte borrarías el resto. Se pide confirmar.

::: tip Consejo
Antes de aplicar cualquiera de los dos, BoldoAtlas hace un respaldo marcado **Antes de reemplazar**. Si te arrepientes, restáuralo desde [Respaldos](respaldos.md). Si algo falla al aplicar, no se escribe nada.
:::

## Versiones distintas

- Un archivo hecho con una versión anterior de BoldoAtlas se actualiza al abrirlo, sin tocar tu base.
- Uno hecho con una versión **más nueva** no se abre hasta que actualices BoldoAtlas.
- Un archivo solo se acepta si es una copia válida de BoldoAtlas, aunque el código sea correcto: por eso es seguro abrir uno que te envió otra persona.

**Ver también:** [Respaldos](respaldos.md) · [Mantenedores](mantenedores.md).
