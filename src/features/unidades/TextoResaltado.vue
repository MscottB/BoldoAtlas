<script setup lang="ts">
import { computed } from "vue";
import { partirCoincidencia } from "@/lib/texto";

const props = defineProps<{ texto: string; buscado: string }>();
const partes = computed(() => partirCoincidencia(props.texto, props.buscado));
</script>

<template>
  <template v-if="partes"
    >{{ partes[0]
    }}<mark class="rounded-sm bg-amber-200 text-amber-950 underline dark:bg-amber-300">{{ partes[1] }}</mark
    >{{ partes[2] }}</template
  >
  <template v-else>{{ texto }}</template>
</template>
