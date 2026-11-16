/** El botón de «Borrar definitivamente» se habilita solo si lo escrito es el nombre (sin mayúsculas ni espacios de los extremos). */
export const coincideNombre = (escrito: string, nombre: string): boolean =>
  escrito.trim() !== "" && escrito.trim().toLowerCase() === nombre.trim().toLowerCase();
