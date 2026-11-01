<script setup lang="ts">
import { computed, inject } from "vue";
import { EdgeLabelRenderer, useVueFlow } from "@vue-flow/core";
import { CONTEXTO_LIENZO } from "./contexto";
import { caminoSvg } from "./lateral";

// Conexión lateral: la línea va por donde dijo trazarLaterales, no de una tarjeta a otra. La etiqueta es HTML sobre la capa
// de tarjetas: con fondo, abreviada si es larga y completa al pasar o enfocarla. En ligero: la línea continua y sin etiqueta.
const props = defineProps<{ id: string; etiqueta?: string; descripcion?: string }>();
const { trazados, relacionesActivas, ligera } = inject(CONTEXTO_LIENZO)!;
const { viewport } = useVueFlow();

const trazado = computed(() => trazados.value.get(props.id));
const d = computed(() => trazado.value && caminoSvg(trazado.value.puntos));
const resaltada = computed(() => !!relacionesActivas.value?.has(props.id));
const atenuada = computed(() => !!relacionesActivas.value && !resaltada.value);
// Al encuadrar un árbol mediano el zoom baja de 1: la etiqueta se agranda lo justo para seguir leyéndose (con un tope).
const escala = computed(() => Math.min(2, Math.max(1, 0.75 / viewport.value.zoom)));
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
  <EdgeLabelRenderer v-if="trazado && etiqueta && !ligera">
    <span
      tabindex="0"
      role="note"
      class="nodrag nopan pointer-events-auto absolute top-0 left-0 max-w-48 cursor-default truncate rounded border bg-background px-1.5 text-xs leading-[18px] text-foreground hover:z-10 hover:max-w-none focus-visible:z-10 focus-visible:max-w-none focus-visible:outline-2 focus-visible:outline-ring"
      :class="[resaltada ? 'border-marca font-medium' : 'border-border', atenuada && 'opacity-30']"
      :style="{
        transform: `translate(${trazado.etiqueta.x}px, ${trazado.etiqueta.y}px) translate(-50%, -50%) scale(${escala})`,
      }"
      :title="etiqueta"
      :aria-label="descripcion"
    >
      {{ etiqueta }}
    </span>
  </EdgeLabelRenderer>
</template>
