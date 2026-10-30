# El árbol

El árbol es la pantalla principal: muestra tu organización como un organigrama que puedes armar y reorganizar.

## Las tarjetas

Cada unidad es una tarjeta con:

- su tipo (por ejemplo, Gerencia o Área) y su nombre;
- la foto o las iniciales y el nombre de la jefatura (**Reemplazo: nombre** si su puesto solo tiene reemplazo), o **Sin jefatura** si no tiene;
- la dotación total de su rama (ella y todo lo que cuelga de ella);
- las vacantes de la rama, si hay;
- un punto de color por cada etiqueta (pasa el puntero por encima para ver su nombre).

Los tipos de unidad son una lista propia de tu organización: al comienzo trae Gerencia, Área, Subárea y Otra, que se pueden renombrar, reordenar, desactivar o complementar con otros (por ejemplo, Superintendencia o Departamento). El orden de la lista no limita la estructura: cualquier tipo puede depender de cualquier otro.

Las líneas continuas unen cada unidad con su superior. Las líneas punteadas son conexiones laterales entre unidades, con su descripción.

## Plegar y desplegar ramas

Al abrir el árbol se ven las raíces y su primer nivel; el resto está plegado. El botón de abajo a la derecha de una tarjeta muestra cuántas subunidades tiene ocultas (por ejemplo `+3`): púlsalo para desplegarlas y otra vez para plegarlas.

## Seleccionar, crear y renombrar

- **Clic** en una tarjeta la selecciona. Clic en el fondo quita la selección.
- En la tarjeta seleccionada aparece **+**: crea una subunidad con el tipo que sigue al de su superior en la lista de tipos (el último se repite) y la deja lista para escribir su nombre.
- Con la tarjeta seleccionada, **Puestos (n)** lista los puestos de la unidad y permite crear uno nuevo (ver «Puestos y reemplazos»).
- **Doble clic** sobre el nombre, o `F2` con el nombre enfocado, lo edita. `Enter` guarda y `Esc` cancela.
- **+ Nueva unidad**, en la barra del lienzo, crea una subunidad de la tarjeta seleccionada; si no hay ninguna seleccionada, de la raíz de la vista enfocada, o una raíz nueva del primer tipo de la lista.

## Mover una unidad

Arrastra una tarjeta y suéltala sobre otra: BoldoAtlas pregunta "¿Mover X dentro de Y?" antes de cambiar su superior. No se puede mover una unidad dentro de su propia rama: en ese caso aparece un aviso y nada cambia. Si sueltas la tarjeta en el vacío, vuelve a su lugar.

## Resaltar

En la barra del lienzo puedes resaltar por etiqueta, por texto (parte del nombre, sin importar tildes ni mayúsculas) o por ambos a la vez. Las unidades que no coinciden quedan atenuadas, pero no se ocultan.

El botón **Resaltar por…** suma más criterios: **Con vacantes**, **Sede**, **Tipo de contrato**, **Jornada** y **Cargo**. Una unidad se resalta cuando, en sus propios puestos (no en los de su rama), tiene una vacante, una persona titular vigente con esa sede, tipo de contrato o jornada, o un puesto con ese cargo. Si eliges varios criterios, deben cumplirse todos. El resaltado dura mientras la app está abierta; las vistas guardadas sí lo incluyen.

## Moverse por el lienzo

Arrastra el fondo para desplazarte y usa la rueda del mouse o los botones **−** y **+** para alejar o acercar. **Encuadrar** (`Ctrl` + `0`) ajusta todo el árbol a la ventana. El minimapa de la esquina muestra dónde estás.

## Abrir una rama como árbol

En la tarjeta seleccionada, el botón **Abrir como árbol** muestra solo esa unidad y lo que cuelga de ella. No es una copia: lo que cambies ahí cambia en el árbol completo. Arriba aparece la ruta de origen (cada tramo se puede pulsar para abrir ese nivel), **Subir un nivel** y **Ver en el árbol completo**, que vuelve a todo el árbol con esa unidad desplegada, seleccionada y al centro.

## Vista

El botón **Vista**, en la barra del lienzo, abre las opciones de cómo se dibuja el árbol. Se recuerdan en este computador.

- **Ver puestos** (apagado al comienzo): bajo cada unidad visible aparece una tarjeta por cada puesto, con el cargo, la persona titular o **Vacante**, y **Reemplazo: nombre** si hay un reemplazo vigente. Pulsa una tarjeta de puesto, o enfócala y presiona `Enter`, para abrir su ficha. Se puede ocultar el cargo o la persona. Con muchas unidades desplegadas, los puestos suman tarjetas: pliega las ramas que no necesitas.
- **Mostrar en las tarjetas el superior de tipo**: marca los tipos (por ejemplo, Gerencia o Área) cuyo superior más cercano quieres leer en cada tarjeta de unidad. Solo aparecen los tipos que alguna unidad usa.
- **Colorear por**: **Ninguno** o **Marca de** un tipo. Cada unidad toma la marca (color y código de hasta 4 letras) de su superior más cercano de ese tipo, incluida ella misma; se ve como una franja de color a la izquierda y el código en la tarjeta. Solo se aplica un criterio a la vez.

Con un criterio de color activo, abajo a la izquierda del lienzo aparece una **leyenda** con el color, el código y el nombre de la unidad que define cada marca que se ve. Se puede ocultar y volver a mostrar con su encabezado.

Además de lo anterior, el botón **Vista** permite elegir:

- **Dirección**: vertical (de arriba a abajo) u horizontal (de izquierda a derecha).
- **Densidad**: **Normal** o **Compacta**. La tarjeta compacta es de una línea (nombre, dotación y vacantes) y reduce las separaciones: sirve para árboles muy grandes. En la tarjeta compacta seleccionada, la dotación y las vacantes dejan su lugar a los botones.
- **Líneas**: rectas en ángulo o curvas.
- **Datos de la tarjeta**: tipo de unidad, jefatura, foto de la jefatura, dotación, vacantes y etiquetas.

Cada árbol (el completo o un subárbol guardado en Árboles) recuerda en este computador la última configuración que usaste en él.

## Vistas guardadas

El botón **Vistas** guarda con nombre la configuración actual (dirección, densidad, líneas, datos de la tarjeta, colorear por, resaltado y ramas plegadas) para el árbol que estás viendo. Escribe un nombre y pulsa **Guardar vista actual**; no se puede repetir el nombre dentro del mismo árbol. Pulsa el nombre de una vista para aplicarla; el lápiz la renombra y la papelera la elimina (con **Deshacer** durante 8 segundos). Las vistas son del árbol completo o de un subárbol guardado: una rama que no está guardada en Árboles no tiene vistas propias. Se guardan en la base de datos, así que viajan con ella.
