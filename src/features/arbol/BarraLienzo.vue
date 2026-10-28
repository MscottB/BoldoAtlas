<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useVueFlow } from "@vue-flow/core";
import { onKeyStroke } from "@vueuse/core";
import { Maximize, Plus, ZoomIn, ZoomOut } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrganizacion } from "@/stores/organizacion";
import { useLienzo } from "./useLienzo";

const props = defineProps<{ raiz: string | null }>();
const { t } = useI18n();
const org = useOrganizacion();
const { seleccion, filtroEtiqueta, filtroTexto, nuevaUnidad } = useLienzo();
const { zoomIn, zoomOut, fitView } = useVueFlow(); // el store de Vue Flow lo provee VistaArbol

onKeyStroke("0", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault(); // en WebView2, Ctrl+0 restablecería el zoom de la página
  void fitView();
});

// Hija de la seleccionada; si no hay, de la raíz enfocada; si tampoco, una raíz nueva.
function nueva() {
  const padre = seleccion.value ?? props.raiz;
  void nuevaUnidad(padre ? (org.porId.get(padre) ?? null) : null);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b p-2">
    <Button size="sm" @click="nueva">
      <Plus aria-hidden="true" />
      {{ t("arbol.nuevaUnidad") }}
    </Button>
    <select
      v-model="filtroEtiqueta"
      class="h-7 rounded-md border bg-background px-2 text-sm"
      :aria-label="t('arbol.resaltarEtiqueta')"
    >
      <option :value="null">{{ t("arbol.todasEtiquetas") }}</option>
      <option v-for="e in org.etiquetas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
    </select>
    <Input
      v-model="filtroTexto"
      type="search"
      class="h-7 w-48"
      :placeholder="t('arbol.resaltarTexto')"
      :aria-label="t('arbol.resaltarTexto')"
    />
    <span class="ml-auto flex gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.alejar')"
        :title="t('arbol.alejar')"
        @click="zoomOut()"
      >
        <ZoomOut aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.acercar')"
        :title="t('arbol.acercar')"
        @click="zoomIn()"
      >
        <ZoomIn aria-hidden="true" />
      </Button>
      <Button variant="outline" size="sm" :title="t('arbol.encuadrarAtajo')" @click="fitView()">
        <Maximize aria-hidden="true" />
        {{ t("arbol.encuadrar") }}
      </Button>
    </span>
  </div>
</template>
