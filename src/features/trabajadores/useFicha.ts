import { ref } from "vue";

export interface AperturaFicha {
  /** null = ficha nueva (se crea al guardar por primera vez). */
  id: string | null;
}

// Estado compartido: <FichaTrabajador/> (montado una vez en App.vue) lo lee; las vistas solo llaman a abrir/nueva.
const abierta = ref<AperturaFicha | null>(null);

export function useFicha() {
  return {
    abierta,
    abrir: (id: string) => (abierta.value = { id }),
    nueva: () => (abierta.value = { id: null }),
    cerrar: () => (abierta.value = null),
  };
}
