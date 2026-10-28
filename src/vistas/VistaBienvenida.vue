<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <section class="p-6">
    <h1 class="text-lg font-semibold">{{ t("provisional.bienvenida") }}</h1>
    <p class="text-sm text-muted-foreground">{{ t("provisional.enConstruccion") }}</p>
  </section>
</template>
