import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { ladoAbrir, ladoCerrar } from "@/db/cliente";
import { paletaAbierta } from "@/features/atajos/useAtajos";
import { mensajeOrganizacion } from "@/features/respaldos/respaldos";
import { useTema } from "@/features/tema/useTema";
import { i18n } from "@/i18n";
import { filtrarMensaje, type MensajeLado, type MensajePadre, type TeclaLado } from "@/lado/mensajes";
import { VISTAS_LADO } from "@/lado/modo";
import { useOrganizaciones } from "@/stores/organizaciones";
import { caben, type Memoria } from "./memoriaLado";
import { RUTA_INICIO } from "./pestanas";
import { irConFoco, registrarRouter, routerDel } from "./routerConFoco";
import { ID_PANEL, abrirEnPestanaNueva, usePestanas } from "./usePestanas";

/** Cuánto espera el panel antes de copiar: al pasar rápido por varias pestañas (Ctrl+Tab) solo copia la última. */
export const ESPERA_COPIA = 300;

/** La ruta con que se abre el iframe: la de la pestaña si es una vista que se ve al lado; si no, el Árbol. */
const rutaLado = (ruta: string, nombre: unknown): string =>
  VISTAS_LADO.includes(String(nombre)) ? ruta : RUTA_INICIO;

/** La dirección del iframe: la app en modo lado con la otra, en `rutaLado`. */
export const srcLado = (camino: string, org: string, ruta: string, nombre: unknown): string =>
  `${camino}?lado=${org}#${rutaLado(ruta, nombre)}`;

/** El foco al panel principal, como F6 en él. */
function alPrincipal() {
  usePestanas().enfocarPanel("principal");
  document.getElementById(ID_PANEL.principal)?.focus();
}

/** Una tecla que el iframe le pasa a la ventana: lo mismo que con el foco en el panel de al lado. */
function atenderTecla(tecla: TeclaLado) {
  if (tecla === "F6") return alPrincipal();
  const pestanas = usePestanas();
  pestanas.enfocarPanel("lado");
  if (tecla === "paleta") paletaAbierta.value = true;
  else if (tecla === "nuevaPestana") abrirEnPestanaNueva(RUTA_INICIO);
  else if (tecla === "cerrarPestana") pestanas.cerrar();
  else pestanas.siguiente(tecla === "pestanaSiguiente" ? 1 : -1);
}

/**
 * Lo que dice el iframe: la ruta a la que llegó (`alLlegar`), que recibió el foco, lo que no se ve al lado (se abre en
 * el principal) y las teclas que son de la ventana.
 */
export function atenderMensaje(m: MensajeLado, alLlegar: (ruta: string) => void): void {
  if (m.tipo === "boldo-lado-ruta") return alLlegar(m.ruta);
  if (m.tipo === "boldo-lado-foco") return usePestanas().enfocarPanel("lado");
  if (m.tipo === "boldo-lado-tecla") return atenderTecla(m.tecla);
  alPrincipal();
  void irConFoco(m.ruta);
}

const VACIA = { render: () => null };

/**
 * El router del panel de al lado con otra organización. No muestra vistas (las muestra el iframe): sigue su ruta, para
 * que el menú lateral marque la suya y para que lo que no es de un panel (menú lateral, paleta) navegue ahí. Lo que navega
 * aquí se le pide al iframe (`enviar`) y queda en la pestaña; lo que no se ve al lado va al principal, que pasa a tener
 * el foco. `llego` es una ruta a la que el iframe ya llegó: no se le vuelve a pedir.
 */
export function crearRouterOtra(inicial: string, enviar: (ruta: string) => void) {
  const pestanas = usePestanas();
  // La de ahora: si deja de estar al lado, una navegación que termina después no escribe en la que llegó.
  const id = pestanas.lado;
  const principal = routerDel("principal");
  const r = createRouter({
    history: createMemoryHistory(),
    routes: principal.getRoutes().map(({ path, name, meta }) => ({ path, name, meta, component: VACIA })),
  });
  let yaEnElIframe: string | null = inicial;
  r.beforeEach((to) => {
    if (VISTAS_LADO.includes(String(to.name))) return true;
    pestanas.enfocarPanel("principal");
    void principal.push(to.fullPath);
    return false;
  });
  r.afterEach((to, _de, fallo) => {
    const ya = yaEnElIframe;
    yaEnElIframe = null;
    if (fallo || pestanas.lado !== id) return;
    pestanas.rutaDelLado(to.fullPath, true);
    if (to.fullPath !== ya) enviar(to.fullPath);
  });
  void r.replace(inicial);
  return {
    router: r as Router,
    llego(ruta: string) {
      yaEnElIframe = ruta;
      void r.replace(ruta);
    },
  };
}

const esCancelado = (e: unknown) =>
  typeof e === "object" && e !== null && "codigo" in e && e.codigo === "cancelado";

// Rust guarda una sola organización al lado: la copia siguiente espera a que se suelte la del panel que se fue, o ese
// cierre, si llega tarde, la soltaría (como `soltando` en comparar.ts).
let soltando: Promise<unknown> = Promise.resolve();

/**
 * El panel de al lado con la pestaña `id` de otra organización. Al montarse, tras `ESPERA_COPIA`, la copia en Rust
 * (`ladoAbrir`) y, si cabe en memoria o se acepta la pregunta, arma el iframe; al desmontarse la suelta. `ventana` es la
 * del iframe, para sus mensajes.
 */
export function useLadoOtra(id: string, ventana: () => unknown) {
  const pestanas = usePestanas();
  const organizaciones = useOrganizaciones();
  const { tema, acento, escala } = useTema();
  // El panel se vuelve a montar si cambia su pestaña o su modo: la organización es fija.
  const org = pestanas.lista.find((p) => p.id === id)?.org ?? "";
  const nombre = computed(
    () => organizaciones.lista.find((o) => o.id === org)?.nombre || i18n.global.t("barra.sinNombre"),
  );
  const estado = ref<"copiando" | "preguntando" | "listo" | "error">("copiando");
  const error = ref("");
  const src = ref("");
  // Decisión 12: con otro tema, idioma o escala, el iframe se vuelve a montar (key) en la ruta de ahora.
  const clave = computed(() => [tema.value, acento.value, escala.value, i18n.global.locale.value].join(" "));

  /** De Configuración, Ayuda o Acerca de, que no van al lado, la vista a la que vuelven. */
  function rutaDeLaPestana(): { ruta: string; nombre: unknown } {
    const p = pestanas.lista.find((x) => x.id === id);
    const ruta = p ? pestanas.rutaDeTrabajo(p) : RUTA_INICIO;
    return { ruta, nombre: routerDel("principal").resolve(ruta).name };
  }
  // Hasta que el iframe avisa la primera ruta, su app aún no escucha: lo que se le pida espera (solo lo último).
  let iframeListo = false;
  let pendiente: string | null = null;
  function pedir(ruta: string) {
    if (!iframeListo) return void (pendiente = ruta);
    const pedido: MensajePadre = { tipo: "boldo-lado-ir", ruta };
    (ventana() as Window | null | undefined)?.postMessage(pedido, location.origin);
  }
  function alLlegar(ruta: string) {
    if (!iframeListo) {
      iframeListo = true;
      if (pendiente !== null && pendiente !== ruta) pedir(pendiente);
      pendiente = null;
    }
    otra?.llego(ruta);
  }

  function armar() {
    const { ruta, nombre } = rutaDeLaPestana();
    // Un iframe nuevo, en la ruta de ahora (la pestaña ya tiene lo último pedido).
    iframeListo = false;
    pendiente = null;
    src.value = srcLado(location.pathname, org, ruta, nombre);
  }
  watch(clave, () => src.value && armar());

  function abrirIgual() {
    estado.value = "listo";
    armar();
  }
  let vivo = true;
  /**
   * El diálogo de memoria se cerró. «Abrir igual» también lo cierra, y antes de que corra su clic: se mira después, y si
   * no se eligió, es un «No» (el botón, Esc).
   */
  function alCerrarPregunta() {
    setTimeout(() => {
      if (vivo && estado.value === "preguntando") pestanas.cerrarDivision();
    });
  }

  let otra: ReturnType<typeof crearRouterOtra> | null = null;
  let quitarRouter = () => {};
  const alMensaje = (e: MessageEvent) => {
    const m = filtrarMensaje(e, ventana(), location.origin);
    if (m) atenderMensaje(m, alLlegar);
  };
  onMounted(async () => {
    window.addEventListener("message", alMensaje);
    const { ruta, nombre } = rutaDeLaPestana();
    otra = crearRouterOtra(rutaLado(ruta, nombre), pedir);
    quitarRouter = registrarRouter("lado", otra.router);
    await new Promise((listo) => setTimeout(listo, ESPERA_COPIA));
    if (!vivo) return;
    await soltando;
    if (!vivo) return;
    try {
      const info = await ladoAbrir(org);
      if (!vivo) return;
      if (caben(info, (performance as { memory?: Memoria }).memory)) abrirIgual();
      else estado.value = "preguntando";
    } catch (e) {
      // Reemplazada por otro pedido o un cierre: ya hay otro panel, o ninguno.
      if (!vivo || esCancelado(e)) return;
      error.value = mensajeOrganizacion(e);
      estado.value = "error";
    }
  });
  onBeforeUnmount(() => {
    vivo = false;
    window.removeEventListener("message", alMensaje);
    quitarRouter();
    // Nadie espera que se suelte: que quede rastro si falla.
    soltando = ladoCerrar().catch((e: unknown) =>
      console.warn("No se pudo soltar la organización de al lado:", e),
    );
  });

  return { nombre, estado, error, src, clave, abrirIgual, alCerrarPregunta };
}
