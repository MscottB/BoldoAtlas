import { ref, type Ref } from "vue";

/** El botón de «Borrar definitivamente» se habilita solo si lo escrito es el nombre (sin mayúsculas ni espacios de los extremos). */
export const coincideNombre = (escrito: string, nombre: string): boolean =>
  escrito.trim() !== "" && escrito.trim().toLowerCase() === nombre.trim().toLowerCase();

/** A quién se va a borrar y si el diálogo está abierto. Cerrar no olvida a la persona: el botón cierra el diálogo antes de confirmar. */
export function usarSuprimirPendiente<T>() {
  const pendiente = ref<T | null>(null) as Ref<T | null>;
  const abierto = ref(false);
  return {
    pendiente,
    abierto,
    pedir(x: T) {
      pendiente.value = x;
      abierto.value = true;
    },
  };
}
