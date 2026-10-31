import { ref, watch, type Ref } from "vue";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { leerVista, sinResaltar } from "./vista";

// Estado compartido por la barra, el lienzo y la leyenda: hay un solo lienzo en la app.
// El resaltado es de la sesión: no se guarda por PC (las vistas nombradas sí lo incluyen).
const config = ref(sinResaltar(leerVista(leerPreferencia<unknown>("vista", null))));
watch(config, (c) => guardarPreferencia("vista", sinResaltar(c)), { deep: true });

/**
 * La última configuración usada en cada árbol (clave: id del subárbol guardado o "completo") se recuerda por PC y se
 * restaura al volver a él. Sin clave (una rama que no está guardada) rige la configuración general.
 */
export function recordarPorArbol(clave: Ref<string | null>) {
  watch(
    clave,
    (k) => {
      const guardada = k && leerPreferencia<unknown>(`vista:${k}`, null);
      if (guardada) config.value = { ...leerVista(guardada), resaltar: config.value.resaltar };
    },
    { immediate: true },
  );
  watch(config, (c) => clave.value && guardarPreferencia(`vista:${clave.value}`, sinResaltar(c)), {
    deep: true,
  });
}

/** El panel «Vista» abierto (también lo abre el menú contextual del lienzo). */
const panelAbierto = ref(false);

export const useVista = () => ({ config, panelAbierto });
