import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useEventListener } from "@vueuse/core";
import { useVista } from "@/features/arbol/useVista";
import { unidadesDeRama } from "@/features/arbol/layout";
import { useLienzo } from "@/features/arbol/useLienzo";
import { esVistaCerrable } from "@/app/estructura";
import { useCerrarVista } from "@/app/useCerrarVista";
import { useOrganizacion } from "@/stores/organizacion";
import { destinoNavegacion, resolverAtajo, type Navegacion } from "./atajos";

/** Si la paleta de comandos (Ctrl+K) está abierta. La abren el atajo y el botón de la barra superior. */
export const paletaAbierta = ref(false);

const CAMPO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
// Diálogos, menús y listas abiertos (Reka UI los marca con role y data-state): mandan ellos sobre el teclado.
const MODAL =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]';
// El lienzo y el panel de la unidad atienden su propio Esc. Las flechas valen con el foco suelto, en el lienzo o en el
// panel mismo (no en sus pestañas ni campos, que las usan).
const LIENZO_O_PANEL = ".vue-flow, [data-panel-unidad]";

/** Atajos de teclado de la app. Se registra una sola vez, en App.vue. */
export function useAtajos() {
  const route = useRoute();
  const org = useOrganizacion();
  const cerrarVista = useCerrarVista();
  const { config } = useVista();
  const { seleccion, seleccionadas, nuevaHija, revelar, extender, duplicar, pedidoEliminar } = useLienzo();

  // Lo que se dibuja: el árbol completo o la rama enfocada (/?raiz=). Igual que VistaArbol.
  const mostradas = computed(() => {
    const raiz = route.query.raiz;
    return typeof raiz === "string" && org.enFecha.porId.has(raiz)
      ? unidadesDeRama(org.enFecha.unidades, raiz)
      : org.enFecha.unidades;
  });

  useEventListener(window, "keydown", (e: KeyboardEvent) => {
    if (route.meta.sinMarco || e.isComposing) return;
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
      modalAbierto: !!document.querySelector(MODAL),
      soloLectura: !!org.fechaVista,
      horizontal: config.value.direccion === "horizontal",
    });
    if (!atajo) return;

    if (atajo === "paleta") {
      e.preventDefault();
      paletaAbierta.value = true;
      return;
    }
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

    if (atajo === "cerrar") {
      // Dentro del lienzo o del panel, quien tiene el foco ya atiende Esc (p. ej. cancelar un renombrado).
      if (!destino?.closest(LIENZO_O_PANEL)) seleccion.value = null;
      return;
    }

    // Las flechas y el menú contextual valen con el foco suelto, en el lienzo o en el panel mismo.
    const libre =
      !destino ||
      destino === document.body ||
      destino.closest(".vue-flow") ||
      destino.matches("[data-panel-unidad]");

    if (atajo === "nuevaUnidad") {
      const raiz = route.query.raiz;
      void nuevaHija(typeof raiz === "string" ? raiz : null);
    } else if (atajo === "buscarLienzo") {
      document.querySelector<HTMLElement>("[data-buscar-lienzo]")?.focus();
    } else if (atajo === "eliminar") {
      if (!seleccion.value) return;
      pedidoEliminar.value++;
    } else if (atajo === "menuContextual") {
      // Sobre la tarjeta enfocada; si no, la seleccionada; si no, el fondo del lienzo. Se abre en su centro.
      if (!libre) return;
      const elegida = seleccion.value && `.vue-flow__node[data-id="${CSS.escape(seleccion.value)}"]`;
      const el =
        destino?.closest(".vue-flow__node") ??
        (elegida ? document.querySelector(elegida) : null) ??
        document.querySelector(".vue-flow__pane");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const centro = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...centro }));
    } else if (atajo === "duplicar") {
      // Con varias seleccionadas no hay una rama que duplicar. Ctrl+D se atiende igual (es «marcador» del navegador).
      if (seleccion.value && seleccionadas.value.size === 1) void duplicar(seleccion.value);
    } else {
      if (!libre) return;
      const extiende = atajo.startsWith("extender:");
      const id = destinoNavegacion(
        mostradas.value,
        seleccion.value,
        (extiende ? atajo.slice("extender:".length) : atajo) as Navegacion,
      );
      if (id) (extiende ? extender : revelar)(id);
    }
    e.preventDefault();
  });
}
