<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { cambiarIdioma, IDIOMAS, type Idioma } from "@/i18n";

const { t, locale } = useI18n();
</script>

<template>
  <section class="space-y-4 p-6">
    <h1 class="text-lg font-semibold">{{ t("nav.configuracion") }}</h1>
    <p class="text-sm text-muted-foreground">{{ t("provisional.enConstruccion") }}</p>
    <!-- Provisional: la tarea de Configuración lo reemplaza. -->
    <label class="flex items-center gap-2 text-sm">
      {{ t("idioma.etiqueta") }}
      <select
        class="rounded-md border bg-background px-2 py-1"
        :value="locale"
        @change="cambiarIdioma(($event.target as HTMLSelectElement).value as Idioma)"
      >
        <option v-for="i in IDIOMAS" :key="i" :value="i">{{ t(`idioma.${i}`) }}</option>
      </select>
    </label>
  </section>
</template>
