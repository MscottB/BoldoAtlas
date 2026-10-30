import { ref } from "vue";

export interface AperturaFicha {
  /** null = ficha nueva (se crea al guardar por primera vez). */
  id: string | null;
}

/** Abrir otra ficha con la actual a medio editar debe pasar por "Hay cambios sin guardar". */
export const decidirApertura = (
  abierta: AperturaFicha | null,
  id: string,
  hayCambios: boolean,
): "abrir" | "confirmar" => (abierta && abierta.id !== id && hayCambios ? "confirmar" : "abrir");

// Estado compartido: <FichaTrabajador/> (montado una vez en App.vue) lo lee; las vistas solo llaman a abrir/nueva.
const abierta = ref<AperturaFicha | null>(null);
/** Ficha que se quiere abrir y espera la confirmación de descartar los cambios de la actual. */
const pendiente = ref<string | null>(null);
let hayCambios: () => Promise<boolean> = async () => false; // lo registra <FichaTrabajador/>

export function useFicha() {
  return {
    abierta,
    pendiente,
    abrir: (id: string) => (abierta.value = { id }),
    nueva: () => (abierta.value = { id: null }),
    cerrar: () => (abierta.value = null),
    registrarGuardia: (f: () => Promise<boolean>) => (hayCambios = f),
    /** Abre la ficha de `id`; si la abierta tiene cambios sin guardar, pide confirmar primero. */
    async intentarAbrir(id: string) {
      if (decidirApertura(abierta.value, id, await hayCambios()) === "confirmar") pendiente.value = id;
      else abierta.value = { id };
    },
  };
}
