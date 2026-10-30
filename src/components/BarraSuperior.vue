<script setup lang="ts">
import { computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { Download, Moon, PanelLeft, Search, Sun } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import IndicadorGuardado from "@/components/IndicadorGuardado.vue";
import { useOrganizacion } from "@/stores/organizacion";
import { useTema } from "@/features/tema/useTema";

defineProps<{ colapsada: boolean }>();
// "buscar" abre la paleta de comandos (Ctrl+K); lo atiende App.vue.
defineEmits<{ alternarBarra: []; buscar: [] }>();

const { t } = useI18n();
const org = useOrganizacion();
const { tema } = useTema();

// "sistema" no es un modo visible: el botón alterna hacia el opuesto del que se ve ahora.
const sistemaOscuro = useMediaQuery("(prefers-color-scheme: dark)");
const oscuro = computed(() => tema.value === "oscuro" || (tema.value === "sistema" && sistemaOscuro.value));
const etiquetaTema = computed(() => (oscuro.value ? t("barra.temaClaro") : t("barra.temaOscuro")));
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
    <Button
      variant="ghost"
      size="icon"
      :aria-label="colapsada ? t('barra.mostrarBarra') : t('barra.ocultarBarra')"
      :aria-expanded="!colapsada"
      @click="$emit('alternarBarra')"
    >
      <PanelLeft aria-hidden="true" />
    </Button>
    <p class="min-w-0 truncate text-sm font-semibold">{{ org.org.nombre || t("barra.sinNombre") }}</p>

    <div class="ml-auto flex items-center gap-2">
      <Button variant="outline" class="w-48 justify-start text-muted-foreground" @click="$emit('buscar')">
        <Search aria-hidden="true" />
        <span>{{ t("barra.buscar") }}</span>
        <kbd class="ml-auto rounded border px-1 font-sans text-xs">Ctrl K</kbd>
      </Button>
      <IndicadorGuardado :guardando="org.guardando" :error="org.error" />
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="outline" aria-disabled="true" class="cursor-not-allowed text-muted-foreground">
            <Download aria-hidden="true" />
            {{ t("barra.exportar") }}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t("barra.llegaFase4") }}</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="etiquetaTema"
        :title="etiquetaTema"
        @click="tema = oscuro ? 'claro' : 'oscuro'"
      >
        <Sun v-if="oscuro" aria-hidden="true" />
        <Moon v-else aria-hidden="true" />
      </Button>
    </div>
  </header>
</template>
