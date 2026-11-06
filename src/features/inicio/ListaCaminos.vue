<script setup lang="ts">
import type { Component } from "vue";
import { useI18n } from "vue-i18n";

// Las tarjetas para empezar de Inicio, sin datos (crear una organización, abrir un archivo, importar, explorar el ejemplo).
// Mientras `ocupado`, siguen con foco (aria-disabled) y quien las recibe no hace nada. Sin `fase`, el camino está disponible; con ella (solo con MOSTRAR_PROXIMAMENTE) se muestra deshabilitado con la fase en que llega.
export interface Camino {
  id: "vacia" | "archivo" | "excel" | "boldo" | "ejemplo";
  icono: Component;
  fase?: string;
}
defineProps<{ caminos: Camino[]; ocupado: boolean }>();
defineEmits<{ elegir: [camino: Camino, desde: EventTarget | null] }>();

const { t } = useI18n();
</script>

<template>
  <ul class="grid gap-3 sm:grid-cols-2">
    <li v-for="c in caminos" :key="c.id">
      <button
        :id="`bienvenida-camino-${c.id}`"
        type="button"
        :aria-disabled="c.fase || ocupado ? 'true' : undefined"
        class="flex h-full w-full flex-col gap-1 rounded-lg border p-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
        :class="[
          c.fase ? 'cursor-not-allowed text-muted-foreground' : 'not-aria-disabled:hover:bg-accent aria-disabled:opacity-50',
          c.id === 'vacia' && 'border-2 border-marca bg-card',
        ]"
        @click="$emit('elegir', c, $event.currentTarget)"
      >
        <span class="flex items-center gap-2 font-medium">
          <component
            :is="c.icono"
            class="size-4 shrink-0"
            :class="c.id === 'vacia' && 'text-marca-texto'"
            aria-hidden="true"
          />
          {{ t(`bienvenida.${c.id}.titulo`) }}
          <span v-if="c.fase" class="ml-auto rounded-full border px-2 text-xs font-normal">{{
            t(c.fase)
          }}</span>
        </span>
        <span class="text-sm" :class="{ 'text-muted-foreground': !c.fase }">
          {{ t(`bienvenida.${c.id}.texto`) }}
        </span>
      </button>
    </li>
  </ul>
</template>
