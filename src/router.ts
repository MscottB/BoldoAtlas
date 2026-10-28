import { createRouter, createWebHashHistory } from "vue-router";
import VistaArbol from "@/vistas/VistaArbol.vue";

declare module "vue-router" {
  interface RouteMeta {
    /** Pantalla completa: sin barra lateral ni superior. */
    sinMarco?: boolean;
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "arbol", component: VistaArbol },
    {
      path: "/directorio",
      name: "directorio",
      component: () => import("@/features/directorio/VistaDirectorio.vue"),
    },
    {
      path: "/configuracion",
      name: "configuracion",
      component: () => import("@/vistas/VistaConfiguracion.vue"),
    },
    {
      path: "/ayuda/:pagina?",
      name: "ayuda",
      component: () => import("@/vistas/VistaAyuda.vue"),
    },
    { path: "/acerca", name: "acerca", component: () => import("@/vistas/VistaAcerca.vue") },
    {
      path: "/bienvenida",
      name: "bienvenida",
      component: () => import("@/vistas/VistaBienvenida.vue"),
      meta: { sinMarco: true },
    },
  ],
});
