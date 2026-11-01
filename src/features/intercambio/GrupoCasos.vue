<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { revisionPagina, type AccionMasiva, type Eleccion, type FilaCaso as Fila, type TipoCaso } from "@/db/cliente";
import { claseSelect } from "@/lib/utils";
import FilaCaso from "./FilaCaso.vue";
import { intentar } from "./intercambio";

const POR_PAGINA = 50;

const props = defineProps<{
  trabajo: string;
  tipo: TipoCaso;
  total: number;
  tablas: { tabla: string; total: number }[];
  recarga: number;
  generacion: number;
  dudosas: boolean;
}>();
const emit = defineEmits<{
  decidir: [tabla: string, id: string, eleccion: Eleccion];
  enBloque: [accion: AccionMasiva, tipo: TipoCaso | null];
}>();
const { t, locale } = useI18n();
const idLista = useId();

const abierto = ref(false);
const tabla = ref("");
const soloDudosas = ref(false);
const desde = ref(0);
const filas = ref<Fila[]>([]);
const cuantos = ref(0);
const cargando = ref(false);
const error = ref("");

let peticion = 0;
async function cargar() {
  if (!abierto.value) return;
  const propia = ++peticion;
  cargando.value = true;
  const r = await intentar(() =>
    revisionPagina(props.trabajo, {
      tipo: props.tipo,
      tabla: tabla.value || null,
      soloDudosas: soloDudosas.value,
      desde: desde.value,
      cuantos: POR_PAGINA,
    }),
  );
  if (propia !== peticion) return;
  cargando.value = false;
  if (!r.ok) {
    error.value = r.mensaje;
    return;
  }
  error.value = "";
  filas.value = r.valor.filas;
  cuantos.value = r.valor.total;
}

watch([abierto, tabla, soloDudosas], () => {
  desde.value = 0;
  void cargar();
});
watch(desde, cargar);
// tras un cambio en bloque; una decisión suelta no recarga, para no mover la fila que se está mirando
watch(
  () => props.recarga,
  () => void cargar(),
);

function ir(delta: number) {
  desde.value = Math.max(0, desde.value + delta);
}
const fin = computed(() => Math.min(desde.value + POR_PAGINA, cuantos.value));
const n = (x: number) => x.toLocaleString(locale.value);

function alDecidir(f: Fila, e: Eleccion) {
  f.eleccion = e;
  emit("decidir", f.tabla, f.id, e);
}

const conFechas = computed(() =>
  ["diferente", "borrado_vs_editado", "borrado_sin_conflicto"].includes(props.tipo),
);
const acciones = computed<AccionMasiva[]>(() => {
  switch (props.tipo) {
    case "diferente":
      return ["todo_mio", "todo_archivo"];
    case "nuevo":
      return ["agregar_todo", "omitir_todo"];
    case "borrado_vs_editado":
    case "borrado_sin_conflicto":
      return ["mantener_todo", "borrar_todo", "restaurar_todo"];
    case "duplicado_persona":
      return ["unir_todo_mio"];
    default:
      return [];
  }
});
</script>

<template>
  <section class="rounded-lg border">
    <div class="flex flex-wrap items-center gap-2 p-2">
      <button
        type="button"
        class="flex min-w-0 grow items-center gap-2 rounded p-1 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
        :aria-expanded="abierto"
        :aria-controls="idLista"
        @click="abierto = !abierto"
      >
        <ChevronRight class="size-4 shrink-0 transition-transform" :class="abierto && 'rotate-90'" aria-hidden="true" />
        <span>{{ t(`intercambio.revisar.grupo.${tipo}.titulo`) }}</span>
        <span class="rounded-full bg-muted px-2 text-xs tabular-nums">{{ n(total) }}</span>
      </button>
      <div v-if="acciones.length" class="flex flex-wrap gap-1">
        <Button
          v-for="a in acciones"
          :key="a"
          type="button"
          variant="outline"
          size="sm"
          @click="emit('enBloque', a, tipo)"
        >
          {{ t(`intercambio.revisar.masivo.${a}`) }}
        </Button>
      </div>
    </div>
    <p class="px-3 pb-2 text-sm text-muted-foreground">{{ t(`intercambio.revisar.grupo.${tipo}.ayuda`) }}</p>

    <div v-if="abierto" :id="idLista" class="grid gap-2 border-t p-3">
      <div class="flex flex-wrap items-center gap-3">
        <label v-if="tablas.length > 1" class="flex items-center gap-2 text-sm">
          {{ t("intercambio.revisar.verTabla") }}
          <select v-model="tabla" :class="claseSelect" class="w-auto">
            <option value="">{{ t("intercambio.revisar.todas") }}</option>
            <option v-for="x in tablas" :key="x.tabla" :value="x.tabla">
              {{ t(`intercambio.tablas.${x.tabla}`) }} ({{ n(x.total) }})
            </option>
          </select>
        </label>
        <label v-if="dudosas && conFechas" class="flex items-center gap-2 text-sm">
          <input v-model="soloDudosas" type="checkbox" />
          {{ t("intercambio.revisar.soloDudosas") }}
        </label>
      </div>

      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <p v-else-if="!cargando && !filas.length" class="text-sm text-muted-foreground">
        {{ t("intercambio.revisar.sinFilas") }}
      </p>
      <ul class="grid gap-2" :aria-busy="cargando">
        <FilaCaso
          v-for="f in filas"
          :key="`${generacion}:${f.tabla}:${f.id}`"
          :trabajo="trabajo"
          :fila="f"
          @decidir="(e: Eleccion) => alDecidir(f, e)"
        />
      </ul>

      <nav
        v-if="cuantos > POR_PAGINA"
        class="flex flex-wrap items-center gap-2 text-sm"
        :aria-label="t('intercambio.revisar.paginas')"
      >
        <Button type="button" variant="outline" size="sm" :disabled="desde === 0" @click="ir(-POR_PAGINA)">
          {{ t("intercambio.revisar.anterior") }}
        </Button>
        <Button type="button" variant="outline" size="sm" :disabled="fin >= cuantos" @click="ir(POR_PAGINA)">
          {{ t("intercambio.revisar.siguiente") }}
        </Button>
        <span aria-live="polite" class="tabular-nums text-muted-foreground">
          {{ t("intercambio.revisar.rango", { desde: n(desde + 1), hasta: n(fin), total: n(cuantos) }) }}
        </span>
      </nav>
    </div>
  </section>
</template>
