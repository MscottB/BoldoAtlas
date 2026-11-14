/**
 * El aviso de spec §11 como una pregunta que se responde una vez. `abrir(true)` muestra el diálogo; `aceptar` es su botón
 * y `cerrado` cualquier cierre (Cancelar, Esc, clic fuera, y también el botón, que cierra después de responder): lo que
 * llega primero manda.
 */
export function crearAviso(abrir: (abierto: boolean) => void) {
  let responder: ((acepta: boolean) => void) | null = null;
  const contestar = (acepta: boolean) => {
    responder?.(acepta);
    responder = null;
  };
  return {
    preguntar: () =>
      new Promise<boolean>((r) => {
        responder = r;
        abrir(true);
      }),
    aceptar: () => contestar(true),
    cerrado: () => contestar(false),
  };
}
