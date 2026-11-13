<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useEventListener } from "@vueuse/core";
import { useVueFlow } from "@vue-flow/core";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import EditorConexion from "@/features/unidades/EditorConexion.vue";
import FilasConexion from "@/features/unidades/FilasConexion.vue";
import ListaUnidades from "@/features/unidades/ListaUnidades.vue";
import { excluidasParaConexion, filasDeConexiones, porQueNoSeVe } from "@/features/unidades/panel";
import { CONTEXTO_LIENZO } from "./contexto";
import { encuadreDeLinea, type Trazado } from "./lateral";
import { raizDelPanel, usePanel } from "@/features/pestanas/panel";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";

// La ventanita de las conexiones: una sola para todas, aquí y no dentro de cada línea. La abren la línea, «Conectar con…» de
// la tarjeta y del panel, y el lápiz del panel. Fuera de Vue Flow: nada de lo que pase en ella toca el lienzo.
const { t } = useI18n();
const org = useOrganizacion();
const { viewport, dimensions, setCenter } = useVueFlow();
const { trazados, mostradas } = inject(CONTEXTO_LIENZO)!;
const { colapsados, abrirRuta, ventanaConexion: ventana, verConexion } = useLienzo();
// Lo del lienzo se busca en su panel: con el mismo árbol en los dos, el botón de la línea está dos veces.
const { panel } = usePanel();
const buscar = (s: string) => raizDelPanel(panel).querySelector<HTMLElement>(s);
const { config } = useVista();

const editar = computed(() => (ventana.value && "id" in ventana.value ? ventana.value : null));
const conectar = computed(() => (ventana.value && "origen" in ventana.value ? ventana.value : null));
const yaConectadas = computed(() =>
  conectar.value ? filasDeConexiones(org.conexiones, org.porId, conectar.value.origen) : [],
);
const uid = useId();
// Al cerrarse sigue el último lugar: sin ancla, la ventana pasaría por la esquina de la pantalla.
const referencia = computed(() => {
  const a = ventana.value?.ancla ?? ultima.ancla;
  return a && { getBoundingClientRect: () => a };
});

const cerrar = () => (ventana.value = null);
// La ventana queda en un punto de la pantalla: al mover o acercar el lienzo ya no estaría junto a la línea. Lo escrito se
// guarda. Salvo que la mueva `mostrarLinea`, que además la lleva junto a la línea.
let moviendo = false;
watch(viewport, () => moviendo || cerrar());
onBeforeUnmount(cerrar);

let creando = false;
async function elegir(destino: string | null) {
  const v = conectar.value;
  if (!v || !destino || creando) return; // un doble clic o Enter repetido no crea dos
  creando = true;
  const r = await org.crearConexion(v.origen, destino);
  creando = false;
  if (!r.ok) return void toast.error(r.mensaje);
  if (ventana.value === v) abrirConexion(r.id!);
  verConexion.value = r.id!;
}
// Se llegó desde esa unidad: como en el panel, lo que se ofrece cambiar es la otra.
function abrirConexion(id: string) {
  const v = conectar.value;
  if (v) ventana.value = { id, fija: v.origen, ancla: v.ancla, foco: v.foco };
}

const cuadro = () => new Promise(requestAnimationFrame);
const botonDe = (id: string) => buscar(`[data-conexion="${CSS.escape(id)}"]`);

// El próximo layout trae la línea, si es que llega a dibujarse; con tope por si nunca.
function proximoTrazado(id: string) {
  return new Promise<Trazado | undefined>((listo) => {
    const parar = watch(trazados, (ts) => {
      if (ts.has(id)) terminar(ts.get(id));
    });
    const plazo = setTimeout(() => terminar(undefined), 10000);
    function terminar(t: Trazado | undefined) {
      parar();
      clearTimeout(plazo);
      listo(t);
    }
  });
}

/** Mueve el lienzo lo necesario para ver la línea; la ventanita, si es de esta conexión, queda junto a ella. */
async function mostrarLinea(id: string, trazado: Trazado) {
  const destino = encuadreDeLinea(trazado.puntos, viewport.value, dimensions.value);
  if (destino) {
    moviendo = true;
    await setCenter(destino.x, destino.y, { zoom: destino.zoom });
    await nextTick();
    moviendo = false;
  }
  await cuadro();
  await cuadro();
  const boton = botonDe(id);
  const v = editar.value;
  if (boton && v?.id === id) ventana.value = { ...v, ancla: boton.getBoundingClientRect() };
  // «Ver en el diagrama» desaparece al pulsarlo: el foco no se pierde.
  if (document.activeElement !== document.body) return;
  if (v)
    document.querySelector<HTMLElement>("[role='dialog'][data-state='open'] :is(input, button)")?.focus();
  else boton?.focus();
}

// Solo actúa si una de sus unidades está en una rama plegada; en cualquier otro caso no se abre nada por sí solo.
watch(verConexion, async (id) => {
  if (!id) return;
  verConexion.value = null;
  const c = org.conexiones.find((x) => x.id === id);
  if (!c || !config.value.relacionesLaterales) return;
  const motivos = [c.origen_id, c.destino_id].map((u) => porQueNoSeVe(mostradas.value, colapsados.value, u));
  if (!motivos.includes("plegada") || motivos.includes("fuera")) return;
  const viene = proximoTrazado(id);
  abrirRuta(c.origen_id);
  abrirRuta(c.destino_id);
  const trazado = await viene;
  if (trazado) await mostrarLinea(id, trazado);
});

// El foco vuelve a quien abrió; si ya no está (la barra de la tarjeta, una conexión eliminada), a su línea, al panel o a la
// tarjeta de una de sus unidades. Al cerrarse `ventana` ya está vacía: se decide con lo último que hubo.
let ultima: { foco: HTMLElement | null; ancla?: DOMRect; id?: string; unidad?: string } = { foco: null };
watch(
  ventana,
  (v) => {
    if (!v) return;
    const id = "id" in v ? v.id : undefined;
    const unidad = "origen" in v ? v.origen : org.conexiones.find((c) => c.id === id)?.origen_id;
    ultima = { foco: v.foco, ancla: v.ancla, id, unidad };
  },
  { flush: "sync" },
);
function alCerrar(e: Event) {
  e.preventDefault();
  const activo = document.activeElement;
  if (activo && activo !== document.body && !activo.closest("[role='dialog']")) return; // un clic afuera ya lo llevó a otro lado
  const { foco, id, unidad } = ultima;
  const destino =
    (foco !== document.body && foco?.isConnected && foco) ||
    (id && botonDe(id)) ||
    buscar("[data-panel-unidad]") ||
    (unidad && buscar(`.vue-flow__node[data-id="${CSS.escape(unidad)}"] button`));
  if (destino) destino.focus();
  if (id && !foco?.closest("[data-panel-unidad]")) esperarDibujo(id);
}

// Lo escrito al cerrar puede cambiar la línea: el próximo dibujo rehace su botón y el foco caería en body. Hasta ese dibujo se
// lo devuelve, salvo que antes pase otra cosa (un clic, o el plazo si la escritura no cambió nada).
let volverA: string | null = null;
let plazoVolver: ReturnType<typeof setTimeout> | undefined;
const olvidarVuelta = () => {
  volverA = null;
  clearTimeout(plazoVolver);
};
function esperarDibujo(id: string) {
  olvidarVuelta();
  volverA = id;
  plazoVolver = setTimeout(olvidarVuelta, 10000);
}
useEventListener(window, "pointerdown", olvidarVuelta, { capture: true });
onBeforeUnmount(olvidarVuelta);
watch(trazados, async () => {
  const id = volverA;
  if (!id) return;
  olvidarVuelta();
  await nextTick();
  await cuadro();
  await cuadro();
  if (document.activeElement === document.body) botonDe(id)?.focus();
});
</script>

<template>
  <Popover :open="!!ventana" @update:open="(abierta) => abierta || cerrar()">
    <PopoverAnchor :reference="referencia" class="hidden" />
    <PopoverContent
      side="bottom"
      align="center"
      :collision-padding="8"
      class="max-h-(--reka-popover-content-available-height) data-closed:hidden"
      :class="conectar ? 'gap-0 overflow-hidden p-0' : 'overflow-y-auto p-3'"
      :aria-label="t(conectar ? 'unidad.conectarCon' : 'conexion.ventana')"
      @close-auto-focus="alCerrar"
    >
      <EditorConexion v-if="editar" :id="editar.id" :key="editar.id" :fija="editar.fija" @cerrar="cerrar" />
      <template v-else-if="conectar">
        <h2 class="shrink-0 px-2.5 pt-2.5 pb-1 text-sm font-semibold">
          {{ t("conexion.conectarTitulo", { nombre: org.porId.get(conectar.origen)?.nombre }) }}
        </h2>
        <!-- Las dos listas se reparten el alto que haya y cada una se desplaza: la ventana no se sale de la pantalla. -->
        <section
          v-if="yaConectadas.length"
          class="flex max-h-60 min-h-20 flex-col gap-1 border-b px-2.5 pb-2"
          :aria-labelledby="`${uid}-ya`"
        >
          <h3 :id="`${uid}-ya`" class="shrink-0 text-xs font-medium text-muted-foreground">
            {{ t("conexion.yaConectada") }} ({{ yaConectadas.length }})
          </h3>
          <FilasConexion
            pulsable
            class="min-h-0 overflow-y-auto"
            :filas="yaConectadas"
            :aria-labelledby="`${uid}-ya`"
            @abrir="abrirConexion"
          />
          <p v-if="!config.relacionesLaterales" class="shrink-0 text-xs text-muted-foreground">
            {{ t("unidad.relacionesApagadas") }}
          </p>
        </section>
        <ListaUnidades
          v-if="!org.soloLectura"
          class="min-h-0"
          :excluidas="excluidasParaConexion(org.conexiones, conectar.origen)"
          @elegir="elegir"
        />
      </template>
    </PopoverContent>
  </Popover>
</template>
