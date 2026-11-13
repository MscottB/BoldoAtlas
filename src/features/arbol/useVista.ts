import { onScopeDispose, ref, watch, type Ref } from "vue";
import { alSoltarDatos, baseActual } from "@/lib/baseActiva";
import { panelPropio } from "@/features/pestanas/panel";
import type { Panel } from "@/features/pestanas/pestanas";
import { guardarPreferenciaOrg, leerPreferenciaOrg } from "@/lib/preferencias";
import { leerVista, sinResaltar, type ConfigVista } from "./vista";

// Estado compartido por la barra, el lienzo y la leyenda de cada panel: con la vista dividida hay un lienzo en cada uno.
// El resaltado es de la sesión: no se guarda por PC (las vistas nombradas sí lo incluyen).
// Todo es por organización. Los guardados son síncronos: uno pendiente no puede caer en la clave de la base siguiente.
const leerConfig = () => sinResaltar(leerVista(leerPreferenciaOrg<unknown>("vista", null)));
const leerMinimapa = () => leerPreferenciaOrg<unknown>("minimapa", false) === true;
function crearConfig(p: Panel) {
  const c = ref(leerConfig());
  watch(
    c,
    (v) => {
      guardarPreferenciaOrg("vista", sinResaltar(v));
      alOtro(p, null, v);
    },
    { deep: true, flush: "sync" },
  );
  return c;
}
const configs = { principal: crearConfig("principal"), lado: crearConfig("lado") };

/** La clave del árbol que muestra cada panel (null: una rama sin guardar; undefined: no muestra un árbol). */
const claves: Record<Panel, string | null | undefined> = { principal: undefined, lado: undefined };
const otro = (p: Panel): Panel => (p === "principal" ? "lado" : "principal");
const copia = (c: ConfigVista): ConfigVista => JSON.parse(JSON.stringify(sinResaltar(c)));

/**
 * Lo que el panel `p` guardó con la clave `k` (null: la general) llega al otro si muestra esa misma: si no, cada uno
 * guardaría su copia encima de la del otro. El resaltado es de cada panel. Si ya son iguales no se toca: así no vuelve.
 */
function alOtro(p: Panel, k: string | null, c: ConfigVista) {
  const q = configs[otro(p)];
  if (claves[otro(p)] !== k || JSON.stringify(copia(q.value)) === JSON.stringify(copia(c))) return;
  q.value = { ...copia(c), resaltar: q.value.resaltar };
}

/**
 * La última configuración usada en cada árbol (clave: id del subárbol guardado o "completo") se recuerda por organización y se
 * restaura al volver a él. Sin clave (una rama que no está guardada) rige la configuración general; el panel de al lado
 * parte entonces de la del principal.
 */
export function recordarPorArbol(clave: Ref<string | null>, panel: Panel = panelPropio()) {
  const config = configs[panel];
  // La vista es de la base con que se montó. Este watcher corre después de soltar los datos: la general de la otra base,
  // recién leída, no debe caer en su `vista:<árbol>`.
  const base = baseActual();
  let montando = true;
  watch(
    clave,
    (k) => {
      claves[panel] = k;
      const guardada = k && leerPreferenciaOrg<unknown>(`vista:${k}`, null);
      if (guardada) config.value = { ...leerVista(guardada), resaltar: config.value.resaltar };
      else if (!k && montando && panel === "lado")
        config.value = { ...copia(configs.principal.value), resaltar: config.value.resaltar };
      montando = false;
    },
    { immediate: true },
  );
  watch(
    config,
    (c) => {
      if (!clave.value || baseActual() !== base) return;
      guardarPreferenciaOrg(`vista:${clave.value}`, sinResaltar(c));
      alOtro(panel, clave.value, c);
    },
    { deep: true },
  );
  onScopeDispose(() => (claves[panel] = undefined));
}

/** El panel «Personalizar» abierto (también lo abre el menú contextual del lienzo). */
const abiertos = { principal: ref(false), lado: ref(false) };

/** Minimapa (en «Más» de la barra): apagado por defecto (tapaba tarjetas); se recuerda por organización, aparte de las vistas. Solo un true guardado lo enciende. */
const minimapa = ref(leerMinimapa());
watch(minimapa, (v) => guardarPreferenciaOrg("minimapa", v), { flush: "sync" });

alSoltarDatos(() => {
  for (const c of Object.values(configs)) c.value = leerConfig();
  minimapa.value = leerMinimapa();
});

/** La vista del lienzo del panel donde se monta quien llama (o del que se pide). El minimapa es uno para los dos. */
export const useVista = (panel: Panel = panelPropio()) => ({
  config: configs[panel],
  panelAbierto: abiertos[panel],
  minimapa,
});
