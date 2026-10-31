import { computed, type ComputedRef } from "vue";
import { useOrganizacion } from "@/stores/organizacion";
import { avisos, contarAvisos, type Avisos } from "./revision";

// Un solo cálculo por cambio del store, compartido por el menú (contador) y la vista.
let compartido: ComputedRef<{ avisos: Avisos; total: number }> | undefined;

export function useAvisos() {
  return (compartido ??= computed(() => {
    const a = avisos(useOrganizacion());
    return { avisos: a, total: contarAvisos(a) };
  }));
}
