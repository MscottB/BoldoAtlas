import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Comparador from "./Comparador.vue";
import Descargas from "./Descargas.vue";
import Funciones from "./Funciones.vue";
import Inicio from "./Inicio.vue";
import Novedades from "./Novedades.vue";
import Presentacion from "./Presentacion.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Comparador", Comparador);
    app.component("Descargas", Descargas);
    app.component("Funciones", Funciones);
    app.component("Inicio", Inicio);
    app.component("Novedades", Novedades);
    app.component("Presentacion", Presentacion);
  },
} satisfies Theme;
