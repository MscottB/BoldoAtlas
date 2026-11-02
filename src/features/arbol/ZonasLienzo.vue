<script setup lang="ts">
import type { Recuadro } from "./zonas";

// Va en el slot zoom-pane de Vue Flow: se mueve y escala con el lienzo sin pasar por los nodos. Detrás de líneas y tarjetas, y
// sin recibir el puntero, para no estorbar arrastrar ni seleccionar.
defineProps<{ recuadros: Recuadro[]; ligera: boolean }>();
</script>

<template>
  <div class="pointer-events-none absolute top-0 left-0 -z-10">
    <div
      v-for="{ zona, caja } in recuadros"
      :key="zona.id"
      class="absolute rounded-xl border-2"
      :style="{
        left: `${caja.x}px`,
        top: `${caja.y}px`,
        width: `${caja.ancho}px`,
        height: `${caja.alto}px`,
        borderColor: zona.color,
        background: `color-mix(in srgb, ${zona.color} 10%, transparent)`,
      }"
      data-zona
    >
      <span
        class="absolute bottom-full left-1 max-w-full truncate font-medium text-foreground"
        :class="ligera ? 'text-2xl' : 'text-xs'"
      >
        {{ zona.nombre }}
      </span>
    </div>
  </div>
</template>
