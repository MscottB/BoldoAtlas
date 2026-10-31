# El árbol

El árbol es la pantalla principal: muestra tu organización como un organigrama que puedes armar y reorganizar.

## Las tarjetas

Cada unidad es una tarjeta con:

- su tipo (por ejemplo, Gerencia o Área) y su nombre;
- la foto o las iniciales y el nombre de la jefatura (**Reemplazo: nombre** si su puesto solo tiene reemplazo), o **Sin jefe asignado** si no tiene; con **Personas en las tarjetas**, también el cargo de la jefatura;
- con **Personas en las tarjetas**, una fila con las caras (foto o iniciales) de hasta 4 personas más de la unidad y **+N** con las que no caben. Cuenta solo la propia unidad, sin sus subunidades, y cada persona una vez. Pulsa las caras (o `Tab` hasta ellas y `Enter`) para ver la lista en la pestaña **Personas** del panel;
- la dotación total de su rama (ella y todo lo que cuelga de ella); púlsala (o `Tab` hasta ella y `Enter`) para ver quiénes son en la pestaña **Personas** del panel;
- las vacantes de la rama, si hay;
- un punto de color por cada etiqueta (pasa el puntero por encima para ver su nombre).

Los tipos de unidad son una lista propia de tu organización: al comienzo trae Gerencia, Área, Subárea y Otra, que se pueden renombrar, reordenar, desactivar o complementar con otros (por ejemplo, Superintendencia o Departamento). El orden de la lista no limita la estructura: cualquier tipo puede depender de cualquier otro.

Las líneas continuas unen cada unidad con su superior. Las líneas punteadas son conexiones laterales entre unidades, con su descripción.

## Plegar y desplegar ramas

Al abrir el árbol se ven las raíces y su primer nivel; el resto está plegado. El botón de abajo a la derecha de una tarjeta muestra cuántas subunidades tiene ocultas (por ejemplo `+3`): púlsalo para desplegarlas y otra vez para plegarlas.

En **Más** (el último botón de la barra del lienzo), el grupo **Ramas** pliega o despliega todo de una vez:

- **Expandir todo** abre todas las ramas.
- **Contraer todo** deja solo las raíces.
- **Contraer hasta el nivel** 1 a 6 muestra esa cantidad de niveles (1 = solo las raíces) y pliega el resto.

En el menú contextual de una unidad, **Expandir rama** abre la unidad y todo lo que cuelga de ella, y **Contraer rama** la pliega junto con sus subramas: al volver a abrirla se ve un nivel. En una rama abierta como árbol, los niveles se cuentan desde su raíz.

Si al expandir (con **Más › Ramas**, el menú contextual o una vista guardada) quedarían más de 1.000 tarjetas a la vista, primero se avisa con la cifra: **Expandir igual**, **Expandir hasta el nivel** que todavía cabe, o **Cancelar**. Con tantas tarjetas el lienzo se vuelve lento.

## Diagrama ordenado

El árbol se dibuja ordenado: cada superior queda centrado sobre sus subunidades, las unidades hermanas van en su orden y cada nivel ocupa una misma fila (o columna, en horizontal). Si hay varias raíces, quedan lado a lado. Las conexiones laterales no cambian el dibujo: solo se trazan encima. Con **Ver puestos**, los puestos de cada unidad van apilados justo debajo de su tarjeta (a su derecha, en horizontal), en su orden, y las líneas a las subunidades salen del último puesto.

**Reordenar**, en **Más**, vuelve a calcular el dibujo, devuelve a su lugar cualquier tarjeta que haya quedado fuera de él y lo encuadra en la ventana. Con un árbol grande el cálculo tarda unos segundos: mientras tanto se ve **Ordenando…** arriba a la derecha y puedes seguir usando el lienzo.

## Menú contextual

Clic derecho sobre una tarjeta o sobre el fondo del lienzo abre un menú con lo que se puede hacer ahí. Con el teclado se abre con `Mayús` + `F10` o con la tecla Menú, sobre la tarjeta enfocada o, si no hay, la seleccionada (si tampoco hay, el del fondo). Se recorre con las flechas, `Enter` elige y `Esc` lo cierra y devuelve el foco a la tarjeta.

- **Unidad**: Abrir panel, Nueva subunidad, Renombrar, Ver personas (abre el panel en la pestaña Personas), Expandir rama, Contraer rama, Seleccionar rama (la unidad y lo que se ve de su rama), Duplicar rama, Abrir como árbol, Guardar en Árboles y Eliminar… (con la misma confirmación de siempre).
- **Puesto** (con **Ver puestos** activo): Abrir puesto, Asignar titular, Registrar reemplazo, Copiar estilo, Pegar estilo y Quitar estilo.
- **Fondo**: Nueva unidad raíz, Expandir todo, Contraer todo, Reordenar, Encuadrar y Personalizar….

Viendo el organigrama a una fecha, las acciones que cambian algo aparecen desactivadas.

## Seleccionar, crear y renombrar

- **Clic** en una tarjeta la selecciona. Clic en el fondo quita la selección.
- En la tarjeta seleccionada aparece **+**: crea una subunidad con el tipo que sigue al de su superior en la lista de tipos (el último se repite) y la deja lista para escribir su nombre.
- Al seleccionar una tarjeta se abre el **panel de la unidad**, a la derecha del lienzo (ver «Panel de unidad»): ahí están sus puestos y todos sus datos.
- **Doble clic** sobre el nombre, o `F2` con la tarjeta enfocada o seleccionada, lo edita. `Enter` guarda y `Esc` cancela.
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

El botón **Duplicar rama** (en **Avanzado**, en el Resumen del panel de la unidad, y en la tarjeta seleccionada) y `Ctrl` + `D` copian la unidad con todo lo que cuelga de ella:

- La copia queda a continuación de la original, con el nombre «X (copia)» (solo la unidad de arriba; las de abajo conservan su nombre), y queda seleccionada. También se puede duplicar una raíz: la copia es otra raíz.
- Se copian el tipo, la descripción, la marca, las etiquetas y los puestos (cargo, descripción y leyenda). La jefatura de cada copia apunta al puesto copiado.
- Se copian las conexiones laterales cuyos dos extremos están dentro de la rama.
- Los puestos copiados nacen **vacantes**: no se copian titulares, reemplazos ni historial.
- Todo es un solo cambio, sin aviso de **Deshacer**: si no quieres la copia, elimínala.

## Resaltar

En la barra del lienzo, **Buscar en el diagrama** (`F` lleva a ese campo) resalta las unidades cuyo nombre contiene el texto, sin importar tildes ni mayúsculas. Las unidades que no coinciden quedan atenuadas, pero no se ocultan.

El botón **Resaltar** suma más criterios: **Etiqueta** y **Con vacantes** a la vista, y **Sede**, **Tipo de contrato**, **Jornada** y **Cargo** en **Más filtros** (se abre solo si alguno está elegido); el número en el botón cuenta los que están activos y **Quitar filtros** los vacía (el texto de **Buscar en el diagrama** queda). Una unidad se resalta solo si cumple todos los criterios elegidos (también el texto): tiene la etiqueta y, en sus propios puestos (no en los de su rama; no hace falta que sea el mismo puesto), tiene una vacante, una persona titular vigente con esa sede, una con ese tipo de contrato, una con esa jornada y un puesto con ese cargo; los criterios que no elijas no cuentan. El resaltado dura mientras la app está abierta; las vistas guardadas sí lo incluyen.

## Moverse por el lienzo

Arrastra el fondo para desplazarte y usa la rueda del mouse o los botones **−** y **+** de la esquina inferior derecha del lienzo para alejar o acercar (con el teclado, `Ctrl` + `-` y `Ctrl` + `=`; con `Tab` se llega a esos botones justo después de la barra). A su lado, **Encuadrar** (`Ctrl` + `0`) ajusta todo el árbol a la ventana. El **minimapa** muestra dónde estás: viene apagado y se enciende en **Más › Mostrar minimapa**; al encenderlo, el árbol se encuadra una vez. Aparece abajo a la derecha, sobre los botones de zoom, con los colores del tema, y al encuadrar el árbol se deja libre su espacio para que no tape tarjetas.

Con muchas tarjetas a la vista (más de 300), al alejarte las tarjetas se simplifican: solo el nombre, sobre el color de su marca, y las líneas van en escalón. Así el lienzo se mueve con fluidez. Al acercarte vuelve todo el detalle; con el teclado, cada tarjeta ligera se enfoca con `Tab` y se elige con `Enter` o la barra espaciadora. Cuando un cambio (expandir, ver puestos, aplicar una vista) pasa a mostrar muchas tarjetas, el lienzo se encuadra para mostrarlas todas. Con más de 300 tarjetas no hay minimapa, con cualquier zoom. La tarjeta seleccionada se ve rellena con el color de acento.

## Abrir una rama como árbol

En la tarjeta seleccionada, el botón **Abrir como árbol** muestra solo esa unidad y lo que cuelga de ella. No es una copia: lo que cambies ahí cambia en el árbol completo. Arriba aparece la ruta de origen (cada tramo se puede pulsar para abrir ese nivel), **Subir un nivel** y **Ver en el árbol completo**, que vuelve a todo el árbol con esa unidad desplegada, seleccionada y al centro.

## Personalizar

El botón **Personalizar**, en la barra del lienzo, abre las opciones de cómo se dibuja el árbol. Se recuerdan en este computador. A la vista están **Dirección**, **Densidad**, **Colorear por** y **Ver puestos**; el resto va en dos bloques plegados, **Qué mostrar en las tarjetas** y **Avanzado**, que se abren con un clic (o `Enter`) y recuerdan en este computador si los dejaste abiertos. **Restablecer** vuelve todo a como venía al comienzo, salvo el resaltado.

- **Ver puestos** (apagado al comienzo): bajo cada unidad visible aparece una tarjeta por cada puesto, con el cargo, la persona titular o **Vacante**, y **Reemplazo: nombre** si hay un reemplazo vigente. Pulsa una tarjeta de puesto, o enfócala y presiona `Enter`, para abrir su ficha. En **Avanzado** se puede ocultar el cargo o la persona. Con muchas unidades desplegadas, los puestos suman tarjetas: pliega las ramas que no necesitas.
- **Mostrar en las tarjetas el superior de tipo** (en **Avanzado**): marca los tipos (por ejemplo, Gerencia o Área) cuyo superior más cercano quieres leer en cada tarjeta de unidad. Solo aparecen los tipos que alguna unidad usa.
- **Colorear por**: **Ninguno**, **Marca de** un tipo o **Leyenda del puesto**. Con **Marca de** un tipo, cada unidad toma la marca (color y código de hasta 4 letras) de su superior más cercano de ese tipo, incluida ella misma; se ve como una franja de color a la izquierda y el código en la tarjeta. Con **Leyenda del puesto**, las tarjetas de puesto toman el color de su leyenda (hay que activar **Ver puestos**; ver «Leyendas y colores de puestos»). Solo se aplica un criterio a la vez.

Con un criterio de color activo, en una franja bajo el lienzo aparece una **leyenda** con el color, el código y el nombre de la unidad que define cada marca que se ve. Si no cabe, la fila se desplaza a lo ancho. Se puede plegar y volver a abrir con su encabezado. Una marca muy oscura (o muy clara) que casi no se distingue de la tarjeta lleva un contorno gris en la franja y el código.

Además de lo anterior, **Personalizar** permite elegir:

- **Dirección**: vertical (de arriba a abajo) u horizontal (de izquierda a derecha).
- **Densidad**: **Normal** o **Compacta**. La tarjeta compacta es de una línea (nombre, dotación y vacantes) y reduce las separaciones: sirve para árboles muy grandes. En la tarjeta compacta seleccionada, la dotación y las vacantes dejan su lugar a los botones.
- **Líneas** (en **Avanzado**): rectas en ángulo o curvas.
- **Alinear por tipo de unidad** (en **Avanzado**): cada unidad va en la fila (o columna, en horizontal) de su tipo, en el orden de la lista de tipos; por ejemplo, todas las Áreas quedan en una misma fila aunque cuelguen a distinta profundidad. Solo ocupan fila los tipos de las unidades que se ven (un tipo sin unidades a la vista, o cuyas unidades están en ramas plegadas, no deja una fila vacía). Si el tipo de una unidad la dejaría en la fila de su superior o más arriba, baja a la fila siguiente a la de su superior, para que las líneas siempre vayan hacia abajo (o hacia la derecha): con una Gerencia dentro de otra Gerencia, las filas de los tipos que siguen empiezan más abajo; con una Gerencia bajo un Área, solo baja esa rama. Los puestos van apilados bajo su unidad y no ocupan fila.
- **Qué mostrar en las tarjetas** (con cuántos datos están activos): personas en las tarjetas, tipo de unidad, jefatura, foto de la jefatura, dotación, vacantes y etiquetas.
- **Personas en las tarjetas** (encendido al comienzo): la jefatura se ve con su cargo y, debajo, las caras del equipo de la unidad. La tarjeta queda un poco más alta. Como la jefatura ya está en la tarjeta, con **Ver puestos** su puesto no se repite debajo, como en un organigrama clásico; los demás puestos sí se ven. La tarjeta compacta y la tarjeta simplificada (al alejarte con muchas tarjetas) no muestran personas. A una fecha pasada se ven las personas de ese día. Las caras abren la pestaña **Personas** con **Incluir subunidades** apagado, para que la lista sea la misma que cuentan. Con **Jefatura** apagada la jefatura no se ve en la tarjeta, pero sigue contada en la cifra del equipo (el nombre del botón de las caras).

Cada árbol (el completo o un subárbol guardado en Árboles) recuerda en este computador la última configuración que usaste en él.

## Vistas guardadas

El botón **Vistas guardadas** guarda con nombre la configuración actual (dirección, densidad, líneas, datos de la tarjeta, colorear por, resaltado y ramas plegadas) para el árbol que estás viendo. Escribe un nombre y pulsa **Guardar vista actual**; no se puede repetir el nombre dentro del mismo árbol. Pulsa el nombre de una vista para aplicarla; el lápiz la renombra y la papelera la elimina (con **Deshacer** durante 8 segundos). Las vistas son del árbol completo o de un subárbol guardado: una rama que no está guardada en Árboles no tiene vistas propias. Se guardan en la base de datos, así que viajan con ella.

## Ver a una fecha

El botón **Ver en otra fecha** de la barra del lienzo (con poco ancho dice solo **Fecha**) muestra el organigrama como estaba un día pasado. Al pulsarlo se abre el selector (se acepta desde el 1 de enero de 1900 hasta hoy). Arriba puedes escribir la fecha completa (mientras escribes el año no cambia nada, al salir del campo lo que quedó a medias se descarta, y vaciarlo vuelve a hoy); debajo, el calendario va a ese mes, y sus listas de **mes** y **año** saltan a cualquier mes en dos clics. En el calendario, los días **resaltados con un punto** tuvieron cambios, y el lector de pantalla los anuncia con su cantidad («3 cambios»). Elige un día: arriba aparece la banda **Viendo al … · solo lectura** con el botón **Volver a hoy**, el botón de la barra muestra la fecha elegida y, bajo el calendario, la lista **Cambios de este día** los cuenta en frases simples («Ana Rojas asumió como Gerente en Finanzas», «Se creó la unidad Logística»). Pulsa un cambio para seleccionar y centrar su unidad en el lienzo. **Cambio anterior** y **Cambio siguiente** saltan al día con cambios más cercano.

- Con el teclado: las flechas mueven entre días, **Inicio** y **Fin** van al comienzo y al final de la semana, **RePág** y **AvPág** cambian de mes, con **Mayús** cambian de año, y **Intro** o **Espacio** eligen el día. **Esc** cierra el calendario y el foco vuelve al botón.
- **Qué cuenta como cambio:** una asignación que empieza (alguien asumió un puesto o empezó un reemplazo) o termina (alguien dejó el puesto o terminó un reemplazo), y las unidades y los puestos creados o eliminados ese día. Si un titular sale y otro entra el mismo día en el mismo puesto, se muestra como un relevo. Eliminar a una persona cuenta como que **dejó el puesto** ese día. La creación de una unidad o un puesto es el día en que se ingresó en BoldoAtlas, salvo que tenga una asignación anterior: entonces el lienzo ya lo mostraba y no aparece como creado. **Mover una unidad o renombrarla no se registra**, así que no aparece.

- Los **jefes**, la **dotación**, las **vacantes** y los **puestos** se calculan con las asignaciones vigentes ese día: una asignación cuenta si empieza ese día o antes y no terminó (el día en que termina ya no cuenta, y es el primer día del relevo).
- Se ocultan las unidades y los puestos **eliminados antes** de esa fecha y los **creados después**, salvo que tengan una asignación vigente ese día (un puesto) o un puesto o una subunidad que se vea (una unidad): así una organización ingresada hoy con asignaciones antiguas se ve completa. Lo eliminado después de la fecha reaparece.
- Es de **solo lectura**: no se puede arrastrar, renombrar, crear, duplicar, seleccionar varias unidades, pegar estilo ni cambiar nada en el panel de la unidad ni en la ficha del puesto, que muestran los datos de ese día (el historial del puesto aparece completo). La **ficha de la persona** sí se abre con normalidad: sus datos no tienen historial. El directorio y la revisión de datos siguen siendo de hoy.
- **Límite declarado:** los cambios de superior no se registran, así que la forma del árbol es la de hoy. Una unidad que se movió sigue en su lugar actual, una unidad eliminada reaparece bajo el último superior que tuvo (o como raíz si ese superior no existía ese día), y los puestos y la unidad de jefatura son los de hoy. Las asignaciones registradas con retraso cuentan desde su fecha de inicio.

## Panel de unidad

Al seleccionar una tarjeta (con el mouse o con `Enter` en su nombre) se abre un panel a la derecha: el lienzo se reduce, no queda tapado. El foco pasa al panel. El botón **Cerrar el panel** (la X), `Esc` o un clic en el fondo del lienzo lo cierran; con la X o `Esc` el foco vuelve a la tarjeta, y `Esc` guarda antes lo que estabas escribiendo. Arriba aparece la ubicación completa de la unidad, con el tipo de cada tramo; cada tramo se puede pulsar para seleccionar esa unidad.

La pestaña **Resumen** muestra a la vista el tipo, el nombre, la jefatura, las cifras y las etiquetas. Lo demás está en **Avanzado**, que se abre con un clic (o con `Enter` sobre él) y queda abierto o plegado como lo dejes. **Eliminar unidad** va al pie, aparte. Reúne:

- **Tipo**, **nombre** y **descripción** (en **Avanzado**). Se guardan al terminar de escribir (`Enter`, `Tab` o al salir del campo).
- **Superior** (en **Avanzado**): un buscador de unidades para cambiar de lugar la unidad sin arrastrarla (es la vía por teclado). No ofrece la unidad ni lo que cuelga de ella; **Sin superior (raíz)** la deja como raíz.
- **Marca** (en **Avanzado**): un color y un código de hasta 4 caracteres, que se ven al elegir «Colorear por» en **Personalizar**. **Quitar marca** borra ambos.
- **Jefatura**: elige cuál de los puestos de la unidad es la jefatura (o **Sin jefatura**). Debajo se ve quién la ejerce: la persona titular o, si no la hay, **Reemplazo: nombre**.
- La **dotación** directa (puestos con titular en la propia unidad), la total (con toda la rama) y las **vacantes** de la rama.
- **Etiquetas**: quita una con la X, agrega una existente o elige **Nueva etiqueta…** para crearla con su color. Si el nombre ya existe, se usa esa etiqueta en vez de duplicarla.
- **Conexiones laterales** (en **Avanzado**): escribe una descripción (opcional) y elige la unidad con la que conectar; la quitas con la X. Se ven en el lienzo como líneas punteadas cuando ambas unidades están visibles.
- **Guardar en Árboles** (no aparece en las raíces, que ya son un árbol) y **Duplicar rama**, en **Avanzado**; **Eliminar unidad**, al pie.

La pestaña **Puestos** lista los puestos directos de la unidad: cargo, titular o **Vacante**, **Reemplazo: nombre** y el color de su leyenda. Pulsa uno para abrir su ficha, o **Nuevo puesto** para crear otro (ver «Puestos y reemplazos»). La pestaña **Procesos** llega en la Fase 3.

La pestaña **Personas** lista a quienes ocupan los puestos: titulares y reemplazos vigentes, con su foto (o iniciales), nombre, cargo, tipo (**Titular** o **Reemplazo**) y unidad. Una persona con dos puestos aparece una vez por puesto. Arriba de la lista:

- El buscador (nombre, cargo, unidad o correo, sin importar tildes ni mayúsculas) y el orden **Por nombre**, **Por cargo** o **Por unidad**.
- **Incluir subunidades** (encendido al abrir la pestaña): suma a las personas de toda la rama, como la dotación de la tarjeta. Apagado, solo los puestos de la propia unidad.
- **Copiar correos**: copia los correos de la lista que se ve (con la búsqueda aplicada), sin repetir y separados por `; `, listos para pegar en un correo.
- **Ver en el directorio**: abre el Directorio filtrado por esta unidad y su rama.
- **Resumen por cargo** (se despliega al pulsarlo): cuántos puestos de cada cargo hay y cuántos están vacantes (sin titular); entre paréntesis, las vacantes que cubre un reemplazo.

Pulsa una persona para ver su **vista previa** en el mismo panel: foto, correo, teléfono, puestos vigentes e historial. **Abrir ficha** abre su ficha completa para editarla; **Volver a la lista** (o `Esc`) vuelve a la lista en el mismo lugar, con el foco en la persona que abriste. Con una fecha elegida, la lista y la vista previa muestran a quienes estaban asignados ese día.

### Eliminar una unidad

Una unidad sin contenido se elimina de inmediato. Si tiene subunidades o puestos, BoldoAtlas pregunta antes y **mueve su contenido al superior** de la unidad eliminada. Una unidad raíz con contenido no se puede eliminar: primero mueve o elimina lo que contiene. Tras eliminar aparece un aviso con **Deshacer** durante 8 segundos, que devuelve la unidad y todo lo que contenía a su lugar.
