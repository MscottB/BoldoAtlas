<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronRight } from "@lucide/vue";
import { marcaTenue, textoSobre } from "@/features/tema/tema";
import { useTema } from "@/features/tema/useTema";
import { useVista } from "./useVista";

/** Una fila de la leyenda: una marca (con código) o una entrada de leyenda de puestos (con descripción). */
export interface EntradaLeyenda {
  clave: string;
  color: string | null;
  codigo?: string | null;
  nombre: string;
  descripcion?: string | null;
}

defineProps<{ titulo: string; entradas: EntradaLeyenda[] }>();
const { t } = useI18n();
const { config } = useVista();
const { oscuro } = useTema();
</script>

<template>
  <!-- Franja fija bajo el lienzo (no flota sobre las tarjetas): una fila que se desplaza a lo ancho; plegada, una línea. -->
  <section
    class="flex shrink-0 items-center gap-3 border-t bg-card px-2 text-xs text-card-foreground"
    :aria-label="titulo"
  >
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded-md px-1 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-ring"
      :aria-expanded="config.leyenda"
      :title="t(config.leyenda ? 'arbol.vista.ocultarLeyenda' : 'arbol.vista.mostrarLeyenda')"
      @click="config.leyenda = !config.leyenda"
    >
      <component :is="config.leyenda ? ChevronDown : ChevronRight" class="size-3.5" aria-hidden="true" />
      {{ titulo }}
    </button>
    <!-- Con el teclado se llega a la fila para desplazarla si no cabe; con nombre, para que el foco diga dónde está. -->
    <ul
      v-if="config.leyenda"
      tabindex="0"
      :aria-label="t('arbol.vista.filaLeyenda', { titulo })"
      class="flex min-w-0 items-center gap-3 overflow-x-auto rounded-md py-1.5 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <li
        v-for="e in entradas"
        :key="e.clave"
        class="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
        :title="e.descripcion ?? undefined"
      >
        <span
          class="grid h-4 min-w-6 place-items-center rounded border px-1 text-[10px] font-semibold"
          :class="[
            !e.color && 'bg-muted',
            e.color && marcaTenue(e.color, oscuro) && 'border-muted-foreground',
          ]"
          :style="e.color ? { background: e.color, color: textoSobre(e.color) } : undefined"
          >{{ e.codigo }}</span
        >
        {{ e.nombre }}
        <span v-if="e.descripcion" class="sr-only">{{ e.descripcion }}</span>
      </li>
    </ul>
  </section>
</template>
