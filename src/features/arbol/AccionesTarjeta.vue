<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useVueFlow } from "@vue-flow/core";
import { ChevronsDownUp, ChevronsUpDown, Ellipsis, Pencil, Plus } from "@lucide/vue";
import type { Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { abrirMenuContextual, useLienzo } from "./useLienzo";

// Acciones de la tarjeta activa o seleccionada. Flotan sobre su borde: no mueven nada de lo que hay bajo el puntero. Las
// mismas del menú contextual, y «Más» abre ese menú. Se montan solo en una tarjeta a la vez.
const props = defineProps<{ id: string; unidad: Unidad; hijos: number }>();
const { t } = useI18n();
const org = useOrganizacion();
const { viewport } = useVueFlow();
const { colapsados, nuevaUnidad, renombrar, alternarRama } = useLienzo();

const soloLectura = computed(() => !!org.fechaVista);
const plegada = computed(() => colapsados.value.has(props.id));
// Alejado, los botones no se achican hasta volverse imposibles de pulsar.
const escala = computed(() => Math.min(4, Math.max(1, 0.9 / viewport.value.zoom)));
const clase =
  "grid size-6 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";
</script>

<template>
  <!-- El relleno inferior une los botones con la tarjeta: al subir el puntero no se pasa por un hueco que los esconda. -->
  <div
    data-acciones-tarjeta
    role="group"
    :aria-label="t('arbol.acciones.titulo', { unidad: unidad.nombre })"
    class="nodrag nopan absolute right-0 bottom-full origin-bottom-right cursor-default pb-1"
    :style="{ scale: escala }"
    @click.stop
    @dblclick.stop
  >
    <div class="flex gap-0.5 rounded-md border bg-card p-0.5 text-card-foreground shadow-sm">
      <button
        v-if="!soloLectura"
        type="button"
        :class="clase"
        :aria-label="t('arbol.nuevaSubunidad')"
        :title="t('arbol.nuevaSubunidad')"
        @click="nuevaUnidad(unidad)"
      >
        <Plus class="size-3.5" aria-hidden="true" />
      </button>
      <button
        v-if="!soloLectura"
        type="button"
        :class="clase"
        :aria-label="t('arbol.menu.renombrar')"
        :title="`${t('arbol.menu.renombrar')} (F2)`"
        @click="renombrar(id)"
      >
        <Pencil class="size-3.5" aria-hidden="true" />
      </button>
      <button
        v-if="hijos"
        type="button"
        :class="clase"
        :aria-label="plegada ? t('arbol.expandir', hijos) : t('arbol.plegar')"
        :aria-expanded="!plegada"
        :title="plegada ? t('arbol.expandir', hijos) : t('arbol.plegar')"
        @click="alternarRama(id)"
      >
        <component :is="plegada ? ChevronsUpDown : ChevronsDownUp" class="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        :class="clase"
        :aria-label="t('arbol.acciones.mas')"
        :title="t('arbol.acciones.mas')"
        aria-haspopup="menu"
        @click="abrirMenuContextual($event.currentTarget as Element)"
      >
        <Ellipsis class="size-3.5" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
