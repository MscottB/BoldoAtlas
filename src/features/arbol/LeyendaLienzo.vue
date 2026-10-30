<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronUp } from "@lucide/vue";
import { textoSobre } from "@/features/tema/tema";
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
</script>

<template>
  <section
    class="absolute bottom-3 left-3 z-10 max-w-64 rounded-lg border bg-card text-xs text-card-foreground"
    :aria-label="titulo"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-ring"
      :aria-expanded="config.leyenda"
      :title="t(config.leyenda ? 'arbol.vista.ocultarLeyenda' : 'arbol.vista.mostrarLeyenda')"
      @click="config.leyenda = !config.leyenda"
    >
      {{ titulo }}
      <component :is="config.leyenda ? ChevronDown : ChevronUp" class="size-3.5" aria-hidden="true" />
    </button>
    <ul v-if="config.leyenda" class="grid max-h-48 gap-1 overflow-y-auto px-2 pb-2">
      <li
        v-for="e in entradas"
        :key="e.clave"
        class="flex items-center gap-2"
        :title="e.descripcion ?? undefined"
      >
        <span
          class="grid h-4 min-w-6 place-items-center rounded border px-1 text-[10px] font-semibold"
          :class="!e.color && 'bg-muted'"
          :style="e.color ? { background: e.color, color: textoSobre(e.color) } : undefined"
          >{{ e.codigo }}</span
        >
        <span class="truncate">{{ e.nombre }}</span>
        <span v-if="e.descripcion" class="sr-only">{{ e.descripcion }}</span>
      </li>
    </ul>
  </section>
</template>
