import { ref, shallowRef } from "vue";

/** Trabajos largos en curso (por su nombre, ya en el idioma de la interfaz). Mientras haya alguno, cerrar pregunta siempre. */
export const trabajos = ref<string[]>([]);

/** El último trabajo que terminó, y si falló. */
export const ultimoFin = shallowRef<{ nombre: string; fallo: boolean } | null>(null);

/**
 * Anota un trabajo y devuelve la función que lo da por terminado: `terminar()` si salió bien, `terminar(true)` si falló.
 * Llamarla de nuevo no hace nada.
 */
export function iniciarTrabajo(nombre: string): (fallo?: boolean) => void {
  trabajos.value.push(nombre);
  let enCurso = true;
  return (fallo = false) => {
    if (!enCurso) return;
    enCurso = false;
    trabajos.value.splice(trabajos.value.indexOf(nombre), 1);
    ultimoFin.value = { nombre, fallo };
  };
}

/** Anota el trabajo mientras dura la promesa, y si falló. */
export async function conTrabajo<T>(nombre: string, accion: () => Promise<T>): Promise<T> {
  const terminar = iniciarTrabajo(nombre);
  try {
    const r = await accion();
    terminar();
    return r;
  } catch (e) {
    terminar(true);
    throw e;
  }
}
