<script setup lang="ts">
import { computed, type Directive } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Handle, Position } from "@vue-flow/core";
import { toast } from "vue-sonner";
import { Copy, Minus, Plus, SquareArrowOutUpRight, Users } from "@lucide/vue";
import type { Etiqueta, Trabajador, Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { textoSobre } from "@/features/tema/tema";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";
import { tamUnidad } from "./vista";
import type { Marca } from "./jerarquia";

export interface DatosNodo {
  unidad: Unidad;
  jefe: Trabajador | null;
  /** La jefatura la cubre un reemplazo: el puesto no tiene titular vigente. */
  jefeReemplazo: boolean;
  total: number;
  vacantes: number;
  etiquetas: Etiqueta[];
  hijos: number;
  /** Marca efectiva según «Colorear por»; null = sin color. */
  marca: Marca | null;
  /** Superiores por tipo elegido (texto); null = la vista no muestra la ruta. */
  ruta: string | null;
}

const props = defineProps<{ id: string; data: DatosNodo }>();
const { t } = useI18n();
const router = useRouter();
const org = useOrganizacion();
const {
  seleccionadas,
  editando,
  colapsados,
  seleccionar,
  sumarASeleccion,
  alternarRama,
  coincide,
  nuevaUnidad,
  duplicar,
} = useLienzo();
const { config } = useVista();

const compacta = computed(() => config.value.densidad === "compacta");
const horizontal = computed(() => config.value.direccion === "horizontal");
// Misma función que usa el layout: la tarjeta dibujada mide lo que elk reservó.
const tam = computed(() => {
  const { ancho, alto } = tamUnidad(config.value, props.data.ruta !== null);
  return { width: `${ancho}px`, height: `${alto}px` };
});

// Con una fecha elegida el organigrama es de solo lectura: no se renombra ni se agregan subunidades.
const soloLectura = computed(() => !!org.fechaVista);
const seleccionada = computed(() => seleccionadas.value.has(props.id));
// Los botones de la tarjeta son de la selección simple; con varias, mandan la barra y sus atajos.
const sola = computed(() => seleccionada.value && seleccionadas.value.size === 1);

// Ctrl+clic alterna la unidad en la selección; Mayús+clic la suma. Con una fecha elegida no hay selección múltiple.
function alHacerClic(e: MouseEvent) {
  if (!soloLectura.value && (e.ctrlKey || e.metaKey || e.shiftKey))
    sumarASeleccion(props.id, e.ctrlKey || e.metaKey);
  else seleccionar(props.id);
}
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

function renombrar() {
  if (!soloLectura.value) editando.value = props.id;
}

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
    class="flex rounded-lg border bg-card text-xs text-card-foreground"
    :class="[
      compacta ? 'items-center gap-1.5 px-2' : 'flex-col gap-1 p-2',
      seleccionada && 'border-marca ring-2 ring-marca',
      atenuada && 'opacity-35',
      data.marca?.color && 'border-l-4',
    ]"
    :style="[tam, data.marca?.color ? { borderLeftColor: data.marca.color } : {}]"
    @click="alHacerClic"
  >
    <Handle type="target" :position="horizontal ? Position.Left : Position.Top" class="opacity-0" />
    <div
      v-if="!compacta && (config.mostrarTipo || config.mostrarEtiquetas || data.marca?.codigo)"
      class="flex items-center justify-between text-muted-foreground"
    >
      <span class="flex min-w-0 items-center gap-1">
        <span v-if="config.mostrarTipo" class="truncate uppercase">{{ tipo }}</span>
        <span
          v-if="data.marca?.codigo"
          class="rounded px-1 text-[10px] font-semibold"
          :class="!data.marca.color && 'bg-muted text-foreground'"
          :style="
            data.marca.color
              ? { background: data.marca.color, color: textoSobre(data.marca.color) }
              : undefined
          "
          :title="data.marca.unidad.nombre"
        >
          {{ data.marca.codigo }}
        </span>
      </span>
      <span v-if="config.mostrarEtiquetas" class="flex shrink-0 gap-1">
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
      :class="compacta && 'min-w-0 flex-1'"
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
      :class="compacta && 'min-w-0 flex-1'"
      :aria-pressed="seleccionada"
      :title="soloLectura ? undefined : t('arbol.ayudaNombre')"
      @dblclick="renombrar"
      @keydown.f2="renombrar"
    >
      {{ data.unidad.nombre }}
    </button>
    <span v-if="data.ruta && !compacta" class="truncate text-[11px] text-muted-foreground" :title="data.ruta">
      {{ data.ruta }}
    </span>
    <div v-if="!compacta && config.mostrarJefe" class="flex items-center gap-1.5">
      <template v-if="data.jefe">
        <img
          v-if="data.jefe.foto_png && config.mostrarFoto"
          :src="`data:image/png;base64,${data.jefe.foto_png}`"
          alt=""
          class="size-5 rounded-full object-cover"
        />
        <span
          v-else-if="config.mostrarFoto"
          class="grid size-5 place-items-center rounded-full bg-muted text-[10px]"
          aria-hidden="true"
        >
          {{ iniciales }}
        </span>
        <span class="truncate">
          {{ data.jefeReemplazo ? t("arbol.reemplazo", { nombre: data.jefe.nombre }) : data.jefe.nombre }}
        </span>
      </template>
      <span v-else class="text-amber-700 dark:text-amber-400">{{ t("arbol.sinJefatura") }}</span>
    </div>
    <div class="flex items-center gap-1.5" :class="compacta ? 'ml-auto' : 'mt-auto'">
      <!-- Seleccionada y compacta: el lugar es de los botones. -->
      <span
        v-if="config.mostrarDotacion && !(compacta && sola)"
        class="flex items-center gap-1"
        :title="t('arbol.dotacion')"
      >
        <Users class="size-3.5" aria-hidden="true" />
        <span class="sr-only">{{ t("arbol.dotacion") }}:</span>{{ data.total }}
      </span>
      <span
        v-if="config.mostrarVacantes && data.vacantes && !(compacta && sola)"
        class="rounded-full bg-marca px-1.5 text-marca-foreground"
        :title="t('arbol.vacantes', data.vacantes)"
      >
        <span :class="compacta && 'sr-only'">{{ t("arbol.vacantes", data.vacantes) }}</span>
        <span v-if="compacta" aria-hidden="true">{{ data.vacantes }}</span>
      </span>
      <span class="ml-auto flex gap-1">
        <template v-if="sola">
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
            v-if="!soloLectura"
            type="button"
            class="nodrag grid size-5 place-items-center rounded border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('arbol.nuevaSubunidad')"
            :title="t('arbol.nuevaSubunidad')"
            @click.stop="nuevaUnidad(data.unidad)"
          >
            <Plus class="size-3" aria-hidden="true" />
          </button>
          <button
            v-if="!soloLectura"
            type="button"
            class="nodrag grid size-5 place-items-center rounded border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('unidad.duplicar')"
            :title="t('unidad.duplicar')"
            @click.stop="duplicar(id)"
          >
            <Copy class="size-3" aria-hidden="true" />
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
    <Handle type="source" :position="horizontal ? Position.Right : Position.Bottom" class="opacity-0" />
  </div>
</template>
