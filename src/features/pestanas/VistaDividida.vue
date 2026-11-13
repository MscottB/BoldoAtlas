<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Columns2, Rows2, X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useOrganizaciones } from "@/stores/organizaciones";
import DivisorPaneles from "./DivisorPaneles.vue";
import PanelLado from "./PanelLado.vue";
import PestanaSinAbrir from "./PestanaSinAbrir.vue";
import { propsPanel } from "./panel";
import type { Panel } from "./pestanas";
import { ID_AREA, idPestana, usePestanas } from "./usePestanas";

// El área central: la pestaña activa y, con la vista dividida, la de al lado, con el divisor entre ambas.
// El panel principal es siempre el mismo elemento: dividir o dejar de dividir no vuelve a montar su vista.
const { t } = useI18n();
const pestanas = usePestanas();
const organizaciones = useOrganizaciones();
const sinAbrirActiva = computed(() => organizaciones.sinAbrir.get(pestanas.activa));
// Con una sola pestaña no hay barra, ni panel de pestaña. Con la vista dividida, el de la activa es el panel principal.
const conPestanas = computed(() => pestanas.lista.length > 1);
const panelDePestana = (enPrincipal: boolean) =>
  conPestanas.value && enPrincipal === !!pestanas.lado
    ? { role: "tabpanel", "aria-labelledby": idPestana(pestanas.activa) }
    : {};
// Mientras se arrastra el divisor, la proporción vive aquí; se guarda una vez, al soltarlo.
const enArrastre = ref<number | null>(null);
const proporcion = computed(() => enArrastre.value ?? pestanas.division.proporcion);
const ladoALado = computed(() => pestanas.division.orientacion === "horizontal");
const etiquetaOrientacion = computed(() =>
  t(ladoALado.value ? "pestanas.unaSobreOtra" : "pestanas.ladoALado"),
);
// El principal ocupa `proporcion` del espacio que deja el divisor; sin vista dividida, todo.
const crece = (p: Panel) =>
  !pestanas.lado ? 1 : p === "principal" ? proporcion.value : 1 - proporcion.value;
const conFoco = (p: Panel) => !!pestanas.lado && pestanas.conFoco === p;
function titulo(id: string) {
  const p = pestanas.lista.find((x) => x.id === id);
  return p ? pestanas.titulo(p) : "";
}
const encabezado = (p: Panel) => [
  "flex h-8 shrink-0 items-center gap-1 border-t-2 border-b px-3 text-sm",
  conFoco(p) ? "border-t-primary bg-muted font-medium" : "border-t-transparent text-muted-foreground",
];
</script>

<template>
  <main
    :id="ID_AREA"
    tabindex="-1"
    class="min-h-0 flex-1 overflow-auto outline-none"
    v-bind="panelDePestana(false)"
  >
    <!-- Sin las vistas mientras se cambia: se desmontan y guardan su estado antes de que la base cambie. -->
    <p v-if="organizaciones.cambiando" role="status" class="p-6 text-sm text-muted-foreground">
      {{ t("organizaciones.cambiando") }}
    </p>
    <div v-else class="flex h-full" :class="ladoALado ? 'flex-row' : 'flex-col'">
      <!-- `propsPanel` marca con `aria-current` el panel donde actúan la barra de pestañas y sus atajos. -->
      <section
        v-bind="{ ...propsPanel('principal'), ...panelDePestana(true) }"
        class="flex min-h-0 min-w-0 flex-col"
        :style="{ flex: `${crece('principal')} 1 0%` }"
      >
        <header v-if="pestanas.lado" :class="encabezado('principal')">
          <span class="truncate">{{ titulo(pestanas.activa) }}</span>
        </header>
        <div class="min-h-0 flex-1 overflow-auto">
          <PestanaSinAbrir
            v-if="sinAbrirActiva"
            :id="pestanas.activa"
            :key="pestanas.activa"
            :motivo="sinAbrirActiva"
          />
          <!-- La key es la pestaña: cambiar de pestaña monta su vista de cero (solo la activa está montada). -->
          <RouterView v-else v-slot="{ Component: vista }">
            <component :is="vista" :key="pestanas.activa" />
          </RouterView>
        </div>
      </section>
      <template v-if="pestanas.lado">
        <DivisorPaneles
          v-model:arrastre="enArrastre"
          :orientacion="pestanas.division.orientacion"
          :proporcion="pestanas.division.proporcion"
          @update:proporcion="pestanas.proporcion"
        />
        <section
          v-bind="propsPanel('lado')"
          class="flex min-h-0 min-w-0 flex-col"
          :style="{ flex: `${crece('lado')} 1 0%` }"
          aria-labelledby="titulo-panel-lado"
        >
          <header :class="encabezado('lado')">
            <span id="titulo-panel-lado" class="min-w-0 flex-1 truncate">{{ titulo(pestanas.lado) }}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              :aria-label="etiquetaOrientacion"
              :title="etiquetaOrientacion"
              @click="pestanas.orientar(ladoALado ? 'vertical' : 'horizontal')"
            >
              <component :is="ladoALado ? Rows2 : Columns2" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              :aria-label="t('pestanas.cerrarDivision')"
              :title="t('pestanas.cerrarDivision')"
              @click="pestanas.cerrarDivision()"
            >
              <X aria-hidden="true" />
            </Button>
          </header>
          <div class="min-h-0 flex-1 overflow-auto">
            <PanelLado :id="pestanas.lado" :key="pestanas.lado" />
          </div>
        </section>
      </template>
    </div>
  </main>
</template>
