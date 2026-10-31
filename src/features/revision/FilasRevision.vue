<script setup lang="ts">
import { ref, toRef, useTemplateRef, watch } from "vue";
import { useVirtualList } from "@vueuse/core";

// Fila plana: los grupos (correos, nombres) son una fila de encabezado y una por persona.
export interface Fila {
  clave: string;
  texto: string;
  detalle?: string;
  /** Sin `abrir` la fila es solo texto (los valores sin uso no tienen adónde llevar todavía). */
  abrir?: () => void;
  hija?: boolean;
}

const props = defineProps<{ filas: Fila[] }>();

// Solo las filas a la vista van al DOM (con 10.000 personas había 16.682 botones). Cada fila es de una línea, así que
// todas miden lo mismo: se mide la primera dibujada, que cambia con la escala de la interfaz.
const altoFila = ref(32);
const { list, containerProps, wrapperProps } = useVirtualList(toRef(props, "filas"), {
  itemHeight: () => altoFila.value,
  overscan: 10,
});
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
        v-for="{ data: f, index } in list"
        :key="f.clave"
        class="text-sm"
        :class="f.hija && 'pl-6'"
        :aria-setsize="filas.length"
        :aria-posinset="index + 1"
      >
        <component
          :is="f.abrir ? 'button' : 'div'"
          v-bind="f.abrir ? { type: 'button', onClick: f.abrir } : {}"
          class="group flex w-full items-baseline gap-2 px-3 py-1.5 text-left whitespace-nowrap"
          :class="
            f.abrir
              ? 'hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
              : !f.hija && 'font-medium'
          "
          :title="f.detalle"
        >
          <span>{{ f.texto }}</span>
          <span v-if="f.detalle" class="min-w-0 truncate text-muted-foreground group-hover:text-foreground">
            {{ f.detalle }}
          </span>
        </component>
      </li>
    </ul>
  </div>
</template>
