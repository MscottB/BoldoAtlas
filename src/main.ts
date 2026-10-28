import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import PantallaError from "./vistas/PantallaError.vue";
import { router } from "./router";
import { infoApp } from "./db/cliente";
import "./styles/main.css";

// Si Rust no pudo abrir la base, se muestra el motivo en vez de una app vacía.
void infoApp().then((info) => {
  if (info.error) createApp(PantallaError, { info }).mount("#app");
  else createApp(App).use(createPinia()).use(router).mount("#app");
});
