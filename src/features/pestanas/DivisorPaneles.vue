<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { nuevaProporcion, proporcionDelPuntero } from "./divisor";
import { PROPORCION_MAX, PROPORCION_MIN, type Division } from "./pestanas";

// Entre los dos paneles: se arrastra, o con el foco se mueve con las flechas, Inicio y Fin; un doble clic lo centra.
// `proporcion` es lo que ocupa el panel principal.
const props = defineProps<{ orientacion: Division["orientacion"]; proporcion: number }>();
const emit = defineEmits<{ "update:proporcion": [proporcion: number] }>();
const { t } = useI18n();
const porcentaje = (p: number) => Math.round(p * 100);

function mover(e: Event, accion: string) {
  const p = nuevaProporcion(accion, props.proporcion);
  if (p === null) return;
  e.preventDefault();
  emit("update:proporcion", p);
}
// Con el puntero capturado, el arrastre sigue aunque pase sobre un panel (o fuera de la ventana).
function agarrar(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function arrastrar(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  if (!el.hasPointerCapture(e.pointerId) || !el.parentElement) return;
  const caja = el.parentElement.getBoundingClientRect();
  emit("update:proporcion", proporcionDelPuntero(props.orientacion, { x: e.clientX, y: e.clientY }, caja));
}
</script>

<template>
  <!-- Lado a lado, la línea es vertical. El área para agarrarla es más ancha que la línea (el ::after). -->
  <div
    role="separator"
    tabindex="0"
    :aria-label="t('pestanas.divisor')"
    :aria-orientation="orientacion === 'horizontal' ? 'vertical' : 'horizontal'"
    :aria-valuenow="porcentaje(proporcion)"
    :aria-valuemin="porcentaje(PROPORCION_MIN)"
    :aria-valuemax="porcentaje(PROPORCION_MAX)"
    class="relative z-10 shrink-0 touch-none bg-border select-none after:absolute hover:bg-primary focus-visible:bg-primary focus-visible:outline-2 focus-visible:outline-ring"
    :class="
      orientacion === 'horizontal'
        ? 'w-1 cursor-col-resize after:inset-y-0 after:-inset-x-1'
        : 'h-1 cursor-row-resize after:inset-x-0 after:-inset-y-1'
    "
    @keydown="mover($event, $event.key)"
    @dblclick="mover($event, 'dblclick')"
    @pointerdown.left="agarrar"
    @pointermove="arrastrar"
  />
</template>
