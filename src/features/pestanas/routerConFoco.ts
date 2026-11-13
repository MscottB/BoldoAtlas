import { shallowReactive } from "vue";
import type { RouteLocationRaw, RouteMeta, Router } from "vue-router";
import { esVistaCerrable } from "@/app/estructura";
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

/** Lo de pantalla completa (la Bienvenida) y Configuración, Ayuda y Acerca de no se abren al lado. */
export const seAbreAlLado = (to: { name?: unknown; meta: RouteMeta }) =>
  !to.meta.sinMarco && !esVistaCerrable(to.name);

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
