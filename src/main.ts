import { createApp } from "vue";
import { createPinia } from "pinia";
import { toast } from "vue-sonner";
import App from "./App.vue";
import PantallaError from "./vistas/PantallaError.vue";
import { router } from "./router";
import { i18n } from "./i18n";
import { infoApp } from "./db/cliente";
import { callarAvisosVacios } from "./lib/avisos";
import { fijarBase, soltarDatos } from "./lib/baseActiva";
import { migrarPreferencias } from "./lib/preferencias";
import { useTema } from "./features/tema/useTema";
import { useOrganizacion } from "./stores/organizacion";
import { usePestanas } from "./features/pestanas/usePestanas";
import { sePuedeReintentar } from "./features/pestanas/pestanas";
import { iniciarRespaldoAutomatico, mensajeOrganizacion } from "./features/respaldos/respaldos";
import { useActualizaciones } from "./stores/actualizaciones";
import { crearBandeja } from "./features/actualizaciones/bandeja";
import { destinoInicial, infoSiFalloCarga } from "./app/estructura";
import { conectarCierre, continuarDondeEstaba } from "./app/ventana";
import "./styles/main.css";

// Antes de montar: el tema ya está aplicado en el primer pintado, sin parpadeo.
useTema().aplicar();
callarAvisosVacios();

/* eslint-disable vue/one-component-per-file -- son dos raíces alternativas de createApp, no dos componentes */
// Si Rust no pudo abrir la base (o ni siquiera responde), se muestra el motivo en vez de una ventana en blanco.
infoApp()
  .then(async (info) => {
    if (info.error) return createApp(PantallaError, { info }).use(i18n).mount("#app");
    fijarBase(info.baseId);
    // router.ts importa VistaArbol sin carga diferida: useVista ya se evaluó con la base vacía y se relee aquí.
    migrarPreferencias(info.baseId, info.dirDatos);
    soltarDatos();
    const pinia = createPinia();
    const org = useOrganizacion(pinia);
    // Se carga antes de montar para decidir la ruta inicial sin parpadeo; si falla, se muestra el motivo en vez de una app vacía.
    const falloCarga = infoSiFalloCarga(await org.cargar());
    if (falloCarga) return createApp(PantallaError, { info: falloCarga }).use(i18n).mount("#app");
    // Las pestañas de trabajo (se recuerdan por copia de la app). Se abre en Inicio o, con «Continuar donde estaba», en
    // la que estaba activa.
    const pestanas = usePestanas(pinia);
    pestanas.conectar(router, info.dirDatos, info.rutaBd);
    const destino = destinoInicial(org.cargado, org.vacia, continuarDondeEstaba.value) ?? pestanas.entrar();
    const app = createApp(App).use(pinia).use(router).use(i18n);
    await router.replace(destino);
    app.mount("#app");
    if (info.avisoInicio)
      toast.warning(i18n.global.t("organizaciones.avisoInicio", { nombre: info.avisoInicio.nombre }), {
        // aquí no hay botón para reintentar: se dice dónde
        description: sePuedeReintentar(info.avisoInicio)
          ? `${mensajeOrganizacion(info.avisoInicio)} ${i18n.global.t("organizaciones.reabrirDesdeMenu")}`
          : mensajeOrganizacion(info.avisoInicio),
        duration: Infinity,
      });
    iniciarRespaldoAutomatico();
    // «Novedades» tras actualizar y la consulta periódica de versiones nuevas (la única conexión automática)
    useActualizaciones(pinia).iniciar();
    void crearBandeja(router);
    // Desde aquí, cerrar la ventana sigue la opción «Al cerrar la ventana»; si la app no llegó hasta aquí, se cierra sin más.
    void conectarCierre();
  })
  .catch((e: unknown) => {
    const info = {
      baseId: "",
      dirDatos: "",
      rutaBd: "",
      portable: false,
      versionEsquema: 0,
      error: String(e),
    };
    createApp(PantallaError, { info }).use(i18n).mount("#app");
  });
