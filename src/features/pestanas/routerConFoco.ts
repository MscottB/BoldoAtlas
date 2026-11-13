import { shallowReactive } from "vue";
import type { RouteLocationRaw, Router } from "vue-router";
import { seAbreAlLado } from "@/app/estructura";
import type { Panel } from "./pestanas";
import { usePestanas } from "./usePestanas";

// El router de cada panel: el principal lo registra main.ts; el de al lado, PanelLado mientras está montado.
const routers = shallowReactive<Partial<Record<Panel, Router>>>({});

/** Registra el router de un panel. Devuelve cómo quitarlo, que no quita uno que se registró después. */
export function registrarRouter(p: Panel, r: Router): () => void {
  routers[p] = r;
  return () => {
    if (routers[p] === r) delete routers[p];
  };
}

/** El router del panel `p`; sin el de al lado montado, el principal. */
export const routerDel = (p: Panel): Router => routers[p] ?? routers.principal!;

/**
 * El router del panel con foco: ahí navegan el menú lateral, la paleta y lo que no es de un panel. Si `destino` no se abre
 * al lado, el principal, que pasa a tener el foco.
 */
export function routerConFoco(destino?: RouteLocationRaw): Router {
  const pestanas = usePestanas();
  const r = routerDel(pestanas.conFoco);
  if (r === routers.principal || destino === undefined || seAbreAlLado(r.resolve(destino))) return r;
  pestanas.enfocarPanel("principal");
  return routers.principal!;
}

/** Navega en el panel con foco (ver `routerConFoco`): el menú de la app, la bandeja y la paleta. */
export const irConFoco = (destino: RouteLocationRaw) => routerConFoco(destino).push(destino);

/** Si `to` lleva a la vista que muestra el panel con foco: así marca su entrada el menú lateral. */
export function esRutaConFoco(to: RouteLocationRaw): boolean {
  const r = routerConFoco();
  return r.resolve(to).name === r.currentRoute.value.name;
}
