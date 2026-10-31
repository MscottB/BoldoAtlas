import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Captura from "./Captura.vue";
import Descargas from "./Descargas.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Captura", Captura);
    app.component("Descargas", Descargas);
  },
} satisfies Theme;
