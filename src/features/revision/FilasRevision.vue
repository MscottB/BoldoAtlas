<script setup lang="ts">
import { computed, ref, toRef, useTemplateRef, watch } from "vue";
import { useVirtualList } from "@vueuse/core";
import { Button } from "@/components/ui/button";

export interface Accion {
  id: "abrir" | "asignar" | "jefatura" | "eliminar" | "desactivar" | "bien" | "volver";
  etiqueta: string;
  hacer: () => void;
}
// Fila plana: los grupos (correos, nombres) son una fila de encabezado y una por persona.
export interface Fila {
  clave: string;
  texto: string;
  detalle?: string;
  hija?: boolean;
  acciones: Accion[];
}

const props = defineProps<{ filas: Fila[] }>();

// Solo las filas a la vista van al DOM (con 10.000 personas había 16.682 botones). Cada fila es de una línea y alto fijo
// (h-8, los botones son h-6), así que todas miden lo mismo: se mide la primera dibujada, que cambia con la escala.
const altoFila = ref(32);
const { list, containerProps, wrapperProps } = useVirtualList(toRef(props, "filas"), {
  itemHeight: () => altoFila.value,
  overscan: 10,
});
// Antes de medir el contenedor (y al dibujar en el servidor, en las pruebas) la lista virtual está vacía: van las primeras.
const vista = computed(() =>
  list.value.length ? list.value : props.filas.slice(0, 20).map((data, index) => ({ data, index })),
);
const lista = useTemplateRef("lista");
watch(
  list,
  () => {
    const fila = lista.value?.firstElementChild;
    if (fila) altoFila.value = fila.getBoundingClientRect().height;
  },
  { flush: "post" },
);
</script>

<template>
  <div v-bind="containerProps" class="max-h-96 border-t">
    <ul ref="lista" v-bind="wrapperProps">
      <li
        v-for="{ data: f, index } in vista"
        :key="f.clave"
        class="flex h-8 items-center gap-2 px-3 text-sm whitespace-nowrap"
        :class="f.hija && 'pl-9'"
        :aria-setsize="filas.length"
        :aria-posinset="index + 1"
        :title="f.detalle"
      >
        <span class="truncate">{{ f.texto }}</span>
        <span v-if="f.detalle" class="truncate text-muted-foreground">{{ f.detalle }}</span>
        <span class="ml-auto flex shrink-0 gap-1">
          <Button
            v-for="a in f.acciones"
            :key="a.id"
            type="button"
            size="xs"
            :variant="a.id === 'eliminar' ? 'destructive' : 'outline'"
            :data-accion="a.id"
            :aria-label="`${a.etiqueta}: ${f.texto}`"
            @click="a.hacer"
          >
            {{ a.etiqueta }}
          </Button>
        </span>
      </li>
    </ul>
  </div>
</template>
