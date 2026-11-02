import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Descargas from "./Descargas.vue";
import Novedades from "./Novedades.vue";
import Presentacion from "./Presentacion.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Descargas", Descargas);
    app.component("Novedades", Novedades);
    app.component("Presentacion", Presentacion);
  },
} satisfies Theme;
