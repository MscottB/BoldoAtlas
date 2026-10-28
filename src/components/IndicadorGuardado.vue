<script setup lang="ts">
import { Check, LoaderCircle, TriangleAlert } from "@lucide/vue";

defineProps<{ guardando: boolean; error?: string | null }>();
</script>

<template>
  <p v-if="error" class="flex items-center gap-1.5 text-sm text-destructive" role="status" :title="error">
    <TriangleAlert class="size-4" aria-hidden="true" />
    No se guardó
    <span class="sr-only">: {{ error }}</span>
  </p>
  <p v-else class="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
    <LoaderCircle v-if="guardando" class="size-4 animate-spin" aria-hidden="true" />
    <Check v-else class="size-4" aria-hidden="true" />
    {{ guardando ? "Guardando…" : "Guardado" }}
  </p>
</template>
