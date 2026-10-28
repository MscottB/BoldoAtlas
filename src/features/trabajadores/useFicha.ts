import { ref } from "vue";

export interface AperturaFicha {
  /** null = ficha nueva (se crea al guardar por primera vez). */
  id: string | null;
  unidadId: string;
  estado: "activo" | "vacante";
}

// Estado compartido: <FichaTrabajador/> (montado una vez en App.vue) lo lee; las vistas solo llaman a abrir/nueva.
const abierta = ref<AperturaFicha | null>(null);

export function useFicha() {
  return {
    abierta,
    // Al abrir una existente solo importa el id: unidad y estado salen de la ficha guardada.
    abrir: (id: string) => (abierta.value = { id, unidadId: "", estado: "activo" }),
    nueva: (unidadId: string, estado: "activo" | "vacante" = "activo") =>
      (abierta.value = { id: null, unidadId, estado }),
    cerrar: () => (abierta.value = null),
  };
}
