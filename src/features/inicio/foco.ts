// Abrir, crear o eliminar la abierta desde Inicio la desmontan mientras se cambia de organización, y al volver (algo
// falló, o se eliminó la abierta) el foco quedaría en <body>.
let recordado: string | null = null;

/** El título de Inicio: siempre está, y recibe el foco cuando lo que lo tenía desapareció. */
export const ID_TITULO_INICIO = "bienvenida-titulo";

/** Antes de algo que puede desmontar Inicio: el id del elemento al que vuelve el foco. null al salir bien: no se vuelve. */
export const volverAlTerminar = (id: string | null): void => void (recordado = id);

/** El primero que siga en la página; si no queda ninguno, el título de Inicio. */
export function enfocarPrimero(...ids: (string | null)[]): void {
  const el = ids.map((id) => (id ? document.getElementById(id) : null)).find(Boolean);
  (el ?? document.getElementById(ID_TITULO_INICIO))?.focus();
}

/** Al montar Inicio, si el foco quedó suelto: a lo recordado, si sigue ahí, o al título. */
export function enfocarAlVolver(): void {
  const id = recordado;
  recordado = null;
  if (!document.activeElement || document.activeElement === document.body) enfocarPrimero(id);
}
