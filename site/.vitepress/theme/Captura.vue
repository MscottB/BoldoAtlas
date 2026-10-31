<script setup lang="ts">
import { withBase } from "vitepress";

// Captura de public/capturas/ (copiadas por scripts/sync.mjs); withBase pone el prefijo /BoldoAtlas/.
defineProps<{ archivo: string; alt: string }>();
</script>

<template>
  <figure class="captura">
    <img :src="withBase(`/capturas/${archivo}`)" :alt="alt" loading="lazy" />
    <figcaption><slot /></figcaption>
  </figure>
</template>

<style scoped>
.captura {
  margin: 0;
}
img {
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
figcaption {
  margin-top: 6px;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}
</style>
