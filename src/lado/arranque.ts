import { createApp } from "vue";
import { createPinia } from "pinia";
import { START_LOCATION, type Router } from "vue-router";
import { router } from "@/router";
import { i18n } from "@/i18n";
import { fijarBase, soltarDatos } from "@/lib/baseActiva";
import { infoSiFalloCarga } from "@/app/estructura";
import { useOrganizacion } from "@/stores/organizacion";
import PantallaError from "@/vistas/PantallaError.vue";
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
 * lo abre en el panel principal; si era la ruta con que se abrió el iframe, este muestra el Árbol para no quedar en
 * blanco. Cada ruta a la que se llega también se le dice al padre.
 */
export function guiarRouter(r: Router): Router {
  r.beforeEach((to, de) => {
    if (VISTAS_LADO.includes(String(to.name))) return true;
    alPadre({ tipo: "boldo-lado-fuera", ruta: to.fullPath });
    return de === START_LOCATION ? "/" : false;
  });
  r.afterEach((to, _de, fallo) => {
    if (!fallo) alPadre({ tipo: "boldo-lado-ruta", ruta: to.fullPath });
  });
  return r;
}

/* eslint-disable vue/one-component-per-file -- son dos raíces alternativas de createApp, no dos componentes */
/**
 * El arranque en el iframe del lado. Sin migrar preferencias, respaldo automático, actualizaciones, bandeja ni cierre:
 * eso es de la ventana. El idioma ya lo tomó `i18n` de las preferencias (el iframe comparte `localStorage`), y el tema y
 * la escala ya los aplicó `main.ts`. El router es el de `@/router`: en este documento, su hash es el del iframe. Si algo
 * falla, se ve el motivo y no un panel en blanco.
 */
export async function arrancar(): Promise<void> {
  try {
    instalarPuente(window.parent);
    fijarBase(idLado());
    // router.ts importa VistaArbol sin carga diferida: useVista ya se evaluó con la base vacía y se relee aquí.
    soltarDatos();
    const pinia = createPinia();
    const r = await useOrganizacion(pinia).cargar();
    createApp(AppLado, { motivo: r.ok ? "" : r.mensaje })
      .use(pinia)
      .use(guiarRouter(router))
      .use(i18n)
      .mount("#app");
  } catch (e) {
    console.error(e);
    createApp(PantallaError, { info: infoSiFalloCarga({ ok: false, mensaje: String(e) }) })
      .use(i18n)
      .mount("#app");
  }
}
