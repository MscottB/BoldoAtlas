# Organizaciones

::: info En resumen
Puedes tener varias organizaciones en BoldoAtlas y pasar de una a otra con sus pestañas. Cada una guarda aparte sus datos, fotos, respaldos y preferencias: nada de una llega a otra.
:::

Una organización es un archivo de base de datos con su organigrama, sus personas y sus listas. Sirve para llevar clientes distintos, las empresas de un grupo o una copia de prueba junto a la real, sin que se mezclen.

## Crear, abrir un archivo o explorar el ejemplo

En **Inicio**, bajo **Crear o abrir otra organización**, están siempre a la vista:

- **Crear organización:** te pide el nombre de la organización y el de su unidad raíz, y la abre en una pestaña nueva, en el árbol.
- **Abrir archivo…:** elige un archivo `.db` de BoldoAtlas que está en otra carpeta o en un pendrive. Antes de abrirlo se revisa que sea una organización válida. Queda en tu lista y se trabaja en él donde está (ver [Archivos externos](organizaciones.md#archivos-externos)).
- **Explorar el ejemplo:** crea una organización de muestra, en el idioma de la interfaz, y la abre. Si el ejemplo ya está en tu lista, lo abre en vez de crear otro.

Ninguna de las tres toca la organización que tenías abierta: sigue en tu lista como estaba. **Nueva organización vacía…** y **Explorar el ejemplo…**, en el menú de la app, hacen lo mismo. Para traer un archivo `.boldo` como organización aparte, ver [Exportar e importar](exportar-importar.md).

## Abrir y cambiar

- **Inicio › Abierto recientemente** muestra hasta 8 organizaciones, la última que abriste primero, con su logo o su inicial en un recuadro de su color, la marca **Abierta** en la que tienes abierta y hace cuánto la abriste. Aparece cuando hay más de una. Un clic la abre.
- **Abrir otra organización…**, en el menú de la app, y **Abrir otra organización: …**, en la paleta de comandos (`Ctrl+K`), ofrecen las demás de **Abierto recientemente**.

Al abrir una organización, BoldoAtlas pasa a una de sus pestañas o, si no tiene ninguna, abre una nueva en su árbol. Mientras cambia se ve **Abriendo la organización…** en lugar de la vista. Si tienes una ficha con cambios sin aplicar, pregunta antes, y si hay un trabajo en curso, como exportar o un respaldo que pediste, no cambia y te pide esperar a que termine. Si es el respaldo automático, lo espera con **Abriendo la organización…** a la vista.

Cuando las pestañas abiertas son de más de una organización, cada pestaña muestra el punto de color de la suya y su nombre antes del título, por ejemplo «Compañía Demo · Árbol». Pasar a una pestaña de otra organización la abre. Solo la organización de la pestaña activa está cargada, y entre todas puedes tener hasta 12 pestañas abiertas. La barra superior muestra el nombre y el color de la organización abierta.

::: tip Consejo
Para trabajar en dos organizaciones a la vez, deja una pestaña de cada una y pasa de una a otra con `Ctrl` + `Tab`.
:::

## Comparar

Comparar muestra qué unidades, personas y puestos están solo en una de dos organizaciones o tienen datos distintos. Siempre se compara con la organización abierta:

- En **Inicio › Abierto recientemente**, abre el menú **⋮** de otra organización y pulsa **Comparar con la abierta**.
- En la paleta de comandos (`Ctrl+K`), elige **Comparar con «nombre»**.

Arriba, una tabla con **Unidades**, **Personas** y **Puestos** dice cuántas están solo en una, solo en la otra o **Difieren**. Pulsa un número para ver esas filas en la lista de abajo, de 50 en 50; **Ver todas** vuelve a la lista completa. Pulsa una fila para ver su detalle, con los datos de cada lado.

- Una persona que ocupa otro puesto vigente cuenta como distinta.
- Algo borrado en una y vigente en la otra cuenta como solo en la que lo tiene vigente.

La otra organización no se modifica: BoldoAtlas la copia a un archivo temporal y compara con esa copia. Hay una sola comparación a la vez: comparar de nuevo, cambiar de organización o salir de la vista la suelta. Si cambias de organización y vuelves a esa pestaña, se compara de nuevo. **Comparar de nuevo** también está siempre a mano para refrescar la comparación, por ejemplo después de editar.

### Coincidencia aproximada

Si una organización no viene de la otra, por ejemplo porque se crearon por separado, se emparejan por lo que tienen en común: las unidades por su nombre y el de las unidades sobre ellas, las personas por su correo, y los puestos por su unidad y su nombre. El aviso **Coincidencia aproximada** lo dice, junto con cuántas personas no tienen correo.

Las personas sin correo, o con un correo que se repite, no se emparejan: cuentan como solo en su organización.

## Qué se guarda aparte

Cada organización tiene su propio archivo, con sus fotos y su logo, y sus propios respaldos. Las preferencias de sus vistas también son suyas: el estado del árbol, los filtros y columnas del Directorio, cómo se ven las personas en el panel de una unidad y el minimapa. El tema, el idioma, el color de acento, el tamaño de la interfaz, la frecuencia de los respaldos y de las actualizaciones, la barra lateral y lo que pasa al cerrar valen para todas tus organizaciones.

| Qué | Dónde, dentro de la carpeta de datos |
|---|---|
| La organización que ya tenías, o la primera que creas | `boldo.db`, con sus respaldos en `respaldos/` |
| Una organización creada, importada o restaurada después | `organizaciones/<id>/organizacion.db`, con sus respaldos en `organizaciones/<id>/respaldos/` |
| Un archivo externo | Donde está; sus respaldos, en `organizaciones/<id>/respaldos/` |
| Las copias guardadas al eliminar | `organizaciones-eliminadas/` |

La carpeta de datos es la de [Dónde quedan tus datos](inicio.md#donde-quedan-tus-datos). **Datos del proyecto** muestra la ruta del archivo de la organización abierta, y su **Abrir carpeta** abre la carpeta donde está.

El respaldo automático se hace para la organización abierta. Con la frecuencia **Cada vez**, cuenta solo la primera vez que abres cada organización en la sesión: volver a su pestaña no respalda de nuevo. Al abrir BoldoAtlas se abre la última organización que usaste.

## Archivos externos

Un archivo abierto con **Abrir archivo…** se queda en su lugar y BoldoAtlas escribe en él. Mientras está abierto, junto a él aparecen archivos auxiliares, como `-wal`, `-shm` y `.bloqueo`: mantenlos con el archivo.

- **Carpeta de red:** BoldoAtlas no trabaja directo en ella, porque otro equipo podría dañar el archivo. Pregunta si copiarlo a este computador y, con **Copiar y abrir**, abre la copia.
- **Portable:** si el archivo está fuera de la carpeta de BoldoAtlas portable, avisa que no irá con ella cuando la lleves a otro equipo.
- **Más de 512 MiB:** pregunta antes, porque puede tardar en abrir y ocupar más memoria; **Abrir igual** sigue.
- **Una copia de otra de tu lista:** se abre como una organización aparte, y un aviso lo dice.
- **Si deja de estar** (un pendrive desconectado): en **Abierto recientemente** dice «No se encuentra su archivo.» y ofrece **Buscar archivo** y **Quitar de la lista**. Si el archivo que eliges tiene otros datos, pregunta si usarlo en su lugar.
- **Con una transacción sin terminar** (un archivo `-journal` a su lado): un archivo nuevo no se abre; mantén los dos juntos. Si es una organización de tu lista y la buscas con **Buscar archivo**, pregunta antes de recuperarla, porque eso cambia el archivo.

::: warning Importante
Abrir un archivo de otra persona trae los mismos riesgos que importar uno: ábrelo solo si confías en quien lo envió.
:::

## Quitar y eliminar

**Quitar de la lista** no borra nada: el archivo se queda donde está y puedes volver a agregarlo abriéndolo. Sus pestañas dirán que ya no está. La organización abierta no se puede quitar: pasa antes a otra.

**Eliminar organización** borra del disco su archivo y sus respaldos. Está en el menú **⋮** de cada entrada de **Abierto recientemente** y en **Configuración › Organizaciones**:

1. Pulsa **Eliminar organización**, en Inicio, o **Eliminar**, en Configuración.
2. Lee qué se borra y cuánto espacio libera. **Guardar una copia antes** viene marcada: deja una copia de la base, sin los respaldos, en **Copias de organizaciones eliminadas**. En un archivo externo solo aparece si marcas **Borrar también el archivo**.
3. Escribe el nombre de la organización para confirmar y pulsa **Eliminar**.

Sus pestañas se cierran. Si era la abierta, antes se pasa a otra y se vuelve a Inicio; si no queda ninguna, se empieza con una vacía. De un archivo externo, por defecto solo sale de la lista y se borran sus respaldos: el archivo no se toca. Para borrarlo también, marca **Borrar también el archivo**, que muestra su ruta.

::: warning Importante
Eliminar no se puede deshacer. Sin **Guardar una copia antes**, lo que se borra no se puede recuperar.
:::

**Configuración › Organizaciones** muestra todas, con su ruta y el espacio que ocupan su base y sus respaldos. Ahí cambias el color de cada una, la quitas de la lista o la eliminas. En **Copias de organizaciones eliminadas**, cada copia ofrece **Restaurar como organización nueva** y **Borrar**.

## Si una organización no abre

La pestaña muestra «No se pudo abrir esta organización», el motivo y un detalle que puedes copiar al pedir ayuda. Las demás pestañas no se tocan, y el archivo no se cambia.

| Motivo | Qué hacer |
|---|---|
| No se encuentra el archivo | Conecta la unidad donde está, o pulsa **Buscar archivo** |
| Otra copia de BoldoAtlas la tiene abierta | Ciérrala y pulsa **Reintentar** |
| Otro programa está usando el archivo | Ciérralo y pulsa **Reintentar** |
| Se guardó con una versión más nueva de BoldoAtlas | Pulsa **Buscar actualizaciones** y actualiza |
| El archivo está dañado o no es de BoldoAtlas | No se abre |

**Cerrar pestaña** la cierra. Si la que no abre es la última que usaste, al abrir BoldoAtlas se abre otra organización en su lugar y un aviso lo dice.

**Ver también:** [Inicio](inicio.md) · [Pestañas de trabajo](pestanas.md) · [Respaldos](respaldos.md) · [Exportar e importar](exportar-importar.md).
