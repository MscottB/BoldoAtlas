<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ChevronsDownUp, Plus, Tag, Trash2, X } from "@lucide/vue";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { excluidasComoSuperior } from "@/features/unidades/panel";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { planEliminar } from "./multiple";
import { useLienzo } from "./useLienzo";

// Barra de 2 o más unidades seleccionadas: mover, plegar, etiquetar y eliminar todas de una vez.
const { t } = useI18n();
const org = useOrganizacion();
const { seleccion, seleccionadas, expandir, plegarSeleccion, pedidoEliminar } = useLienzo();

const ids = computed(() => [...seleccionadas.value]);
const avisar = (r: Resultado) => !r.ok && toast.error(r.mensaje);

// Mover a…: ni las seleccionadas ni lo que cuelga de ellas pueden ser el nuevo superior.
const excluidas = computed(
  () => new Set(ids.value.flatMap((id) => [...excluidasComoSuperior(org.unidades, id)])),
);
async function mover(destino: string | null) {
  const r = await org.moverUnidades(ids.value, destino);
  if (r.ok && destino) expandir(destino);
  else avisar(r);
}

// Etiquetar…: una existente o una nueva, para todas.
const NUEVA = "__nueva__";
const etiquetando = ref(false);
const creando = ref(false);
const nombre = ref("");
const color = ref("#c8743f");
watch(etiquetando, () => (creando.value = false));
async function elegirEtiqueta(e: Event) {
  const el = e.target as HTMLSelectElement;
  const v = el.value;
  el.value = ""; // «Agregar etiqueta…» no es un valor
  if (v === NUEVA) creando.value = true;
  else if (v) {
    etiquetando.value = false;
    avisar(await org.etiquetarUnidades(ids.value, v));
  }
}
async function crearEtiqueta() {
  const r = await org.crearEtiqueta(nombre.value, color.value, ids.value);
  if (!r.ok && r.existente) {
    // Ya hay una con ese nombre: se usa esa, sin duplicar.
    toast.info(
      t("ficha.selector.yaExistia", { nombre: org.etiquetas.find((x) => x.id === r.existente)?.nombre }),
    );
    avisar(await org.etiquetarUnidades(ids.value, r.existente));
  } else if (!r.ok) return void toast.error(r.mensaje);
  creando.value = etiquetando.value = false;
  nombre.value = "";
}

// Eliminar…: siempre se confirma. Las raíces con contenido no se eliminan (no tienen a dónde pasar su contenido).
const plan = computed(() => planEliminar(org.unidades, org.puestos, ids.value));
const eliminables = computed(() => plan.value.bajas.length);
const omitidas = computed(() => plan.value.omitidas.length);
const confirmando = ref(false);
function solicitarEliminar() {
  if (eliminables.value) confirmando.value = true;
  else toast.warning(t("store.raizConContenido"));
}
// Supr en el lienzo pide lo mismo que el botón.
watch(pedidoEliminar, solicitarEliminar);
async function eliminar() {
  const r = await org.eliminarUnidades(ids.value);
  if (!r.ok) return void toast.error(r.mensaje);
  seleccion.value = null; // deshace la selección múltiple
  toast(t("seleccion.eliminadas", { n: r.eliminadas }, r.eliminadas), {
    duration: 8000,
    action: { label: t("unidad.deshacer"), onClick: async () => avisar(await org.deshacer()) },
  });
  if (r.omitidas) toast.warning(t("seleccion.omitidas", { n: r.omitidas }, r.omitidas));
}
</script>

<template>
  <div
    role="toolbar"
    aria-orientation="horizontal"
    :aria-label="t('seleccion.barra')"
    class="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-1.5 text-card-foreground shadow-md"
  >
    <span class="px-1.5 text-sm font-medium" aria-live="polite">
      {{ t("seleccion.cantidad", { n: ids.length }, ids.length) }}
    </span>
    <div class="w-40">
      <SelectorUnidad
        :excluidas="excluidas"
        :texto="t('seleccion.moverA')"
        :ninguna="t('unidad.sinSuperior')"
        class="h-7 text-sm"
        @elegir="mover"
      />
    </div>
    <Button type="button" variant="outline" size="sm" @click="plegarSeleccion">
      <ChevronsDownUp aria-hidden="true" />
      {{ t("seleccion.plegar") }}
    </Button>
    <Popover v-model:open="etiquetando">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" size="sm">
          <Tag aria-hidden="true" />
          {{ t("seleccion.etiquetar") }}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" class="grid w-72 gap-2 p-3">
        <select
          class="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('unidad.agregarEtiqueta')"
          @change="elegirEtiqueta"
        >
          <option value="">{{ t("unidad.agregarEtiqueta") }}</option>
          <option v-for="e in org.etiquetas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          <option :value="NUEVA">{{ t("unidad.nuevaEtiqueta") }}</option>
        </select>
        <form
          v-if="creando"
          class="flex flex-wrap items-center gap-2"
          @submit.prevent="crearEtiqueta"
          @keydown.esc.stop="creando = false"
        >
          <Input
            v-model="nombre"
            class="h-8 min-w-32 flex-1"
            autocomplete="off"
            :aria-label="t('unidad.nombreEtiqueta')"
            :placeholder="t('unidad.nombreEtiqueta')"
          />
          <input
            v-model="color"
            type="color"
            class="h-8 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('unidad.colorEtiqueta')"
          />
          <Button type="submit" size="sm" :disabled="!nombre.trim()">
            <Plus aria-hidden="true" />
            {{ t("unidad.crearEtiqueta") }}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
    <Button
      type="button"
      variant="destructive"
      size="sm"
      :disabled="!eliminables"
      :title="eliminables ? undefined : t('store.raizConContenido')"
      @click="solicitarEliminar"
    >
      <Trash2 aria-hidden="true" />
      {{ t("seleccion.eliminar") }}
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      :aria-label="t('seleccion.limpiar')"
      :title="t('seleccion.limpiar')"
      @click="seleccion = null"
    >
      <X aria-hidden="true" />
    </Button>

    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t("seleccion.eliminarTitulo", { n: eliminables }, eliminables) }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ t("seleccion.eliminarTexto") }}
            <template v-if="omitidas">
              {{ t("seleccion.eliminarOmitidas", { n: omitidas }, omitidas) }}
            </template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("arbol.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="eliminar">
            {{ t("seleccion.eliminarConfirmar", { n: eliminables }, eliminables) }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
