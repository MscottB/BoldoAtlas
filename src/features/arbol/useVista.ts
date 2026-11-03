import { ref, watch, type Ref } from "vue";
import { alSoltarDatos, baseActual } from "@/lib/baseActiva";
import { guardarPreferenciaOrg, leerPreferenciaOrg } from "@/lib/preferencias";
import { leerVista, sinResaltar } from "./vista";

// Estado compartido por la barra, el lienzo y la leyenda: hay un solo lienzo en la app.
// El resaltado es de la sesión: no se guarda por PC (las vistas nombradas sí lo incluyen).
// Todo es por organización. Los guardados son síncronos: uno pendiente no puede caer en la clave de la base siguiente.
const leerConfig = () => sinResaltar(leerVista(leerPreferenciaOrg<unknown>("vista", null)));
const leerMinimapa = () => leerPreferenciaOrg<unknown>("minimapa", false) === true;
const config = ref(leerConfig());
watch(config, (c) => guardarPreferenciaOrg("vista", sinResaltar(c)), { deep: true, flush: "sync" });

/**
 * La última configuración usada en cada árbol (clave: id del subárbol guardado o "completo") se recuerda por organización y se
 * restaura al volver a él. Sin clave (una rama que no está guardada) rige la configuración general.
 */
export function recordarPorArbol(clave: Ref<string | null>) {
  // La vista es de la base con que se montó. Este watcher corre después de soltar los datos: la general de la otra base,
  // recién leída, no debe caer en su `vista:<árbol>`.
  const base = baseActual();
  watch(
    clave,
    (k) => {
      const guardada = k && leerPreferenciaOrg<unknown>(`vista:${k}`, null);
      if (guardada) config.value = { ...leerVista(guardada), resaltar: config.value.resaltar };
    },
    { immediate: true },
  );
  watch(
    config,
    (c) => {
      if (clave.value && baseActual() === base) guardarPreferenciaOrg(`vista:${clave.value}`, sinResaltar(c));
    },
    { deep: true },
  );
}

/** El panel «Personalizar» abierto (también lo abre el menú contextual del lienzo). */
const panelAbierto = ref(false);

/** Minimapa (en «Más» de la barra): apagado por defecto (tapaba tarjetas); se recuerda por organización, aparte de las vistas. Solo un true guardado lo enciende. */
const minimapa = ref(leerMinimapa());
watch(minimapa, (v) => guardarPreferenciaOrg("minimapa", v), { flush: "sync" });

alSoltarDatos(() => {
  config.value = leerConfig();
  minimapa.value = leerMinimapa();
});

export const useVista = () => ({ config, panelAbierto, minimapa });
