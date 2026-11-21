<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { LISTA_HOJAS, ORIENTACIONES, type Hoja, type Orientacion } from "./paginas";

// La hoja y la orientación de un PDF: las de «Exportar como imagen» y las del manual.
const hoja = defineModel<Hoja>("hoja", { required: true });
const orientacion = defineModel<Orientacion>("orientacion", { required: true });
defineProps<{ disabled?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <fieldset class="grid gap-1.5" :disabled="disabled">
    <legend class="mb-1 text-sm font-medium">{{ t("pdf.hoja") }}</legend>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <label v-for="h in LISTA_HOJAS" :key="h" class="flex items-center gap-1.5 text-sm">
        <input
          v-model="hoja"
          type="radio"
          name="pdf-hoja"
          :value="h"
          :data-accion="`hoja-${h}`"
          class="size-4 accent-primary"
        />
        {{ t(`pdf.hojas.${h}`) }}
      </label>
    </div>
  </fieldset>
  <fieldset class="grid gap-1.5" :disabled="disabled">
    <legend class="mb-1 text-sm font-medium">{{ t("pdf.orientacion") }}</legend>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <label v-for="o in ORIENTACIONES" :key="o" class="flex items-center gap-1.5 text-sm">
        <input
          v-model="orientacion"
          type="radio"
          name="pdf-orientacion"
          :value="o"
          :data-accion="`orientacion-${o}`"
          class="size-4 accent-primary"
        />
        {{ t(`pdf.orientaciones.${o}`) }}
      </label>
    </div>
  </fieldset>
</template>
