<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Network } from "@lucide/vue";

const { t } = useI18n();
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-3 text-center">
    <Network class="size-10 text-muted-foreground" aria-hidden="true" />
    <h1 class="text-lg font-semibold">{{ t("arbol.vacioTitulo") }}</h1>
    <p class="max-w-sm text-sm text-muted-foreground">
      {{ t("arbol.vacioTexto") }}
    </p>
  </section>
</template>
