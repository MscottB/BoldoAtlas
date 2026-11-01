<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { revisionBloqueos, type AccionMasiva, type Eleccion, type FilaBloqueo } from "@/db/cliente";
import ElegirReasignacion from "./ElegirReasignacion.vue";
import { intentar } from "./intercambio";

const POR_PAGINA = 50;

const props = defineProps<{
  trabajo: string;
  recarga: number;
  resolverRotas: boolean;
  referencias: number;
}>();
const emit = defineEmits<{
  decidir: [tabla: string, id: string, eleccion: Eleccion];
  enBloque: [accion: AccionMasiva];
}>();
const { t, locale } = useI18n();

const filas = ref<FilaBloqueo[]>([]);
const cuantos = ref(0);
const desde = ref(0);
const error = ref("");
let peticion = 0;
async function cargar() {
  const propia = ++peticion;
  const r = await intentar(() => revisionBloqueos(props.trabajo, desde.value, POR_PAGINA));
  if (propia !== peticion) return;
  if (!r.ok) {
    error.value = r.mensaje;
    return;
  }
  error.value = "";
  filas.value = r.valor.filas;
  cuantos.value = r.valor.total;
  if (desde.value >= cuantos.value && desde.value > 0) desde.value = 0;
}
onMounted(cargar);
watch(() => props.recarga, cargar);
watch(desde, cargar);

const fin = computed(() => Math.min(desde.value + POR_PAGINA, cuantos.value));
const n = (x: number) => x.toLocaleString(locale.value);
const nombreDe = (f: FilaBloqueo) => f.nombre || t("intercambio.revisar.sinNombre");
const claveTexto = (f: FilaBloqueo) =>
  f.eleccion ? `intercambio.revisar.bloqueoResuelto.${f.tipo}` : `intercambio.revisar.bloqueo.${f.tipo}`;
const clave = (f: FilaBloqueo) => `${f.tabla}:${f.id}:${f.columna ?? ""}`;
const quitar = (f: FilaBloqueo) => emit("decidir", f.tabla, f.id, { que: "quitar", columna: f.columna });
const decidir = (f: FilaBloqueo, e: Eleccion) => emit("decidir", f.tabla, f.id, e);
const queResuelto = (f: FilaBloqueo) => {
  if (!f.eleccion) return "";
  if (f.eleccion.que === "reasignar") return t("intercambio.revisar.reasignadaA", { nombre: f.reasignadoA ?? "" });
  return t(`intercambio.revisar.resuelto.${f.eleccion.que}`);
};
</script>

<template>
  <section v-if="cuantos" class="grid gap-2 rounded-lg border p-3" :aria-label="t('intercambio.revisar.tituloBloqueos')">
    <h3 class="text-sm font-medium">{{ t("intercambio.revisar.tituloBloqueos") }}</h3>
    <div v-if="referencias || resolverRotas" class="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        @click="emit('enBloque', resolverRotas ? 'no_resolver_rotas' : 'resolver_rotas')"
      >
        {{ t(resolverRotas ? "intercambio.revisar.noResolverRotas" : "intercambio.revisar.resolverRotas") }}
      </Button>
      <p class="text-sm text-muted-foreground">{{ t("intercambio.revisar.resolverRotasAyuda") }}</p>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <ul class="grid gap-2">
      <li v-for="f in filas" :key="clave(f)" class="grid gap-2 rounded border p-2 text-sm">
        <p class="break-words">
          {{
            t(claveTexto(f), {
              nombre: nombreDe(f),
              tabla: t(`intercambio.tablas.${f.tabla}`),
              otro: f.otro || t("intercambio.revisar.algoQueNoEsta"),
            })
          }}
        </p>
        <p v-if="f.eleccion" class="flex flex-wrap items-center gap-2 text-muted-foreground">
          {{ queResuelto(f) }}
          <Button type="button" variant="ghost" size="sm" @click="quitar(f)">{{ t("intercambio.revisar.deshacer") }}</Button>
        </p>
        <div v-else-if="f.tipo === 'unica' || f.tipo === 'regla'" class="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" @click="decidir(f, { que: 'conservar_mio' })">
            {{ t("intercambio.revisar.conservarMio") }}
          </Button>
          <Button
            v-if="f.tipo === 'unica'"
            type="button"
            size="sm"
            variant="outline"
            @click="decidir(f, { que: 'conservar_archivo' })"
          >
            {{ t("intercambio.revisar.conservarArchivo") }}
          </Button>
        </div>
        <div v-else-if="f.columna" class="flex flex-wrap items-center gap-2">
          <ElegirReasignacion
            :trabajo="trabajo"
            :destino="f.destino ?? 'unidades'"
            :nombre="nombreDe(f)"
            @elegir="(a: string) => decidir(f, { que: 'reasignar', columna: f.columna!, a })"
          />
          <Button
            v-if="f.vaciable"
            type="button"
            size="sm"
            variant="outline"
            @click="decidir(f, { que: 'vaciar', columna: f.columna })"
          >
            {{ t(f.tipo === "ciclo" ? "intercambio.revisar.dejarRaiz" : "intercambio.revisar.dejarVacio") }}
          </Button>
          <Button
            v-if="f.tipo !== 'ciclo'"
            type="button"
            size="sm"
            variant="outline"
            @click="decidir(f, { que: 'descartar', columna: f.columna })"
          >
            {{ t("intercambio.revisar.descartarFila") }}
          </Button>
        </div>
      </li>
    </ul>
    <nav v-if="cuantos > POR_PAGINA" class="flex flex-wrap items-center gap-2 text-sm" :aria-label="t('intercambio.revisar.paginas')">
      <Button type="button" variant="outline" size="sm" :disabled="desde === 0" @click="desde = Math.max(0, desde - POR_PAGINA)">
        {{ t("intercambio.revisar.anterior") }}
      </Button>
      <Button type="button" variant="outline" size="sm" :disabled="fin >= cuantos" @click="desde += POR_PAGINA">
        {{ t("intercambio.revisar.siguiente") }}
      </Button>
      <span aria-live="polite" class="tabular-nums text-muted-foreground">
        {{ t("intercambio.revisar.rango", { desde: n(desde + 1), hasta: n(fin), total: n(cuantos) }) }}
      </span>
    </nav>
  </section>
</template>
