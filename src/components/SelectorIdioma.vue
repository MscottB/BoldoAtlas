<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { IDIOMAS, cambiarIdioma } from "@/i18n";

// Cambio inmediato y recordado por PC (el mismo `cambiarIdioma` de Configuración y del menú de la app).
// Nombre accesible = nombre del idioma en ese idioma ("Español", "English"), que contiene el "ES"/"EN" visible.
const { t, locale } = useI18n();
</script>

<template>
  <div role="group" :aria-label="t('idioma.etiqueta')" class="inline-flex gap-1">
    <Button
      v-for="i in IDIOMAS"
      :key="i"
      type="button"
      size="sm"
      :variant="locale === i ? 'default' : 'outline'"
      :aria-pressed="locale === i"
      :aria-label="t(`idioma.${i}`)"
      :lang="i"
      :title="t(`idioma.${i}`)"
      @click="cambiarIdioma(i)"
    >
      {{ i.toUpperCase() }}
    </Button>
  </div>
</template>
