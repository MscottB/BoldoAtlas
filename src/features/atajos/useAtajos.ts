import { ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { useVista } from "@/features/arbol/useVista";
import { unidadesDeRama } from "@/features/arbol/layout";
import { abrirMenuContextual, nodoEn, useLienzo } from "@/features/arbol/useLienzo";
import { esVistaCerrable } from "@/app/estructura";
import { MODO_LADO } from "@/lado/modo";
import { useCerrarVista } from "@/app/useCerrarVista";
import { raizDelPanel, usePanel } from "@/features/pestanas/panel";
import { RUTA_INICIO } from "@/features/pestanas/pestanas";
import { routerConFoco } from "@/features/pestanas/routerConFoco";
import { abrirEnPestanaNueva, usePestanas } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import { dentroDelPanel, destinoNavegacion, resolverAtajo, type Atajo, type Navegacion } from "./atajos";

/** Si la paleta de comandos (Ctrl+K) está abierta. La abren el atajo y el botón de la barra superior. */
export const paletaAbierta = ref(false);

const ATAJOS_PESTANAS = new Set<Atajo>([
  "nuevaPestana",
  "cerrarPestana",
  "pestanaSiguiente",
  "pestanaAnterior",
]);
const CAMPO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
// Diálogos, menús y listas abiertos (Reka UI los marca con role y data-state): mandan ellos sobre el teclado.
const MODAL =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]';
// El lienzo y el panel de la unidad atienden su propio Esc. Las flechas valen con el foco suelto, en el lienzo o en el
// panel mismo (no en sus pestañas ni campos, que las usan).
const LIENZO_O_PANEL = ".vue-flow, [data-panel-unidad]";

/**
 * Atajos de teclado de la app. Se registra una sola vez, en App.vue (y en AppLado, el iframe de al lado). Con la vista
 * dividida actúan en el panel con foco: su ruta, su lienzo y lo que se busca, dentro de él.
 */
export function useAtajos() {
  const org = useOrganizacion();
  const cerrarVista = useCerrarVista();
  const pestanas = usePestanas();
  const organizaciones = useOrganizaciones();
  const conFoco = usePanel();

  useEventListener(window, "keydown", (e: KeyboardEvent) => {
    // Ctrl+W nunca llega a la ventana (cerrarla o lo que haga el WebView), ni con un diálogo abierto.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") e.preventDefault();
    const route = routerConFoco().currentRoute.value;
    if (route.meta.sinMarco || e.isComposing) return;
    const panel = conFoco.panel;
    const { config } = useVista(panel);
    const destino = e.target instanceof Element ? e.target : null;

    // Con la paleta abierta solo Ctrl+K cuenta (la cierra); Esc y las flechas son de ella.
    if (paletaAbierta.value) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletaAbierta.value = false;
      }
      return;
    }

    const atajo = resolverAtajo({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      enCampoDeTexto: !!destino?.closest(CAMPO),
      enPanel: dentroDelPanel(destino),
      modalAbierto: !!document.querySelector(MODAL),
      soloLectura: org.soloLectura,
      horizontal: config.value.direccion === "horizontal",
      dividida: !!pestanas.lado,
      lado: MODO_LADO,
    });
    if (!atajo) return;

    if (atajo === "paleta") {
      e.preventDefault();
      paletaAbierta.value = true;
      return;
    }
    // Pestañas de trabajo: valen en cualquier vista del proyecto.
    if (ATAJOS_PESTANAS.has(atajo)) {
      e.preventDefault();
      if (atajo === "nuevaPestana") abrirEnPestanaNueva(RUTA_INICIO);
      else if (atajo === "cerrarPestana")
        pestanas.cerrar(); // la del panel con foco; la última no se cierra, salvo si no abrió
      else pestanas.siguiente(atajo === "pestanaSiguiente" ? 1 : -1);
      return;
    }
    // F6: el foco del teclado pasa al otro panel (el panel mismo lo recibe; desde ahí valen las flechas del lienzo).
    if (atajo === "otroPanel") {
      e.preventDefault();
      // En el iframe de al lado el otro panel es de la ventana: el padre le pasa el foco (mismo origen).
      if (MODO_LADO)
        return window.parent.postMessage({ tipo: "boldo-lado-tecla", tecla: "F6" }, location.origin);
      const otro = panel === "lado" ? "principal" : "lado";
      pestanas.enfocarPanel(otro);
      document.querySelector<HTMLElement>(`[data-panel="${otro}"]`)?.focus();
      return;
    }
    // La pantalla del motivo tapa la vista: la ruta sigue siendo de la abierta, y lo demás escribiría en ella sin verse.
    if (organizaciones.sinAbrir.has(conFoco.pestana())) return;
    // Esc en Configuración, Ayuda o Acerca de las cierra (salvo que se esté escribiendo; los diálogos ya mandaron arriba).
    if (atajo === "cerrar" && esVistaCerrable(route.name)) {
      if (!destino?.closest(CAMPO)) {
        cerrarVista();
        e.preventDefault();
      }
      return;
    }
    // Ctrl+0 (encuadrar) lo atiende la barra del lienzo. El resto solo vale sobre el árbol.
    if (atajo === "encuadrar" || route.name !== "arbol") return;
    const {
      seleccion,
      seleccionadas,
      editando,
      nuevaHija,
      revelar,
      extender,
      duplicar,
      pedidoEliminar,
      pedidoZoom,
    } = useLienzo(panel);
    const raizPanel = raizDelPanel(panel);

    if (atajo === "acercar" || atajo === "alejar") {
      e.preventDefault(); // en WebView2 cambiaría el zoom de la página
      pedidoZoom.value = atajo;
      return;
    }

    if (atajo === "cerrar") {
      // Dentro del lienzo o del panel, quien tiene el foco ya atiende Esc (p. ej. cancelar un renombrado).
      if (!destino?.closest(LIENZO_O_PANEL)) seleccion.value = null;
      return;
    }

    // Las flechas y el menú contextual valen con el foco suelto, en el lienzo, en el panel de la unidad o en el panel de
    // la vista dividida (al que lleva F6).
    const libre =
      !destino ||
      destino === document.body ||
      destino.closest(".vue-flow") ||
      destino.matches("[data-panel-unidad], [data-panel]");

    if (atajo === "nuevaUnidad") {
      const raiz = route.query.raiz;
      void nuevaHija(typeof raiz === "string" ? raiz : null);
    } else if (atajo === "buscarLienzo") {
      raizPanel.querySelector<HTMLElement>("[data-buscar-lienzo]")?.focus();
    } else if (atajo === "eliminar") {
      if (!seleccion.value) return;
      pedidoEliminar.value++;
    } else if (atajo === "menuContextual") {
      // Sobre la tarjeta enfocada; si no, la seleccionada; si no, el fondo del lienzo. Se abre en su centro.
      if (!libre) return;
      const el =
        destino?.closest(".vue-flow__node") ??
        (seleccion.value ? nodoEn(raizPanel, seleccion.value) : null) ??
        raizPanel.querySelector(".vue-flow__pane");
      if (!el) return;
      abrirMenuContextual(el);
    } else if (atajo === "renombrar") {
      // La unidad de la tarjeta enfocada; si no, la única seleccionada.
      const enfocada = destino?.closest<HTMLElement>(".vue-flow__node")?.dataset.id;
      const id = enfocada ?? (seleccionadas.value.size === 1 ? seleccion.value : null);
      if (!libre || !id || !org.enFecha.porId.has(id)) return; // un puesto no se renombra
      editando.value = id;
    } else if (atajo === "duplicar") {
      // Con varias seleccionadas no hay una rama que duplicar. Ctrl+D se atiende igual (es «marcador» del navegador).
      if (seleccion.value && seleccionadas.value.size === 1) void duplicar(seleccion.value);
    } else {
      if (!libre) return;
      const extiende = atajo.startsWith("extender:");
      // Lo que se dibuja: el árbol completo o la rama enfocada (/?raiz=). Igual que VistaArbol.
      const raiz = route.query.raiz;
      const mostradas =
        typeof raiz === "string" && org.enFecha.porId.has(raiz)
          ? unidadesDeRama(org.enFecha.unidades, raiz)
          : org.enFecha.unidades;
      const id = destinoNavegacion(
        mostradas,
        seleccion.value,
        (extiende ? atajo.slice("extender:".length) : atajo) as Navegacion,
      );
      if (id) (extiende ? extender : revelar)(id);
    }
    e.preventDefault();
  });
}
