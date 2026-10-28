import { createRouter, createWebHashHistory } from "vue-router";
import VistaArbol from "@/vistas/VistaArbol.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/", name: "arbol", component: VistaArbol }],
});
