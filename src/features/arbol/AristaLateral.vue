<script setup lang="ts">
import { computed, inject, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { EdgeLabelRenderer, useVueFlow } from "@vue-flow/core";
import { useOrganizacion } from "@/stores/organizacion";
import { CONTEXTO_LIENZO } from "./contexto";
import { acotarPista, caminoSvg, escalaMaxEtiqueta, puntaFlecha, type Punto } from "./lateral";
import { ventanaConexion } from "./useLienzo";
import { useVista } from "./useVista";

// Conexión lateral: la línea va por donde dijo trazarLaterales, no de una tarjeta a otra. Sobre la línea hay un botón (su
// descripción o, si no tiene, un punto) que es HTML sobre la capa de tarjetas: abreviado si es largo y completo al pasar o
// enfocarlo. La punta de flecha marca el destino. En ligero: la línea continua y solo el punto, sin flecha (el sentido lo dice
// la pista). Clic en la línea o en el botón: la ventanita de la conexión.
const props = defineProps<{ id: string; etiqueta?: string; descripcion?: string }>();
const { t } = useI18n();
const org = useOrganizacion();
const { trazados, relacionesActivas, ligera } = inject(CONTEXTO_LIENZO)!;
const { viewport, panBy } = useVueFlow();
const { config } = useVista();

const trazado = computed(() => trazados.value.get(props.id));
const d = computed(() => trazado.value && caminoSvg(trazado.value.puntos));
const punta = computed(() => trazado.value && puntaFlecha(trazado.value.puntos));
const boton = ref<HTMLElement | null>(null);
// La zona de clic mide 16 px en pantalla con cualquier zoom. Directo en la línea y no con :style ni con una variable CSS: esto
// no vuelve a pintar el componente, y una variable en un ancestro común recalcula el estilo de todas las tarjetas en cada tick
// (27 ms con 973 tarjetas, contra 0,2 ms así).
const zona = ref<SVGPathElement | null>(null);
watchEffect(() => zona.value?.style.setProperty("stroke-width", `${16 / viewport.value.zoom}px`));
const sobreBoton = ref(false);
const enfocada = ref(false);
// Dónde está el puntero sobre la línea, en la pantalla: ahí aparece la pista.
const puntero = ref<Punto | null>(null);
const activa = computed(() => sobreBoton.value || enfocada.value || !!puntero.value);
const resaltada = computed(() => activa.value || !!relacionesActivas.value?.has(props.id));
const atenuada = computed(() => !!relacionesActivas.value && !resaltada.value);
// Al encuadrar un árbol mediano el zoom baja de 1: la etiqueta se agranda para seguir leyéndose, hasta lo que el trazado reservó.
const escala = computed(() =>
  Math.min(escalaMaxEtiqueta(config.value.densidad), Math.max(1, 0.75 / viewport.value.zoom)),
);
const texto = computed(() => (ligera.value ? undefined : props.etiqueta));
const accion = computed(() => t(org.fechaVista ? "arbol.lateral.clicVer" : "arbol.lateral.clicEditar"));
// La pista va fuera del lienzo, sobre tarjetas y paneles. Junto al puntero o, con el teclado, junto al botón (que se mueve con
// el lienzo). Solo la línea activa llega a calcular esto.
const pista = ref<HTMLElement | null>(null);
const medida = ref({ ancho: 0, alto: 0 });
watch(pista, (el) => el && (medida.value = { ancho: el.offsetWidth, alto: el.offsetHeight }), {
  flush: "post",
});
function cajaBoton() {
  void viewport.value;
  const { x, y, width, height } = boton.value!.getBoundingClientRect();
  return { x, y, ancho: width, alto: height };
}
const lugarPista = computed(() => {
  const ancla = puntero.value ? { ...puntero.value, ancho: 0, alto: 0 } : cajaBoton();
  const { x, y } = acotarPista(ancla, medida.value, { ancho: innerWidth, alto: innerHeight });
  return `translate(${x}px, ${y}px)`;
});

const abrir = (ancla: DOMRect) => (ventanaConexion.value = { id: props.id, ancla, foco: boton.value });
// `detail` 0: pulsado con el teclado, que no tiene punto donde abrir. Se fija el lugar: el botón puede rehacerse mientras tanto.
function alPulsar(e: MouseEvent) {
  abrir(e.detail ? new DOMRect(e.clientX, e.clientY, 0, 0) : boton.value!.getBoundingClientRect());
}
// Vue Flow marca sus aristas `nopan`. Alejado, las franjas de clic cubrirían buena parte del lienzo y no se podría arrastrar desde
// ahí: arrastrar desde la línea mueve el lienzo aquí mismo. Un clic es presionar y soltar casi en el mismo lugar.
let presion: Punto | null = null;
let arrastrando = false;
function alPresionar(e: PointerEvent) {
  if (e.button) return;
  presion = { x: e.clientX, y: e.clientY };
  arrastrando = false;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}
function alMover(e: PointerEvent) {
  if (!presion) return void (puntero.value = { x: e.clientX, y: e.clientY });
  const delta = { x: e.clientX - presion.x, y: e.clientY - presion.y };
  if (!arrastrando && Math.hypot(delta.x, delta.y) < 5) return;
  arrastrando = true;
  puntero.value = null;
  panBy(delta);
  presion = { x: e.clientX, y: e.clientY };
}
function alSoltar(e: PointerEvent) {
  if (presion && !arrastrando) abrir(new DOMRect(e.clientX, e.clientY, 0, 0));
  presion = null;
}
</script>

<template>
  <path
    v-if="d"
    :d="d"
    class="vue-flow__edge-path pointer-events-none"
    :class="atenuada && 'opacity-20'"
    :style="{
      stroke: 'var(--marca)',
      strokeWidth: resaltada ? 2.5 : 1.25,
      strokeDasharray: ligera ? undefined : '6 4',
    }"
  />
  <path
    v-if="punta && !ligera"
    :d="punta"
    class="pointer-events-none fill-marca"
    :class="atenuada && 'opacity-20'"
  />
  <!-- La zona de clic: un trazo invisible, más ancho que la línea. También responde en ligero. -->
  <path
    v-if="d"
    ref="zona"
    :d="d"
    class="nodrag nopan cursor-pointer"
    fill="none"
    stroke="transparent"
    data-zona-conexion
    @pointermove="alMover"
    @pointerleave="puntero = null"
    @pointerdown="alPresionar"
    @pointerup="alSoltar"
    @pointercancel="presion = null"
  />
  <EdgeLabelRenderer v-if="trazado">
    <button
      ref="boton"
      type="button"
      :data-conexion="id"
      class="nodrag nopan absolute top-0 left-0 cursor-pointer text-xs leading-[18px] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
      :class="[
        texto
          ? 'max-w-48 truncate rounded border bg-background px-1.5 text-foreground hover:z-10 hover:max-w-none focus-visible:max-w-none'
          : 'grid size-5 place-items-center rounded-full',
        texto && (resaltada ? 'border-marca font-medium' : 'border-border'),
        atenuada && 'opacity-30',
        trazado.etiquetaTapa ? 'pointer-events-none' : 'pointer-events-auto',
      ]"
      :style="{
        transform: `translate(${trazado.etiqueta.x}px, ${trazado.etiqueta.y}px) translate(-50%, -50%) scale(${escala})`,
      }"
      :aria-label="`${descripcion}. ${accion}`"
      aria-haspopup="dialog"
      @pointerenter="sobreBoton = true"
      @pointerleave="sobreBoton = false"
      @focus="enfocada = true"
      @blur="enfocada = false"
      @click.stop="alPulsar"
    >
      <template v-if="texto">{{ texto }}</template>
      <span
        v-else
        class="block rounded-full bg-marca ring-2 ring-background"
        :class="resaltada ? 'size-3' : 'size-2.5'"
        aria-hidden="true"
      />
    </button>
    <Teleport v-if="activa && !ventanaConexion" to="body">
      <span
        ref="pista"
        class="pointer-events-none fixed top-0 left-0 z-50 w-max max-w-[min(20rem,calc(100vw-1rem))] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        :style="{ transform: lugarPista }"
        aria-hidden="true"
      >
        {{ descripcion }}. {{ accion }}
      </span>
    </Teleport>
  </EdgeLabelRenderer>
</template>
