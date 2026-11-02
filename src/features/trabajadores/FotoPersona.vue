<script setup lang="ts">
import { ref, watch } from "vue";
import { iniciales } from "@/lib/texto";

// El avatar de una persona: su foto o, si no tiene o la foto no se puede mostrar, sus iniciales.
const props = defineProps<{ src: string | null; nombre: string }>();
const fallo = ref(false);
watch(
  () => props.src,
  () => (fallo.value = false),
);
</script>

<template>
  <img
    v-if="src && !fallo"
    :src="src"
    alt=""
    loading="lazy"
    decoding="async"
    class="rounded-full object-cover"
    @error="fallo = true"
  />
  <span v-else class="grid place-items-center rounded-full bg-muted" aria-hidden="true">
    {{ iniciales(nombre) }}
  </span>
</template>
