<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Puesto } from "@/db/tipos";
import { textoSobre } from "@/features/tema/tema";
import { useOrganizacion } from "@/stores/organizacion";
import { useEstilo } from "./useEstilo";

// Leyenda del puesto: elegir una entrada (o crear una), copiar/pegar el estilo y quitarlo.
const props = defineProps<{ puesto: Puesto }>();
const { t } = useI18n();
const org = useOrganizacion();
const { copiar, pegar } = useEstilo();
const uid = useId();

const NUEVA = "__nueva__";
const actual = computed(() => org.leyendas.find((l) => l.id === props.puesto.leyenda_id));
// La entrada actual se muestra aunque la hayan desactivado, marcada como inactiva.
const inactiva = computed(() => !!actual.value && !!actual.value.deleted_at);

const selector = ref<HTMLSelectElement | null>(null);
const formulario = ref<HTMLFormElement | null>(null);
const creando = ref(false);
const nuevoNombre = ref("");
const nuevoColor = ref("#c8743f");
const nuevaDescripcion = ref("");
const error = ref("");

async function asignar(id: string | null) {
  const r = await org.asignarLeyenda(props.puesto.id, id);
  if (!r.ok) toast.error(r.mensaje);
}

async function elegir(e: Event) {
  const el = e.target as HTMLSelectElement;
  if (el.value !== NUEVA) return asignar(el.value || null);
  el.value = props.puesto.leyenda_id ?? ""; // «Nueva entrada…» no es un valor: abre el formulario
  creando.value = true;
  nuevoNombre.value = nuevaDescripcion.value = error.value = "";
  await nextTick();
  formulario.value?.querySelector("input")?.focus();
}

function cancelar() {
  creando.value = false;
  void nextTick(() => selector.value?.focus());
}

async function crear() {
  error.value = "";
  if (!nuevoNombre.value.trim()) return void (error.value = t("leyenda.errorNombre"));
  const r = await org.crearLeyenda(
    { nombre: nuevoNombre.value, color: nuevoColor.value, descripcion: nuevaDescripcion.value },
    props.puesto.id,
  );
  if (r.ok) return cancelar();
  if (r.existente) {
    // Ya hay una entrada con ese nombre: se usa esa, sin duplicar.
    toast.info(
      t("ficha.selector.yaExistia", { nombre: org.leyendas.find((l) => l.id === r.existente)?.nombre }),
    );
    await asignar(r.existente);
    return cancelar();
  }
  error.value = r.mensaje;
}
</script>

<template>
  <section class="grid gap-2" :aria-labelledby="`${uid}-titulo`">
    <h3 :id="`${uid}-titulo`" class="text-sm font-medium">{{ t("leyenda.titulo") }}</h3>
    <div class="flex flex-wrap items-center gap-2">
      <select
        ref="selector"
        class="h-8 min-w-48 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        :aria-labelledby="`${uid}-titulo`"
        :value="puesto.leyenda_id ?? ''"
        @change="elegir"
      >
        <option value="">{{ t("leyenda.sin") }}</option>
        <option v-if="inactiva && actual" :value="actual.id">
          {{ actual.nombre }} {{ t("leyenda.inactiva") }}
        </option>
        <option v-for="l in org.leyendasActivas" :key="l.id" :value="l.id">{{ l.nombre }}</option>
        <option :value="NUEVA">{{ t("leyenda.nueva") }}</option>
      </select>
      <span
        v-if="actual"
        class="rounded px-2 py-0.5 text-xs font-medium"
        :style="{ background: actual.color, color: textoSobre(actual.color) }"
        >{{ actual.nombre }}</span
      >
      <Button type="button" size="sm" variant="outline" @click="copiar(puesto.id)">
        {{ t("leyenda.copiar") }}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        :disabled="!org.puedePegarEstilo"
        @click="pegar(puesto.id)"
      >
        {{ t("leyenda.pegar") }}
      </Button>
      <Button type="button" size="sm" variant="outline" :disabled="!puesto.leyenda_id" @click="asignar(null)">
        {{ t("leyenda.quitar") }}
      </Button>
    </div>
    <p v-if="actual?.descripcion" class="text-xs text-muted-foreground">{{ actual.descripcion }}</p>

    <form
      v-if="creando"
      ref="formulario"
      class="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]"
      @submit.prevent="crear"
      @keydown.esc.stop="cancelar"
    >
      <div class="grid gap-1.5">
        <Label :for="`${uid}-nombre`">{{ t("leyenda.nombre") }}</Label>
        <Input :id="`${uid}-nombre`" v-model="nuevoNombre" autocomplete="off" />
      </div>
      <div class="grid gap-1.5">
        <Label :for="`${uid}-color`">{{ t("leyenda.color") }}</Label>
        <input
          :id="`${uid}-color`"
          v-model="nuevoColor"
          type="color"
          class="h-8 w-14 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <div class="grid gap-1.5 sm:col-span-2">
        <Label :for="`${uid}-descripcion`">{{ t("leyenda.descripcion") }}</Label>
        <Input :id="`${uid}-descripcion`" v-model="nuevaDescripcion" autocomplete="off" />
      </div>
      <p v-if="error" role="alert" class="text-sm text-destructive sm:col-span-2">{{ error }}</p>
      <div class="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" @click="cancelar">{{ t("leyenda.cancelar") }}</Button>
        <Button type="submit">{{ t("leyenda.crear") }}</Button>
      </div>
    </form>
  </section>
</template>
