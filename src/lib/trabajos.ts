import { ref } from "vue";

/** Trabajos largos en curso (por su nombre, ya en el idioma de la interfaz). Mientras haya alguno, cerrar pregunta siempre. */
export const trabajos = ref<string[]>([]);

/** Anota un trabajo y devuelve la función que lo da por terminado (llamarla de nuevo no hace nada). */
export function iniciarTrabajo(nombre: string): () => void {
  trabajos.value.push(nombre);
  let enCurso = true;
  return () => {
    if (enCurso) trabajos.value.splice(trabajos.value.indexOf(nombre), 1);
    enCurso = false;
  };
}

/** Anota el trabajo mientras dura la promesa, también si falla. */
export async function conTrabajo<T>(nombre: string, accion: () => Promise<T>): Promise<T> {
  const terminar = iniciarTrabajo(nombre);
  try {
    return await accion();
  } finally {
    terminar();
  }
}
