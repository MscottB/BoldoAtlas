<script setup lang="ts">
import { computed, inject, nextTick, useTemplateRef, watch, type Directive } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Handle, Position } from "@vue-flow/core";
import { toast } from "vue-sonner";
import { Copy, Minus, Plus, SquareArrowOutUpRight, Users } from "@lucide/vue";
import type { Etiqueta, Trabajador, Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { textoSobre } from "@/features/tema/tema";
import { useTema } from "@/features/tema/useTema";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";
import { tamUnidad } from "./vista";
import { rutaSuperiores } from "./jerarquia";
import { CONTEXTO_LIENZO } from "./contexto";

export interface DatosNodo {
  unidad: Unidad;
  jefe: Trabajador | null;
  /** La jefatura la cubre un reemplazo: el puesto no tiene titular vigente. */
  jefeReemplazo: boolean;
  total: number;
  vacantes: number;
  etiquetas: Etiqueta[];
  hijos: number;
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
const { escala } = useTema();
const contexto = inject(CONTEXTO_LIENZO)!;
// Marca efectiva según «Colorear por» (null = sin color) y superiores por tipo elegido (null = la vista no los muestra).
const marca = computed(() => contexto.marcas.value?.get(props.id) ?? null);
const ruta = computed(() =>
  contexto.rutas.value
    ? rutaSuperiores(contexto.rutas.value, props.data.unidad)
        .map((x) => x.nombre)
        .join(" › ")
    : null,
);
// Alejado y con muchas tarjetas, la ligera (rendimiento.ts); la que se está renombrando conserva su campo.
const ligera = computed(() => contexto.ligera.value && editando.value !== props.id);
// Si la tarjeta tenía el foco al cambiar de detalle, lo recibe su nuevo elemento (si no, caería en <body>).
const raiz = useTemplateRef<HTMLElement>("raiz");
watch(ligera, async (l) => {
  if (!raiz.value?.contains(document.activeElement)) return;
  await nextTick();
  (l ? raiz.value : raiz.value?.querySelector("button"))?.focus();
});

const compacta = computed(() => config.value.densidad === "compacta");
const horizontal = computed(() => config.value.direccion === "horizontal");
// Misma función que usa el layout: la tarjeta dibujada mide lo que elk reservó.
const tam = computed(() => {
  const { ancho, alto } = tamUnidad(config.value, ruta.value !== null, escala.value);
  return `width: ${ancho}px; height: ${alto}px`; // texto: si no cambia, la tarjeta no se vuelve a pintar
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
  <!-- Ligera: un solo elemento con el nombre y el color de la marca (más los puntos de conexión, que no reciben el puntero). -->
  <div
    v-if="ligera"
    ref="raiz"
    role="button"
    tabindex="0"
    :aria-pressed="seleccionada"
    class="line-clamp-2 rounded-lg border px-2 py-1 text-2xl leading-tight font-semibold break-words focus-visible:outline-4 focus-visible:outline-ring"
    :class="[
      seleccionada
        ? 'border-marca bg-marca text-marca-foreground ring-8 ring-marca'
        : !marca?.color && 'bg-card text-card-foreground',
      atenuada && 'opacity-35',
    ]"
    :style="[
      tam,
      marca?.color && !seleccionada ? { background: marca.color, color: textoSobre(marca.color) } : {},
    ]"
    @click="alHacerClic"
    @keydown.enter.self.prevent="seleccionar(id)"
    @keydown.space.self.prevent="seleccionar(id)"
  >
    <Handle type="target" :position="horizontal ? Position.Left : Position.Top" class="opacity-0" />
    {{ data.unidad.nombre }}
    <Handle type="source" :position="horizontal ? Position.Right : Position.Bottom" class="opacity-0" />
  </div>
  <!-- Nodo liviano: sin sombras ni transiciones (nota de rendimiento). -->
  <div
    v-else
    ref="raiz"
    class="flex rounded-lg border bg-card text-xs text-card-foreground"
    :class="[
      compacta ? 'items-center gap-1.5 px-2' : 'flex-col gap-1 p-2',
      seleccionada && 'border-marca ring-2 ring-marca',
      atenuada && 'opacity-35',
      marca?.color && 'border-l-4',
    ]"
    :style="[tam, marca?.color ? { borderLeftColor: marca.color } : {}]"
    @click="alHacerClic"
  >
    <Handle type="target" :position="horizontal ? Position.Left : Position.Top" class="opacity-0" />
    <div
      v-if="!compacta && (config.mostrarTipo || config.mostrarEtiquetas || marca?.codigo)"
      class="flex items-center justify-between text-muted-foreground"
    >
      <span class="flex min-w-0 items-center gap-1">
        <span v-if="config.mostrarTipo" class="truncate uppercase">{{ tipo }}</span>
        <span
          v-if="marca?.codigo"
          class="rounded px-1 text-[10px] font-semibold"
          :class="!marca.color && 'bg-muted text-foreground'"
          :style="marca.color ? { background: marca.color, color: textoSobre(marca.color) } : undefined"
          :title="marca.unidad.nombre"
        >
          {{ marca.codigo }}
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
    <span v-if="ruta && !compacta" class="truncate text-[11px] text-muted-foreground" :title="ruta">
      {{ ruta }}
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
