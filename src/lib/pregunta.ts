import { ref, shallowRef } from "vue";

/**
 * Lo que pregunta un AlertDialog de reka. Su botón de confirmar es un DialogClose: avisa el cierre antes de que corra su
 * propio clic. Por eso cerrar solo baja `abierta`, y lo preguntado sigue en `valor` hasta que quien confirma lo `toma`.
 * `valor` no se borra al tomarlo: el diálogo lo sigue mostrando mientras se anima al cerrar.
 */
export function usePregunta<T>() {
  const valor = shallowRef<T | null>(null);
  const abierta = ref(false);
  let tomada = true;
  return {
    valor,
    abierta,
    preguntar(v: T) {
      valor.value = v;
      tomada = false;
      abierta.value = true;
    },
    /** Cancelar, Esc, clic fuera; y también el botón de confirmar, antes de su clic. */
    cerrar() {
      abierta.value = false;
    },
    /** Lo preguntado, una sola vez: para confirmar. */
    tomar(): T | null {
      abierta.value = false;
      if (tomada) return null;
      tomada = true;
      return valor.value;
    },
  };
}
