# El árbol

El árbol es la pantalla principal: muestra tu organización como un organigrama que puedes armar y reorganizar.

## Las tarjetas

Cada unidad es una tarjeta con:

- su tipo (por ejemplo, Gerencia o Área) y su nombre;
- la foto o las iniciales y el nombre de la jefatura, o **Sin jefatura** si no tiene;
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
- **Doble clic** sobre el nombre, o `F2` con el nombre enfocado, lo edita. `Enter` guarda y `Esc` cancela.
- **+ Nueva unidad**, en la barra del lienzo, crea una subunidad de la tarjeta seleccionada; si no hay ninguna seleccionada, de la raíz de la vista enfocada, o una raíz nueva del primer tipo de la lista.

## Mover una unidad

Arrastra una tarjeta y suéltala sobre otra: BoldoAtlas pregunta "¿Mover X dentro de Y?" antes de cambiar su superior. No se puede mover una unidad dentro de su propia rama: en ese caso aparece un aviso y nada cambia. Si sueltas la tarjeta en el vacío, vuelve a su lugar.

## Resaltar

En la barra del lienzo puedes resaltar por etiqueta, por texto (parte del nombre, sin importar tildes ni mayúsculas) o por ambos a la vez. Las unidades que no coinciden quedan atenuadas, pero no se ocultan.

## Moverse por el lienzo

Arrastra el fondo para desplazarte y usa la rueda del mouse o los botones **−** y **+** para alejar o acercar. **Encuadrar** (`Ctrl` + `0`) ajusta todo el árbol a la ventana. El minimapa de la esquina muestra dónde estás.

## Abrir una rama como árbol

En la tarjeta seleccionada, el botón **Abrir como árbol** muestra solo esa unidad y lo que cuelga de ella. No es una copia: lo que cambies ahí cambia en el árbol completo. Arriba aparece la ruta de origen (cada tramo se puede pulsar para abrir ese nivel), **Subir un nivel** y **Ver en el árbol completo**, que vuelve a todo el árbol con esa unidad desplegada, seleccionada y al centro.
