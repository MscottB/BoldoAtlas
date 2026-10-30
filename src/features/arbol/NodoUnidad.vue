<script setup lang="ts">
import { computed, type Directive } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Handle, Position } from "@vue-flow/core";
import { toast } from "vue-sonner";
import { Minus, Plus, SquareArrowOutUpRight, Users } from "@lucide/vue";
import type { Etiqueta, Trabajador, Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { useLienzo } from "./useLienzo";

export interface DatosNodo {
  unidad: Unidad;
  jefe: Trabajador | null;
  total: number;
  vacantes: number;
  etiquetas: Etiqueta[];
  hijos: number;
}

const props = defineProps<{ id: string; data: DatosNodo }>();
const { t } = useI18n();
const router = useRouter();
const org = useOrganizacion();
const { seleccion, editando, colapsados, seleccionar, alternarRama, coincide, nuevaUnidad } = useLienzo();

const seleccionada = computed(() => seleccion.value === props.id);
const atenuada = computed(() => !coincide(props.data.unidad));
const plegada = computed(() => colapsados.value.has(props.id));
const tipo = computed(
  () => org.catalogos.tipos_unidad.find((x) => x.id === props.data.unidad.tipo_id)?.nombre,
);
const iniciales = computed(() =>
  (props.data.jefe?.nombre ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase(),
);
const vFoco: Directive<HTMLInputElement> = { mounted: (el) => (el.focus(), el.select()) };

async function guardar(e: Event) {
  if (editando.value !== props.id) return; // Esc ya canceló, o Enter ya guardó antes del blur
  editando.value = null;
  const nombre = (e.target as HTMLInputElement).value.trim();
  if (!nombre || nombre === props.data.unidad.nombre) return;
  const r = await org.editarUnidad(props.id, { nombre });
  if (!r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <!-- Nodo liviano: sin sombras ni transiciones (nota de rendimiento). -->
  <div
    class="flex h-[112px] w-[220px] flex-col gap-1 rounded-lg border bg-card p-2 text-xs text-card-foreground"
    :class="[seleccionada && 'border-marca ring-2 ring-marca', atenuada && 'opacity-35']"
    @click="seleccionar(id)"
  >
    <Handle type="target" :position="Position.Top" class="opacity-0" />
    <div class="flex items-center justify-between text-muted-foreground">
      <span class="uppercase">{{ tipo }}</span>
      <span class="flex gap-1">
        <span
          v-for="e in data.etiquetas"
          :key="e.id"
          class="size-2.5 rounded-full"
          :style="{ background: e.color }"
          :title="e.nombre"
        />
        <span class="sr-only">{{ data.etiquetas.map((e) => e.nombre).join(", ") }}</span>
      </span>
    </div>
    <input
      v-if="editando === id"
      v-foco
      class="nodrag rounded border bg-background px-1 text-sm font-semibold"
      :value="data.unidad.nombre"
      :aria-label="t('arbol.nombre')"
      @keydown.enter="guardar"
      @keydown.esc="editando = null"
      @blur="guardar"
    />
    <button
      v-else
      type="button"
      class="truncate rounded text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring"
      :aria-pressed="seleccionada"
      :title="t('arbol.ayudaNombre')"
      @dblclick="editando = id"
      @keydown.f2="editando = id"
    >
      {{ data.unidad.nombre }}
    </button>
    <div class="flex items-center gap-1.5">
      <template v-if="data.jefe">
        <img
          v-if="data.jefe.foto_png"
          :src="`data:image/png;base64,${data.jefe.foto_png}`"
          alt=""
          class="size-5 rounded-full object-cover"
        />
        <span
          v-else
          class="grid size-5 place-items-center rounded-full bg-muted text-[10px]"
          aria-hidden="true"
        >
          {{ iniciales }}
        </span>
        <span class="truncate">{{ data.jefe.nombre }}</span>
      </template>
      <span v-else class="text-amber-700 dark:text-amber-400">{{ t("arbol.sinJefatura") }}</span>
    </div>
    <div class="mt-auto flex items-center gap-1.5">
      <span class="flex items-center gap-1" :title="t('arbol.dotacion')">
        <Users class="size-3.5" aria-hidden="true" />
        <span class="sr-only">{{ t("arbol.dotacion") }}:</span>{{ data.total }}
      </span>
      <span v-if="data.vacantes" class="rounded-full bg-marca px-1.5 text-marca-foreground">
        {{ t("arbol.vacantes", data.vacantes) }}
      </span>
      <span class="ml-auto flex gap-1">
        <template v-if="seleccionada">
          <button
            type="button"
            class="nodrag grid size-5 place-items-center rounded border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('arbol.abrirComoArbol')"
            :title="t('arbol.abrirComoArbol')"
            @click.stop="router.push({ query: { raiz: id } })"
          >
            <SquareArrowOutUpRight class="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="nodrag grid size-5 place-items-center rounded border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('arbol.nuevaSubunidad')"
            :title="t('arbol.nuevaSubunidad')"
            @click.stop="nuevaUnidad(data.unidad)"
          >
            <Plus class="size-3" aria-hidden="true" />
          </button>
        </template>
        <button
          v-if="data.hijos"
          type="button"
          class="nodrag flex h-5 min-w-5 items-center justify-center rounded border px-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="plegada ? t('arbol.expandir', data.hijos) : t('arbol.plegar')"
          :aria-expanded="!plegada"
          @click.stop="alternarRama(id)"
        >
          <template v-if="plegada">+{{ data.hijos }}</template>
          <Minus v-else class="size-3" aria-hidden="true" />
        </button>
      </span>
    </div>
    <Handle type="source" :position="Position.Bottom" class="opacity-0" />
  </div>
</template>
