import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import PantallaError from "./vistas/PantallaError.vue";
import { router } from "./router";
import { infoApp } from "./db/cliente";
import { useTema } from "./features/tema/useTema";
import "./styles/main.css";

// Antes de montar: el tema ya está aplicado en el primer pintado, sin parpadeo.
useTema().aplicar();

/* eslint-disable vue/one-component-per-file -- son dos raíces alternativas de createApp, no dos componentes */
// Si Rust no pudo abrir la base (o ni siquiera responde), se muestra el motivo en vez de una ventana en blanco.
infoApp()
  .then((info) => {
    if (info.error) createApp(PantallaError, { info }).mount("#app");
    else createApp(App).use(createPinia()).use(router).mount("#app");
  })
  .catch((e: unknown) => {
    const info = { dirDatos: "", rutaBd: "", portable: false, versionEsquema: 0, error: String(e) };
    createApp(PantallaError, { info }).mount("#app");
  });
