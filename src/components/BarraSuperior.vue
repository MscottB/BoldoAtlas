<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Columns2, Download, Search } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import BotonTema from "@/components/BotonTema.vue";
import IndicadorGuardado from "@/components/IndicadorGuardado.vue";
import { useOrganizacion } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import MenuApp from "@/features/proyecto/MenuApp.vue";
import { datosProyectoAbierto } from "@/features/proyecto/menuApp";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import AvisoActualizacion from "@/features/actualizaciones/AvisoActualizacion.vue";
import { usePestanas } from "@/features/pestanas/usePestanas";

// "buscar" abre la paleta de comandos (Ctrl+K); lo atiende App.vue. La barra lateral se pliega con su botón, al pie de ella.
defineEmits<{ buscar: [] }>();

const { t } = useI18n();
const org = useOrganizacion();
const organizaciones = useOrganizaciones();
const pestanas = usePestanas();
// Abre al lado una pestaña nueva con la vista de la activa; con la vista ya dividida, la cierra.
function dividir() {
  const r = pestanas.dividir();
  if (!r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
    <MenuApp />
    <!-- Qué organización está abierta; un clic muestra dónde están sus datos. -->
    <button
      type="button"
      class="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      :aria-label="t('proyecto.abrir', { nombre: organizaciones.nombreAbierta || t('barra.sinNombre') })"
      @click="datosProyectoAbierto = true"
    >
      <span
        v-if="organizaciones.abierta"
        class="size-2.5 shrink-0 rounded-full"
        :style="{ backgroundColor: organizaciones.abierta.color }"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate text-sm font-semibold">{{
        organizaciones.nombreAbierta || t("barra.sinNombre")
      }}</span>
    </button>

    <div class="ml-auto flex items-center gap-2">
      <AvisoActualizacion />
      <Button
        variant="outline"
        class="w-48 justify-start text-muted-foreground"
        data-buscar-paleta
        @click="$emit('buscar')"
      >
        <Search aria-hidden="true" />
        <span>{{ t("barra.buscar") }}</span>
        <kbd class="ml-auto rounded border px-1 font-sans text-xs">Ctrl K</kbd>
      </Button>
      <Button
        variant="outline"
        class="aria-pressed:bg-accent"
        :aria-pressed="!!pestanas.lado"
        @click="dividir"
      >
        <Columns2 aria-hidden="true" />
        {{ t("barra.dividir") }}
      </Button>
      <IndicadorGuardado :guardando="org.guardando" :error="org.error" />
      <Tooltip v-if="MOSTRAR_PROXIMAMENTE">
        <TooltipTrigger as-child>
          <Button variant="outline" aria-disabled="true" class="cursor-not-allowed text-muted-foreground">
            <Download aria-hidden="true" />
            {{ t("barra.exportar") }}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t("barra.llegaFase4") }}</TooltipContent>
      </Tooltip>
      <BotonTema />
    </div>
  </header>
</template>
