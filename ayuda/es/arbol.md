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
- Al seleccionar una tarjeta se abre el **panel de la unidad**, a la derecha del lienzo (ver «Panel de unidad»): ahí están sus puestos y todos sus datos.
- **Doble clic** sobre el nombre, o `F2` con el nombre enfocado, lo edita. `Enter` guarda y `Esc` cancela.
- **+ Nueva unidad**, en la barra del lienzo, crea una subunidad de la tarjeta seleccionada; si no hay ninguna seleccionada, de la raíz de la vista enfocada, o una raíz nueva del primer tipo de la lista.

## Mover una unidad

Arrastra una tarjeta y suéltala sobre otra: BoldoAtlas pregunta "¿Mover X dentro de Y?" antes de cambiar su superior. No se puede mover una unidad dentro de su propia rama: en ese caso aparece un aviso y nada cambia. Si sueltas la tarjeta en el vacío, vuelve a su lugar.

## Seleccionar varias unidades

- **Ctrl + clic** (o **Cmd + clic**) agrega la unidad a la selección o, si ya estaba, la quita. **Mayús + clic** la agrega.
- **Mayús + arrastrar** en el fondo dibuja un recuadro: se agregan las unidades que quedan completamente dentro (los puestos no se seleccionan).
- Con el teclado, **Mayús + flecha** agrega la unidad a la que iría la flecha (ver «Atajos de teclado»); sin Mayús, las flechas vuelven a una sola unidad.
- `Esc` o un clic en el fondo quitan la selección. Si pliegas una rama, las unidades que ocultaba dejan de estar seleccionadas.

Con dos o más unidades seleccionadas no se abre el panel de la unidad: sobre el lienzo aparece una barra con el número de unidades y las acciones que se aplican a todas de una vez:

- **Mover a…**: elige el nuevo superior (o **Sin superior (raíz)**). No se ofrecen las unidades seleccionadas ni lo que cuelga de ellas. Si una seleccionada cuelga de otra, solo se mueve la de arriba y lleva consigo su rama. Todo cambia en un solo paso.
- **Plegar**: pliega las ramas de todas.
- **Etiquetar…**: agrega a todas una etiqueta existente o una nueva (si el nombre ya existe, se usa esa). Las que ya tienen la etiqueta no se repiten.
- **Eliminar…**: pregunta cuántas unidades se eliminarán; el contenido de cada una (subunidades y puestos) pasa a su superior. Una unidad raíz con contenido no se elimina: el aviso de después dice cuántas se omitieron. El aviso trae un solo **Deshacer** (8 segundos) que lo devuelve todo. `Supr` hace lo mismo que el botón.
- La **X** quita la selección.

Viendo el organigrama a una fecha no hay selección múltiple.

## Duplicar una rama

El botón **Duplicar rama** (en el pie del Resumen del panel de la unidad y en la tarjeta seleccionada) y `Ctrl` + `D` copian la unidad con todo lo que cuelga de ella:

- La copia queda a continuación de la original, con el nombre «X (copia)» (solo la unidad de arriba; las de abajo conservan su nombre), y queda seleccionada. También se puede duplicar una raíz: la copia es otra raíz.
- Se copian el tipo, la descripción, la marca, las etiquetas y los puestos (cargo, descripción y leyenda). La jefatura de cada copia apunta al puesto copiado.
- Se copian las conexiones laterales cuyos dos extremos están dentro de la rama.
- Los puestos copiados nacen **vacantes**: no se copian titulares, reemplazos ni historial.
- Todo es un solo cambio, sin aviso de **Deshacer**: si no quieres la copia, elimínala.

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

## Ver a una fecha

El selector de fecha de la barra del lienzo muestra el organigrama como estaba un día pasado. Elige la fecha (no se aceptan fechas futuras): arriba aparece la banda **Viendo al … · solo lectura** con el botón **Volver a hoy**; también puedes vaciar el selector.

- Los **jefes**, la **dotación**, las **vacantes** y los **puestos** se calculan con las asignaciones vigentes ese día: una asignación cuenta si empieza ese día o antes y no terminó (el día en que termina ya no cuenta, y es el primer día del relevo).
- Se ocultan las unidades y los puestos **eliminados antes** de esa fecha y los **creados después**, salvo que tengan una asignación vigente ese día (un puesto) o un puesto o una subunidad que se vea (una unidad): así una organización ingresada hoy con asignaciones antiguas se ve completa. Lo eliminado después de la fecha reaparece.
- Es de **solo lectura**: no se puede arrastrar, renombrar, crear, duplicar, seleccionar varias unidades, pegar estilo ni cambiar nada en el panel de la unidad ni en la ficha del puesto, que muestran los datos de ese día (el historial del puesto aparece completo). La **ficha de la persona** sí se abre con normalidad: sus datos no tienen historial. El directorio y la revisión de datos siguen siendo de hoy.
- **Límite declarado:** los cambios de superior no se registran, así que la forma del árbol es la de hoy. Una unidad que se movió sigue en su lugar actual, una unidad eliminada reaparece bajo el último superior que tuvo (o como raíz si ese superior no existía ese día), y los puestos y la unidad de jefatura son los de hoy. Las asignaciones registradas con retraso cuentan desde su fecha de inicio.

## Panel de unidad

Al seleccionar una tarjeta (con el mouse o con `Enter` en su nombre) se abre un panel a la derecha: el lienzo se reduce, no queda tapado. El foco pasa al panel. El botón **Cerrar el panel** (la X), `Esc` o un clic en el fondo del lienzo lo cierran; con la X o `Esc` el foco vuelve a la tarjeta, y `Esc` guarda antes lo que estabas escribiendo. Arriba aparece la ubicación completa de la unidad, con el tipo de cada tramo; cada tramo se puede pulsar para seleccionar esa unidad.

La pestaña **Resumen** reúne:

- **Tipo**, **nombre** y **descripción**. Se guardan al terminar de escribir (`Enter`, `Tab` o al salir del campo).
- **Superior**: un buscador de unidades para cambiar de lugar la unidad sin arrastrarla (es la vía por teclado). No ofrece la unidad ni lo que cuelga de ella; **Sin superior (raíz)** la deja como raíz.
- **Marca**: un color y un código de hasta 4 caracteres, que se ven al elegir «Colorear por» en **Vista**. **Quitar marca** borra ambos.
- **Jefatura**: elige cuál de los puestos de la unidad es la jefatura (o **Sin jefatura**). Debajo se ve quién la ejerce: la persona titular o, si no la hay, **Reemplazo: nombre**.
- La **dotación** directa (puestos con titular en la propia unidad), la total (con toda la rama) y las **vacantes** de la rama.
- **Etiquetas**: quita una con la X, agrega una existente o elige **Nueva etiqueta…** para crearla con su color. Si el nombre ya existe, se usa esa etiqueta en vez de duplicarla.
- **Conexiones laterales**: escribe una descripción (opcional) y elige la unidad con la que conectar; la quitas con la X. Se ven en el lienzo como líneas punteadas cuando ambas unidades están visibles.
- **Guardar en Árboles** (no aparece en las raíces, que ya son un árbol), **Duplicar rama** y **Eliminar unidad**.

La pestaña **Puestos** lista los puestos directos de la unidad: cargo, titular o **Vacante**, **Reemplazo: nombre** y el color de su leyenda. Pulsa uno para abrir su ficha, o **Nuevo puesto** para crear otro (ver «Puestos y reemplazos»). La pestaña **Procesos** llega en la Fase 3.

### Eliminar una unidad

Una unidad sin contenido se elimina de inmediato. Si tiene subunidades o puestos, BoldoAtlas pregunta antes y **mueve su contenido al superior** de la unidad eliminada. Una unidad raíz con contenido no se puede eliminar: primero mueve o elimina lo que contiene. Tras eliminar aparece un aviso con **Deshacer** durante 8 segundos, que devuelve la unidad y todo lo que contenía a su lugar.
