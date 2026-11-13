import { createApp } from "vue";
import { createPinia } from "pinia";
import type { Router } from "vue-router";
import { router } from "@/router";
import { i18n } from "@/i18n";
import { fijarBase, soltarDatos } from "@/lib/baseActiva";
import { useTema } from "@/features/tema/useTema";
import { useOrganizacion } from "@/stores/organizacion";
import AppLado from "./AppLado.vue";
import { idLado } from "./modo";
import { instalarPuente } from "./puente";

/** Las vistas que se ven al lado (nombres de ruta). */
export const VISTAS_LADO = ["arbol", "arboles", "directorio", "revision"];

/** Mismo origen que el padre: el mensaje no sale de la app. */
const alPadre = (mensaje: { tipo: string; ruta: string }) =>
  window.parent.postMessage(mensaje, location.origin);

/**
 * Solo las vistas de trabajo navegan aquí. Lo demás (Configuración, Importar y exportar, Ayuda…) se pide al padre, que
 * lo abre en el panel principal. Cada ruta a la que se llega también se le dice al padre.
 */
export function guiarRouter(r: Router): Router {
  r.beforeEach((to) => {
    if (VISTAS_LADO.includes(String(to.name))) return true;
    alPadre({ tipo: "boldo-lado-fuera", ruta: to.fullPath });
    return false;
  });
  r.afterEach((to, _de, fallo) => {
    if (!fallo) alPadre({ tipo: "boldo-lado-ruta", ruta: to.fullPath });
  });
  return r;
}

/**
 * El arranque en el iframe del lado. Sin migrar preferencias, respaldo automático, actualizaciones, bandeja ni cierre:
 * eso es de la ventana. El idioma ya lo tomó `i18n` de las preferencias (el iframe comparte `localStorage`), y el tema y
 * la escala los aplica `useTema`. El router es el de `@/router`: en este documento, su hash es el del iframe.
 */
export async function arrancar(): Promise<void> {
  const id = idLado();
  instalarPuente(id, window.parent);
  useTema().aplicar();
  fijarBase(id);
  // router.ts importa VistaArbol sin carga diferida: useVista ya se evaluó con la base vacía y se relee aquí.
  soltarDatos();
  const pinia = createPinia();
  const r = await useOrganizacion(pinia).cargar();
  createApp(AppLado, { motivo: r.ok ? "" : r.mensaje })
    .use(pinia)
    .use(guiarRouter(router))
    .use(i18n)
    .mount("#app");
}
