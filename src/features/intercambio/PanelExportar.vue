<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ChevronRight, Copy, Save } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  exportarElegirDestino,
  exportarGuardar,
  exportarPreparar,
  type ResumenExportacion,
} from "@/db/cliente";
import { indiceHijos } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import BarraAvance from "./BarraAvance.vue";
import {
  codigoSinCopiar,
  conFilas,
  copiarCodigo,
  filasVisibles,
  intentar,
  intentarTrabajo,
  useAvance,
  useTrabajo,
} from "./intercambio";

const emit = defineEmits<{ terminar: [] }>();
const { t } = useI18n();
const org = useOrganizacion();
const trabajo = useTrabajo();
const avance = useAvance(() => trabajo.actual.value);

type Paso = "alcance" | "trabajando" | "resumen" | "codigo";
const paso = ref<Paso>("alcance");
const modo = ref<"todo" | "ramas">("todo");

// Al cambiar de paso, el foco va al título: lector de pantalla y teclado siguen el asistente.
const titulo = ref<HTMLElement | null>(null);
watch(paso, () => nextTick(() => titulo.value?.focus()));

const indice = computed(() => indiceHijos(org.unidades));
// Se abre mostrando los árboles y su primer nivel: quien quiere una rama suele buscarla ahí.
const abiertas = ref(new Set(org.raices.map((r) => r.id)));
const marcadas = ref(new Set<string>());
const filas = computed(() => filasVisibles(indice.value, abiertas.value, marcadas.value));
const conmutar = (conjunto: Set<string>, id: string) =>
  conjunto.has(id) ? conjunto.delete(id) : conjunto.add(id);

const resumen = ref<ResumenExportacion | null>(null);
const puedeSeguir = computed(() => modo.value === "todo" || marcadas.value.size > 0);
const cortes = computed(() => {
  const c = resumen.value?.cortes;
  return c
    ? (["conexiones", "jefaturas", "roles", "vistas", "asignaciones"] as const).filter((k) => c[k] > 0)
    : [];
});
const filasResumen = computed(() => conFilas(resumen.value?.filas ?? [], (f) => f.filas));

const fallar = (mensaje: string, codigo: string, volverA: Paso) => {
  paso.value = volverA;
  if (codigo !== "cancelado") toast.error(mensaje);
};

async function preparar() {
  const propio = trabajo.nuevo();
  paso.value = "trabajando";
  avance.value = null;
  const r = await intentarTrabajo(t("trabajos.exportarPreparar"), () =>
    exportarPreparar(propio, modo.value === "todo" ? null : [...marcadas.value]),
  );
  if (trabajo.actual.value !== propio) return; // se canceló: lo que llega tarde no cambia nada
  if (!r.ok) return fallar(r.mensaje, r.codigo, "alcance");
  resumen.value = r.valor;
  paso.value = "resumen";
}

// El código vive solo aquí, hasta cerrar esta pantalla.
const codigo = ref("");
const nombreArchivo = ref("");
const copiado = ref(false);
async function guardar() {
  const propio = trabajo.actual.value;
  if (!propio) return;
  // el diálogo de archivos no es un trabajo: espera al usuario, y cerrar no interrumpiría nada
  const elegido = await intentar(() => exportarElegirDestino(propio));
  if (trabajo.actual.value !== propio) return;
  if (!elegido.ok) return fallar(elegido.mensaje, elegido.codigo, "resumen"); // la copia sigue preparada
  if (!elegido.valor) return;
  paso.value = "trabajando";
  avance.value = null;
  const r = await intentarTrabajo(t("trabajos.exportarGuardar"), () => exportarGuardar(propio));
  if (trabajo.actual.value !== propio) return;
  if (!r.ok) return fallar(r.mensaje, r.codigo, "alcance");
  codigo.value = r.valor.codigo;
  nombreArchivo.value = r.valor.nombre;
  copiado.value = false;
  paso.value = "codigo";
}

async function copiar() {
  if (await copiarCodigo(codigo.value)) copiado.value = true;
}

async function cancelar() {
  paso.value = "alcance";
  await trabajo.soltar();
}

onUnmounted(() => {
  // salir sin copiarlo no lo pierde sin avisar: sigue visible en un diálogo global
  if (paso.value === "codigo" && !copiado.value) codigoSinCopiar.value = codigo.value;
  codigo.value = "";
  void trabajo.soltar();
});
</script>

<template>
  <div class="grid gap-4">
    <h2 ref="titulo" tabindex="-1" class="font-medium outline-none">{{ t("intercambio.exportar.titulo") }}</h2>

    <template v-if="paso === 'alcance'">
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">{{ t("intercambio.exportar.queLlevar") }}</legend>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="modo" type="radio" value="todo" />
          {{ t("intercambio.exportar.todo") }}
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="modo" type="radio" value="ramas" />
          {{ t("intercambio.exportar.ramas") }}
        </label>
      </fieldset>

      <div v-if="modo === 'ramas'" class="grid gap-2">
        <p class="text-sm text-muted-foreground">{{ t("intercambio.exportar.ramasAyuda") }}</p>
        <ul class="max-h-96 overflow-auto rounded-lg border p-2 text-sm">
          <li
            v-for="f in filas"
            :key="f.unidad.id"
            class="flex items-center gap-1 py-0.5"
            :style="{ paddingLeft: `${f.nivel * 1.25}rem` }"
          >
            <button
              v-if="f.tieneHijos"
              type="button"
              class="rounded-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              :aria-expanded="abiertas.has(f.unidad.id)"
              :aria-label="t('intercambio.exportar.verRama', { nombre: f.unidad.nombre })"
              @click="conmutar(abiertas, f.unidad.id)"
            >
              <ChevronRight
                class="size-4 transition-transform"
                :class="abiertas.has(f.unidad.id) && 'rotate-90'"
                aria-hidden="true"
              />
            </button>
            <span v-else class="w-4 shrink-0" />
            <label class="flex min-w-0 items-center gap-2" :class="f.cubierta && 'text-muted-foreground'">
              <input
                type="checkbox"
                :checked="f.cubierta || marcadas.has(f.unidad.id)"
                :disabled="f.cubierta"
                @change="conmutar(marcadas, f.unidad.id)"
              />
              <span class="truncate">{{ f.unidad.nombre }}</span>
            </label>
          </li>
        </ul>
      </div>

      <div class="flex gap-2">
        <Button type="button" :disabled="!puedeSeguir" @click="preparar">
          {{ t("intercambio.continuar") }}
        </Button>
        <Button type="button" variant="outline" @click="emit('terminar')">
          {{ t("intercambio.cancelar") }}
        </Button>
      </div>
    </template>

    <BarraAvance v-else-if="paso === 'trabajando'" :avance="avance" cancelable @cancelar="cancelar" />

    <template v-else-if="paso === 'resumen' && resumen">
      <p class="text-sm">
        {{ t(resumen.parcial ? "intercambio.exportar.resumenRamas" : "intercambio.exportar.resumenTodo") }}
      </p>
      <dl class="grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1 text-sm">
        <template v-for="f in filasResumen" :key="f.tabla">
          <dt class="text-muted-foreground">{{ t(`intercambio.tablas.${f.tabla}`) }}</dt>
          <dd class="text-right tabular-nums">{{ f.filas }}</dd>
        </template>
      </dl>
      <div v-if="cortes.length" class="rounded-lg border bg-muted p-3 text-sm">
        <p class="font-medium">{{ t("intercambio.exportar.noVan") }}</p>
        <ul class="list-disc pl-5">
          <li v-for="k in cortes" :key="k">{{ t(`intercambio.exportar.corte.${k}`, resumen.cortes[k]) }}</li>
        </ul>
      </div>
      <div class="flex gap-2">
        <Button type="button" @click="guardar">
          <Save aria-hidden="true" />
          {{ t("intercambio.exportar.guardar") }}
        </Button>
        <Button type="button" variant="outline" @click="cancelar">{{ t("intercambio.cancelar") }}</Button>
      </div>
    </template>

    <template v-else-if="paso === 'codigo'">
      <p class="text-sm">{{ t("intercambio.exportar.guardado", { nombre: nombreArchivo }) }}</p>
      <div class="grid gap-2 rounded-lg border-2 border-marca bg-card p-4">
        <p class="text-sm font-medium">{{ t("intercambio.exportar.tuCodigo") }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <output class="font-mono text-lg font-semibold tracking-wider select-all">{{ codigo }}</output>
          <Button type="button" variant="outline" size="sm" @click="copiar">
            <Copy aria-hidden="true" />
            {{ t("intercambio.exportar.copiar") }}
          </Button>
        </div>
      </div>
      <ul class="list-disc pl-5 text-sm">
        <li>{{ t("intercambio.exportar.unaVez") }}</li>
        <li>{{ t("intercambio.exportar.canales") }}</li>
      </ul>
      <div>
        <Button type="button" @click="emit('terminar')">{{ t("intercambio.listo") }}</Button>
      </div>
    </template>
  </div>
</template>
