<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Plus, X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textoSobre } from "@/features/tema/tema";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";

// Etiquetas de la unidad: quitar, agregar una existente o crear una con color (sin duplicar nombres).
const props = defineProps<{ unidadId: string }>();
const { t } = useI18n();
const org = useOrganizacion();

const ids = computed(
  () => new Set(org.unidadEtiquetas.filter((x) => x.unidad_id === props.unidadId).map((x) => x.etiqueta_id)),
);
const puestas = computed(() => org.etiquetas.filter((e) => ids.value.has(e.id)));
const libres = computed(() => org.etiquetas.filter((e) => !ids.value.has(e.id)));

const NUEVA = "__nueva__";
const creando = ref(false);
const nombre = ref("");
const color = ref("#c8743f");

const avisar = (r: Resultado) => !r.ok && toast.error(r.mensaje);

async function elegir(e: Event) {
  const el = e.target as HTMLSelectElement;
  const v = el.value;
  el.value = ""; // «Agregar etiqueta…» no es un valor: el select vuelve a su aviso
  if (v === NUEVA) creando.value = true;
  else if (v) avisar(await org.etiquetar(props.unidadId, v));
}

async function crear() {
  const r = await org.crearEtiqueta(nombre.value, color.value, props.unidadId);
  if (!r.ok && r.existente) {
    // Ya hay una con ese nombre: se usa esa, sin duplicar.
    toast.info(
      t("ficha.selector.yaExistia", { nombre: org.etiquetas.find((x) => x.id === r.existente)?.nombre }),
    );
    if (!ids.value.has(r.existente)) avisar(await org.etiquetar(props.unidadId, r.existente));
  } else if (!r.ok) return void toast.error(r.mensaje);
  creando.value = false;
  nombre.value = "";
}
</script>

<template>
  <div class="grid gap-2">
    <ul v-if="puestas.length" class="flex flex-wrap gap-1.5" :aria-label="t('unidad.etiquetas')">
      <li
        v-for="e in puestas"
        :key="e.id"
        class="flex items-center gap-1 rounded-full py-0.5 pr-0.5 pl-2 text-xs font-medium"
        :style="{ background: e.color, color: textoSobre(e.color) }"
      >
        {{ e.nombre }}
        <button
          type="button"
          class="grid size-4 place-items-center rounded-full hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('unidad.quitarEtiqueta', { nombre: e.nombre })"
          @click="async () => avisar(await org.quitarEtiqueta(unidadId, e.id))"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">{{ t("unidad.sinEtiquetas") }}</p>
    <select
      class="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
      :aria-label="t('unidad.agregarEtiqueta')"
      @change="elegir"
    >
      <option value="">{{ t("unidad.agregarEtiqueta") }}</option>
      <option v-for="e in libres" :key="e.id" :value="e.id">{{ e.nombre }}</option>
      <option :value="NUEVA">{{ t("unidad.nuevaEtiqueta") }}</option>
    </select>
    <form
      v-if="creando"
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="crear"
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
  </div>
</template>
