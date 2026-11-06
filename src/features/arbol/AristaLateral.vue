<script setup lang="ts">
import { computed, inject, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { EdgeLabelRenderer, useVueFlow } from "@vue-flow/core";
import { useOrganizacion } from "@/stores/organizacion";
import { CONTEXTO_LIENZO } from "./contexto";
import {
  acotarPista,
  caminoSvg,
  escalaMaxEtiqueta,
  escalaPunta,
  puntaFlecha,
  type Caja,
  type Punto,
} from "./lateral";
import { ventanaConexion } from "./useLienzo";
import { useVista } from "./useVista";

// Conexión lateral: la línea va por donde dijo trazarLaterales, no de una tarjeta a otra. Sobre la línea hay un botón: su
// descripción, abreviada si es larga, o un punto si no tiene o si el trazado no le halló lugar. Al pasar por la línea o por el
// botón, o al enfocarlo, se ve completa y encima de todo. La punta de flecha marca el destino. En ligero: la línea continua y solo
// el punto, sin flecha (el sentido lo dice la pista). Clic en la línea o en el botón: la ventanita de la conexión.
const props = defineProps<{ id: string; etiqueta?: string; descripcion?: string; sentido?: string }>();
const { t } = useI18n();
const org = useOrganizacion();
const { trazados, cajas, relacionesActivas, ligera } = inject(CONTEXTO_LIENZO)!;
const { viewport, panBy } = useVueFlow();
const { config } = useVista();

const trazado = computed(() => trazados.value.get(props.id));
const d = computed(() => trazado.value && caminoSvg(trazado.value.puntos));
const boton = ref<HTMLElement | null>(null);
// La zona de clic mide 16 px en pantalla con cualquier zoom. Directo en la línea y no con :style ni con una variable CSS: esto
// no vuelve a pintar el componente, y una variable en un ancestro común recalcula el estilo de todas las tarjetas en cada tick
// (27 ms con 973 tarjetas, contra 0,2 ms así).
const zona = ref<SVGPathElement | null>(null);
watchEffect(() => zona.value?.style.setProperty("stroke-width", `${16 / viewport.value.zoom}px`));
// La punta crece al alejar. Igual que la zona, directo en su elemento; y solo si su escala cambió, que a zoom normal es nunca.
const punta = ref<SVGPathElement | null>(null);
const crecePunta = computed(() => escalaPunta(viewport.value.zoom));
watchEffect(() => {
  if (punta.value && trazado.value)
    punta.value.setAttribute("d", puntaFlecha(trazado.value.puntos, crecePunta.value) ?? "");
});
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
// Activa se lee a su tamaño en la pantalla, aunque el lienzo esté alejado: solo esta línea paga el cambio.
const escalaBoton = computed(() =>
  activa.value ? Math.max(escala.value, 1 / viewport.value.zoom) : escala.value,
);
const texto = computed(() =>
  activa.value || (!ligera.value && trazado.value?.conTexto) ? props.etiqueta : undefined,
);
const accion = computed(() => t(org.fechaVista ? "arbol.lateral.clicVer" : "arbol.lateral.clicEditar"));
// La pista va fuera del lienzo, sobre tarjetas y paneles. Junto al puntero o, con el teclado, junto al botón, sin cubrirlo. Dice el
// sentido; la descripción, solo si no está a la vista. El botón se lee después de pintar: al activarse cambia de tamaño.
const pista = ref<HTMLElement | null>(null);
const medida = ref({ ancho: 0, alto: 0 });
const cajaBoton = ref<Caja | null>(null);
const botonALaVista = ref(true);
const origenLienzo = ref<Punto>({ x: 0, y: 0 });
watch(
  () => activa.value && [texto.value, viewport.value],
  () => {
    if (!activa.value || !boton.value) return;
    const b = boton.value.getBoundingClientRect();
    const v = boton.value.closest(".vue-flow")!.getBoundingClientRect();
    cajaBoton.value = { x: b.x, y: b.y, ancho: b.width, alto: b.height };
    botonALaVista.value = b.left < v.right && b.right > v.left && b.top < v.bottom && b.bottom > v.top;
    origenLienzo.value = { x: v.x, y: v.y };
  },
  { flush: "post" },
);
const textoPista = computed(
  () => `${botonALaVista.value ? props.sentido : props.descripcion} · ${accion.value}`,
);
watch(
  [pista, textoPista],
  ([el]) => el && (medida.value = { ancho: el.offsetWidth, alto: el.offsetHeight }),
  { flush: "post" },
);
// Las tarjetas en la pantalla: solo se calculan para la línea activa, y una vez por movimiento del lienzo.
const tarjetas = computed(() => {
  const { x, y, zoom } = viewport.value;
  return [...(cajas.value?.values() ?? [])].map((c) => ({
    x: c.x * zoom + x + origenLienzo.value.x,
    y: c.y * zoom + y + origenLienzo.value.y,
    ancho: c.ancho * zoom,
    alto: c.alto * zoom,
  }));
});
const lugarPista = computed(() => {
  const ancla = puntero.value ? { ...puntero.value, ancho: 0, alto: 0 } : cajaBoton.value;
  if (!ancla) return undefined;
  const ventana = { ancho: innerWidth, alto: innerHeight };
  const { x, y } = acotarPista(ancla, medida.value, ventana, cajaBoton.value, tarjetas.value);
  return `translate(${x}px, ${y}px)`;
});

const abrir = (ancla: DOMRect) => (ventanaConexion.value = { id: props.id, ancla, foco: boton.value });
// Abierta con el puntero, el foco que vuelve al cerrar no activa la etiqueta, aunque Esc lo haga contar como :focus-visible: quedaría
// desplegada con el puntero lejos. El que llega desde otro elemento sí, porque es Tab.
let abiertaConPuntero = false;
function alEnfocar(e: FocusEvent) {
  const desdeOtro = e.relatedTarget instanceof Element && !e.relatedTarget.closest("[role='dialog']");
  enfocada.value = (!abiertaConPuntero || desdeOtro) && (e.target as Element).matches(":focus-visible");
  abiertaConPuntero = false;
}
// `detail` 0: pulsado con el teclado, que no tiene punto donde abrir. Se fija el lugar: el botón puede rehacerse mientras tanto.
function alPulsar(e: MouseEvent) {
  abiertaConPuntero = !!e.detail;
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
  if (presion && !arrastrando) {
    abiertaConPuntero = true;
    abrir(new DOMRect(e.clientX, e.clientY, 0, 0));
  }
  presion = null;
}
</script>

<template>
  <path
    v-if="d"
    :d="d"
    class="vue-flow__edge-path pointer-events-none"
    :class="atenuada && '[stroke-opacity:.2]'"
    :style="{
      stroke: 'var(--marca)',
      strokeWidth: resaltada ? 2.5 : 1.25,
      strokeDasharray: ligera || activa ? undefined : '6 4',
    }"
  />
  <path
    v-if="d && !ligera"
    ref="punta"
    class="pointer-events-none fill-marca"
    :class="atenuada && '[fill-opacity:.2]'"
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
      :data-activa="activa || undefined"
      class="nodrag nopan pointer-events-auto absolute top-0 left-0 cursor-pointer text-xs leading-[18px] focus-visible:outline-2 focus-visible:outline-ring"
      :class="[
        texto
          ? 'rounded border bg-background px-1.5 text-foreground'
          : 'grid size-5 place-items-center rounded-full',
        texto && !activa && 'max-w-48 truncate',
        texto && activa && 'w-max max-w-80 text-left shadow-md ring-1 ring-marca',
        texto && (resaltada ? 'border-marca font-medium' : 'border-border'),
        activa && 'z-10',
      ]"
      :style="{
        transform: `translate(${trazado.etiqueta.x}px, ${trazado.etiqueta.y}px) translate(-50%, -50%) scale(${escalaBoton})`,
      }"
      :aria-label="`${descripcion}. ${accion}`"
      aria-haspopup="dialog"
      @pointerenter="sobreBoton = true"
      @pointerleave="sobreBoton = false"
      @focus="alEnfocar"
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
        class="pointer-events-none fixed top-0 left-0 z-50 w-max max-w-[min(24rem,calc(100vw-1rem))] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        :style="{ transform: lugarPista }"
        aria-hidden="true"
      >
        {{ textoPista }}
      </span>
    </Teleport>
  </EdgeLabelRenderer>
</template>
