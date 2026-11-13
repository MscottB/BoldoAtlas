import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { rutas } from "@/router";
import { seAbreAlLado } from "./routerConFoco";
import { usePestanas } from "./usePestanas";

/**
 * El router del panel de al lado: en memoria, con las rutas de la app, y lo que navega queda en la pestaña de al lado.
 * Lo de pantalla completa (la Bienvenida) y Configuración, Ayuda y Acerca de no se abren ahí.
 */
export function crearRouterLado(inicial: string): Router {
  const pestanas = usePestanas();
  // La de ahora: si deja de estar al lado, una navegación que termina después no escribe en la que llegó.
  const id = pestanas.lado;
  const r = createRouter({ history: createMemoryHistory(), routes: rutas });
  r.beforeEach((to) => seAbreAlLado(to));
  r.afterEach((to, _de, fallo) => {
    if (!fallo && pestanas.lado === id) pestanas.rutaDelLado(to.fullPath);
  });
  void r.replace(inicial);
  return r;
}
