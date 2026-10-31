import { computed, ref, watch } from "vue";
import { guardarPreferencia, leerPreferencia } from "./preferencias";

/**
 * Un bloque plegado («Avanzado», «Más datos»…) que recuerda por PC si el usuario lo dejó abierto: solo un true guardado
 * lo abre. `forzar` lo abre sin tocar lo guardado: cuando adentro hay un error, un dato ya puesto o el destino de un salto.
 * Una vez abierto así, queda abierto hasta que el usuario lo pliegue: vaciar el campo que tiene el foco no lo cierra
 * (el foco se iría al body).
 */
export function usePlegable(clave: string, forzar: () => boolean = () => false) {
  const guardado = ref(leerPreferencia<unknown>(`plegado:${clave}`, false) === true);
  watch(guardado, (v) => guardarPreferencia(`plegado:${clave}`, v));
  const forzado = ref(false);
  watch(forzar, (f) => f && (forzado.value = true), { immediate: true, flush: "sync" });
  const abierto = computed(() => guardado.value || forzado.value);
  // El evento toggle también llega cuando se abre solo (al forzarlo): solo cuenta lo que el usuario cambió.
  const alPlegar = (abiertoAhora: boolean) => {
    if (abiertoAhora === abierto.value) return;
    guardado.value = abiertoAhora;
    if (!abiertoAhora) forzado.value = false;
  };
  return { abierto, alPlegar };
}
