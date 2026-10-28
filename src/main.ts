import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import PantallaError from "./vistas/PantallaError.vue";
import { router } from "./router";
import { infoApp } from "./db/cliente";
import { useTema } from "./features/tema/useTema";
import { useOrganizacion } from "./stores/organizacion";
import { destinoInicial, infoSiFalloCarga } from "./app/estructura";
import "./styles/main.css";

// Antes de montar: el tema ya está aplicado en el primer pintado, sin parpadeo.
useTema().aplicar();

/* eslint-disable vue/one-component-per-file -- son dos raíces alternativas de createApp, no dos componentes */
// Si Rust no pudo abrir la base (o ni siquiera responde), se muestra el motivo en vez de una ventana en blanco.
infoApp()
  .then(async (info) => {
    if (info.error) return createApp(PantallaError, { info }).mount("#app");
    const pinia = createPinia();
    const org = useOrganizacion(pinia);
    // Se carga antes de montar para decidir la ruta inicial sin parpadeo; si falla, se muestra el motivo en vez de una app vacía.
    const falloCarga = infoSiFalloCarga(await org.cargar());
    if (falloCarga) return createApp(PantallaError, { info: falloCarga }).mount("#app");
    const app = createApp(App).use(pinia).use(router);
    const destino = destinoInicial(org.cargado, org.vacia);
    if (destino) await router.replace(destino);
    app.mount("#app");
  })
  .catch((e: unknown) => {
    const info = { dirDatos: "", rutaBd: "", portable: false, versionEsquema: 0, error: String(e) };
    createApp(PantallaError, { info }).mount("#app");
  });
