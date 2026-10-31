<script setup lang="ts">
import { inject, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useVueFlow } from "@vue-flow/core";
import { Maximize, ZoomIn, ZoomOut } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { CONTEXTO_LIENZO } from "./contexto";
import { useLienzo } from "./useLienzo";

// Zoom en la esquina inferior derecha del lienzo, como en un mapa (el minimapa va encima). Va antes del lienzo en el
// DOM: con Tab se llega a − y + justo después de la barra, sin recorrer todas las tarjetas. Ctrl+± llega por pedidoZoom.
const { t } = useI18n();
const { zoomIn, zoomOut } = useVueFlow(); // el store de Vue Flow lo provee VistaArbol
const { encuadrar } = inject(CONTEXTO_LIENZO)!;
const { pedidoZoom } = useLienzo();

watch(pedidoZoom, (z) => {
  if (!z) return;
  pedidoZoom.value = null;
  void (z === "acercar" ? zoomIn() : zoomOut());
});
</script>

<template>
  <div role="group" :aria-label="t('arbol.zoom')" class="absolute right-[15px] bottom-[15px] z-10 flex gap-1">
    <Button
      variant="outline"
      size="icon-sm"
      :aria-label="t('arbol.alejar')"
      :title="t('arbol.alejarAtajo')"
      @click="zoomOut()"
    >
      <ZoomOut aria-hidden="true" />
    </Button>
    <Button
      variant="outline"
      size="icon-sm"
      :aria-label="t('arbol.acercar')"
      :title="t('arbol.acercarAtajo')"
      @click="zoomIn()"
    >
      <ZoomIn aria-hidden="true" />
    </Button>
    <Button
      variant="outline"
      size="icon-sm"
      :aria-label="t('arbol.encuadrar')"
      :title="t('arbol.encuadrarAtajo')"
      @click="encuadrar()"
    >
      <Maximize aria-hidden="true" />
    </Button>
  </div>
</template>
