<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useWindowSize } from "@vueuse/core";
import { ArrowLeftRight, ChartColumn, GitBranch, Info, Network, Settings, Users } from "@lucide/vue";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import BarraSuperior from "@/components/BarraSuperior.vue";
import { ANCHO_COLAPSO, barraColapsada } from "@/app/estructura";
import icono from "../assets/brand/icono.png";

// Sin `to`, la entrada aún no existe: se muestra deshabilitada con el aviso de la fase en que llega.
const navegacion = [
  { to: "/", etiqueta: "Árbol", icono: Network },
  { to: "/directorio", etiqueta: "Directorio", icono: Users },
  { etiqueta: "Indicadores", icono: ChartColumn, aviso: "Llega en la Fase 3" },
  { etiqueta: "Escenarios", icono: GitBranch, aviso: "Llega en la Fase 5" },
  { etiqueta: "Importar/Exportar", icono: ArrowLeftRight, aviso: "Llega en las Fases 4 y 5" },
  { to: "/configuracion", etiqueta: "Configuración", icono: Settings },
  { to: "/acerca", etiqueta: "Acerca de", icono: Info },
];

const route = useRoute();
const { width } = useWindowSize();
const manual = ref<boolean | null>(null);
const colapsada = computed(() => barraColapsada(width.value, manual.value));
// Al cruzar los 1100 px vuelve a mandar el ancho.
watch(
  () => width.value < ANCHO_COLAPSO,
  () => (manual.value = null),
);
</script>

<template>
  <TooltipProvider>
    <div v-if="route.meta.sinMarco" class="h-screen overflow-auto bg-background text-foreground">
      <RouterView />
    </div>
    <div v-else class="flex h-screen bg-background text-foreground">
      <nav
        class="flex shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground"
        :class="colapsada ? 'w-14' : 'w-56'"
        aria-label="Navegación principal"
      >
        <p class="flex items-center gap-2 px-1 pb-3 text-base font-semibold tracking-tight">
          <img :src="icono" alt="" class="size-6 shrink-0" />
          <span v-if="!colapsada">Boldo<span class="text-marca">Atlas</span></span>
          <span v-else class="sr-only">BoldoAtlas</span>
        </p>
        <Tooltip v-for="item in navegacion" :key="item.etiqueta" :disabled="!colapsada && !item.aviso">
          <TooltipTrigger as-child>
            <RouterLink
              v-if="item.to"
              :to="item.to"
              :aria-label="colapsada ? item.etiqueta : undefined"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
              active-class="bg-sidebar-accent font-medium"
            >
              <component :is="item.icono" class="size-4 shrink-0" aria-hidden="true" />
              <span v-if="!colapsada">{{ item.etiqueta }}</span>
            </RouterLink>
            <button
              v-else
              type="button"
              aria-disabled="true"
              :aria-label="colapsada ? item.etiqueta : undefined"
              class="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <component :is="item.icono" class="size-4 shrink-0" aria-hidden="true" />
              <span v-if="!colapsada">{{ item.etiqueta }}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{{ item.aviso ?? item.etiqueta }}</TooltipContent>
        </Tooltip>
      </nav>
      <div class="flex min-w-0 flex-1 flex-col">
        <BarraSuperior :colapsada="colapsada" @alternar-barra="manual = !colapsada" />
        <main class="min-h-0 flex-1 overflow-auto">
          <RouterView />
        </main>
      </div>
    </div>
    <Toaster />
  </TooltipProvider>
</template>
