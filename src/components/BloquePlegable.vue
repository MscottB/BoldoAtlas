<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { usePlegable } from "@/lib/plegable";

// El bloque plegable de toda la app: un <details> (el resumen entra al orden de Tab y abre con Enter o Espacio).
// `clave` es la preferencia por PC; `abrir` lo abre mientras haga falta (error, dato puesto, destino de un salto).
const props = defineProps<{ clave: string; titulo?: string; abrir?: boolean }>();
const { abierto, alPlegar } = usePlegable(props.clave, () => !!props.abrir);
</script>

<template>
  <details
    class="group/plegable"
    :open="abierto"
    @toggle="alPlegar(($event.target as HTMLDetailsElement).open)"
  >
    <summary
      class="flex cursor-pointer list-none items-center gap-1 rounded-md py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
    >
      <ChevronRight
        class="size-4 shrink-0 transition-transform group-open/plegable:rotate-90"
        aria-hidden="true"
      />
      <slot name="titulo">{{ titulo }}</slot>
    </summary>
    <slot />
  </details>
</template>
