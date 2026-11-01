<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRouter,
  type RouteLocationNormalized,
} from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ChevronRight, Copy, Save } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { exportarGuardar, exportarPreparar, type ResumenExportacion } from "@/db/cliente";
import { indiceHijos } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import BarraAvance from "./BarraAvance.vue";
import { conFilas, filasVisibles, intentar, useAvance, useTrabajo } from "./intercambio";

const emit = defineEmits<{ terminar: [] }>();
const { t } = useI18n();
const router = useRouter();
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
  const r = await intentar(() => exportarPreparar(propio, modo.value === "todo" ? null : [...marcadas.value]));
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
  paso.value = "trabajando";
  avance.value = null;
  const r = await intentar(() => exportarGuardar(propio));
  if (trabajo.actual.value !== propio) return;
  if (!r.ok) {
    // otro nombre es otro intento: la copia sigue preparada
    return fallar(r.mensaje, r.codigo, r.codigo === "ya_existe" ? "resumen" : "alcance");
  }
  if (!r.valor) {
    paso.value = "resumen"; // no se eligió un lugar: la copia sigue preparada
    return;
  }
  codigo.value = r.valor.codigo;
  nombreArchivo.value = r.valor.nombre;
  copiado.value = false;
  paso.value = "codigo";
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(codigo.value);
    copiado.value = true;
    toast.success(t("intercambio.exportar.copiado"));
  } catch {
    toast.error(t("intercambio.exportar.errorCopiar"));
  }
}

async function cancelar() {
  paso.value = "alcance";
  await trabajo.soltar();
}

// Salir sin copiar el código deja un archivo que nadie puede abrir: se pregunta una vez.
const preguntando = ref(false);
let destinoPendiente: RouteLocationNormalized | null = null;
const faltaCopiar = () => paso.value === "codigo" && !copiado.value;
function retener(destino: RouteLocationNormalized) {
  if (!faltaCopiar()) return true;
  destinoPendiente = destino;
  preguntando.value = true;
  return false;
}
onBeforeRouteLeave(retener);
onBeforeRouteUpdate(retener);

function terminar() {
  codigo.value = "";
  copiado.value = true;
  emit("terminar");
}
function listo() {
  if (faltaCopiar()) preguntando.value = true;
  else terminar();
}
function salirSinCopiar() {
  const destino = destinoPendiente;
  destinoPendiente = null;
  codigo.value = "";
  copiado.value = true;
  if (destino) void router.push(destino);
  else emit("terminar");
}

onUnmounted(() => {
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
        <Button type="button" @click="listo">{{ t("intercambio.listo") }}</Button>
      </div>
    </template>

    <AlertDialog v-model:open="preguntando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("intercambio.exportar.sinCopiarTitulo") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("intercambio.exportar.sinCopiarTexto") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("intercambio.exportar.seguirAqui") }}</AlertDialogCancel>
          <AlertDialogAction @click="salirSinCopiar">{{ t("intercambio.exportar.salirSinCopiar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
