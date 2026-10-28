<script setup lang="ts">
import { Check, LoaderCircle, TriangleAlert } from "@lucide/vue";

defineProps<{ guardando: boolean; error?: string | null }>();
</script>

<template>
  <!-- Un único role="status": cambia su contenido, no el nodo, para que los lectores de pantalla lo anuncien. -->
  <p
    class="flex items-center gap-1.5 text-sm"
    :class="error ? 'text-destructive' : 'text-muted-foreground'"
    role="status"
    :title="error || undefined"
  >
    <TriangleAlert v-if="error" class="size-4" aria-hidden="true" />
    <LoaderCircle v-else-if="guardando" class="size-4 animate-spin" aria-hidden="true" />
    <Check v-else class="size-4" aria-hidden="true" />
    <template v-if="error">
      No se guardó
      <span class="sr-only">: {{ error }}</span>
    </template>
    <template v-else>{{ guardando ? "Guardando…" : "Guardado" }}</template>
  </p>
</template>
