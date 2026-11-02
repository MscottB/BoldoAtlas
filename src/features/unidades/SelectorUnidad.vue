<script setup lang="ts">
import { ref } from "vue";
import { ChevronsUpDown } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ListaUnidades from "./ListaUnidades.vue";

// Combobox con buscador de unidades (superior y destino de una conexión). Los atributos (id, aria-*) van al botón.
defineOptions({ inheritAttrs: false });
defineProps<{
  excluidas: Set<string>;
  /** Texto del botón (lo elegido o el aviso de «elegir»). */
  texto: string;
  /** Ofrece esta opción (devuelve null), por ejemplo «Sin superior (raíz)». */
  ninguna?: string;
}>();
const emit = defineEmits<{ elegir: [id: string | null] }>();

const abierto = ref(false);

function elegir(id: string | null) {
  emit("elegir", id);
  abierto.value = false;
}
</script>

<template>
  <Popover v-model:open="abierto">
    <PopoverTrigger as-child>
      <Button
        v-bind="$attrs"
        type="button"
        variant="outline"
        role="combobox"
        class="w-full justify-between border-campo-borde font-normal dark:border-campo-borde"
      >
        <span class="truncate">{{ texto }}</span>
        <ChevronsUpDown class="opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-(--reka-popover-trigger-width) min-w-64 p-0">
      <ListaUnidades :excluidas="excluidas" :ninguna="ninguna" @elegir="elegir" />
    </PopoverContent>
  </Popover>
</template>
