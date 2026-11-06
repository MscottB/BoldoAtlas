// Abrir, crear o eliminar la abierta desde Inicio la desmontan mientras se cambia de organización, y al volver (algo
// falló, o se eliminó la abierta) el foco quedaría en <body>.
let recordado: string | null = null;

/** Antes de algo que puede desmontar Inicio: el id del elemento al que vuelve el foco. null al salir bien: no se vuelve. */
export const volverAlTerminar = (id: string | null): void => void (recordado = id);

/** Al montar Inicio, si el foco quedó suelto: a lo recordado, si sigue ahí, o a `respaldo`. */
export function enfocarAlVolver(respaldo: string): void {
  const id = recordado;
  recordado = null;
  const suelto = !document.activeElement || document.activeElement === document.body;
  if (suelto) (document.getElementById(id ?? "") ?? document.getElementById(respaldo))?.focus();
}
