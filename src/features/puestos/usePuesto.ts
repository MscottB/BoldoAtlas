import { ref } from "vue";

export interface AperturaPuesto {
  /** null = puesto nuevo (se crea al elegir su cargo y confirmar). */
  id: string | null;
  /** Unidad del puesto nuevo. */
  unidadId: string | null;
  /** Formulario que se abre de una vez (desde el menú contextual del puesto). */
  accion?: "titular" | "reemplazo";
  /** Puesto nuevo: al crearlo queda como jefatura de su unidad (viene de «Nuevo puesto…» en la lista de Jefatura). */
  comoJefatura?: boolean;
}

// Estado compartido: <DialogoPuesto/> (montado una vez en App.vue) lo lee; las vistas solo llaman a abrir/nuevo.
const abierta = ref<AperturaPuesto | null>(null);

export function usePuesto() {
  return {
    abierta,
    abrir: (id: string, accion?: AperturaPuesto["accion"]) =>
      (abierta.value = { id, unidadId: null, accion }),
    nuevo: (unidadId: string, comoJefatura = false) => (abierta.value = { id: null, unidadId, comoJefatura }),
    cerrar: () => (abierta.value = null),
  };
}
