<script setup lang="ts">
import { Check, LoaderCircle } from "@lucide/vue";

defineProps<{ guardando: boolean }>();
</script>

<template>
  <p class="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
    <LoaderCircle v-if="guardando" class="size-4 animate-spin" aria-hidden="true" />
    <Check v-else class="size-4" aria-hidden="true" />
    {{ guardando ? "Guardando…" : "Guardado" }}
  </p>
</template>
