<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import type { Avance } from "./intercambio";

const props = defineProps<{ avance: Avance | null; cancelable: boolean }>();
defineEmits<{ cancelar: [] }>();

const { t, te } = useI18n();
// Sin total (copiar la base, revisar) no hay porcentaje: la barra se llena de lado a lado sin número.
const porcentaje = computed(() =>
  props.avance?.total ? Math.round((props.avance.hecho / props.avance.total) * 100) : null,
);
const etiqueta = computed(() => {
  const clave = `intercambio.etapa.${props.avance?.etapa}`;
  return te(clave) ? t(clave) : t("intercambio.etapa.copiando");
});
</script>

<template>
  <div class="grid gap-3 rounded-lg border p-4" role="status">
    <p class="text-sm">{{ etiqueta }}</p>
    <div
      class="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-label="etiqueta"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="porcentaje ?? undefined"
    >
      <div
        class="h-full bg-primary transition-[width]"
        :class="porcentaje === null && 'animate-pulse'"
        :style="{ width: `${porcentaje ?? 100}%` }"
      />
    </div>
    <div v-if="cancelable">
      <Button type="button" variant="outline" size="sm" @click="$emit('cancelar')">
        {{ t("intercambio.cancelar") }}
      </Button>
    </div>
  </div>
</template>
