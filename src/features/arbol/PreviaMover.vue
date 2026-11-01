<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useVueFlow } from "@vue-flow/core";
import type { Unidad } from "@/db/tipos";
import type { Caja, Punto } from "./lateral";
import type { EstadoMover } from "./useLienzo";

/** Lo que se ve mientras se arrastra una tarjeta. Sin `destino`, la tarjeta no está sobre otra. */
export interface Previa {
  destino?: Unidad;
  estado: EstadoMover | null;
  caja?: Caja;
  /** Donde quedaría; null si el movimiento no vale. */
  lugar: Punto | null;
  tam: { ancho: number; alto: number };
}

// Una capa aparte sobre el lienzo: no toca los nodos de Vue Flow, así que cuesta lo mismo con 20 tarjetas que con 2.000.
const props = defineProps<{ previa: Previa | null }>();
const { t } = useI18n();
const { viewport } = useVueFlow();

const color = computed(() =>
  props.previa?.estado === "valido"
    ? "var(--marca)"
    : props.previa?.estado === "ciclo"
      ? "var(--destructive)"
      : "var(--muted-foreground)",
);
// De la tarjeta destino al lugar previsto, por el borde más cercano.
const union = computed(() => {
  const { caja, lugar, tam } = props.previa ?? {};
  if (!caja || !lugar || !tam) return "";
  const abajo = lugar.y >= caja.y + caja.alto;
  const [x0, y0] = abajo
    ? [caja.x + caja.ancho / 2, caja.y + caja.alto]
    : [caja.x + caja.ancho, caja.y + caja.alto / 2];
  return `M ${x0} ${y0} L ${abajo ? lugar.x + tam.ancho / 2 : lugar.x} ${abajo ? lugar.y : lugar.y + tam.alto / 2}`;
});
const texto = computed(() => {
  const p = props.previa;
  if (!p) return "";
  return p.destino && p.estado
    ? t(`arbol.previa.${p.estado}`, { destino: p.destino.nombre })
    : t("arbol.previa.vacio");
});
</script>

<template>
  <svg class="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden="true">
    <g
      v-if="previa?.caja"
      :transform="`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`"
      data-previa-mover
    >
      <rect
        :x="previa.caja.x - 3"
        :y="previa.caja.y - 3"
        :width="previa.caja.ancho + 6"
        :height="previa.caja.alto + 6"
        rx="10"
        fill="none"
        :stroke="color"
        stroke-width="3"
        vector-effect="non-scaling-stroke"
      />
      <template v-if="previa.lugar">
        <path
          :d="union"
          fill="none"
          :stroke="color"
          stroke-width="2"
          stroke-dasharray="6 4"
          vector-effect="non-scaling-stroke"
        />
        <rect
          :x="previa.lugar.x"
          :y="previa.lugar.y"
          :width="previa.tam.ancho"
          :height="previa.tam.alto"
          rx="8"
          fill="color-mix(in oklab, var(--marca) 15%, transparent)"
          :stroke="color"
          stroke-width="2"
          stroke-dasharray="6 4"
          vector-effect="non-scaling-stroke"
        />
      </template>
    </g>
  </svg>
  <div role="status" class="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center">
    <span
      v-if="previa"
      class="rounded-md border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-sm"
      :class="previa.estado === 'ciclo' && 'border-destructive text-destructive'"
      data-previa-texto
    >
      {{ texto }}
    </span>
  </div>
</template>
